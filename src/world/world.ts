import { hashViews } from '../core/hash';
import {
  Flora,
  isDeposit,
  isFertileTerrain,
  isWalkableTerrain,
  isWaterTerrain,
  terrainFromHeight,
  type BiomeId,
  type FloraId,
  type TerrainId,
} from './terrain';

export const CHUNK_SIZE = 32;
/** Lado de una zona de territorio (en casillas). */
export const ZONE_SIZE = 8;

/**
 * Estado del mapa en arrays tipados planos (índice = y * width + x).
 * Excepción documentada a la inmutabilidad: es estado de simulación mutable por rendimiento.
 */
export class World {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly heightMap: Uint8Array;
  readonly terrain: Uint8Array;
  readonly biome: Uint8Array;
  readonly grass: Uint8Array;
  readonly flora: Uint8Array;
  /** Edificio que ocupa cada casilla (id + 1; 0 = ninguno). */
  readonly buildingAt: Int32Array;
  /** 1 si un aldeano ya va a trabajar esa casilla (evita que dos vayan al mismo árbol). */
  readonly reserved: Uint8Array;
  /** Región (isla) conectada a la que pertenece cada casilla pisable (0 = no pisable). */
  readonly region: Int32Array;
  /** Mar (masa de agua conectada) de cada casilla de agua (0 = tierra). */
  readonly sea: Int32Array;
  /** Casillas de cada mar (índice = etiqueta); se deriva de `sea`. */
  seaSizes: number[] = [0];
  regionsDirty = true;
  readonly zonesX: number;
  readonly zonesY: number;
  /** Aldea dueña de cada zona (id + 1; 0 = libre). */
  readonly zoneOwner: Uint16Array;
  /** Fuego y lava por casilla (0 = nada; si no, intensidad o calor restante). */
  readonly fire: Uint8Array;
  readonly lava: Uint8Array;

  readonly chunksX: number;
  readonly chunksY: number;
  private readonly dirty: Uint8Array;
  private readonly dirtyList: number[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.heightMap = new Uint8Array(this.size);
    this.terrain = new Uint8Array(this.size);
    this.biome = new Uint8Array(this.size);
    this.grass = new Uint8Array(this.size);
    this.flora = new Uint8Array(this.size);
    this.buildingAt = new Int32Array(this.size);
    this.reserved = new Uint8Array(this.size);
    this.region = new Int32Array(this.size);
    this.sea = new Int32Array(this.size);
    this.zonesX = Math.ceil(width / ZONE_SIZE);
    this.zonesY = Math.ceil(height / ZONE_SIZE);
    this.zoneOwner = new Uint16Array(this.zonesX * this.zonesY);
    this.fire = new Uint8Array(this.size);
    this.lava = new Uint8Array(this.size);
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    this.dirty = new Uint8Array(this.chunksX * this.chunksY);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Coordenadas continuas (posición de una criatura) → ¿se puede pisar? */
  isWalkableAt(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * this.width + tx;
    return isWalkableTerrain(this.terrain[i]) && this.lava[i] === 0;
  }

  isWaterIdx(i: number): boolean {
    return isWaterTerrain(this.terrain[i]);
  }

  isFertileIdx(i: number): boolean {
    return isFertileTerrain(this.terrain[i]);
  }

  terrainAt(x: number, y: number): TerrainId {
    return this.terrain[this.idx(x, y)] as TerrainId;
  }

  /** Cambia la altura y recalcula la capa de terreno con sus consecuencias. */
  setHeight(i: number, h: number): void {
    const clamped = h < 0 ? 0 : h > 255 ? 255 : h | 0;
    if (this.heightMap[i] === clamped) return;
    this.heightMap[i] = clamped;
    const t = terrainFromHeight(clamped);
    if (this.terrain[i] !== t) {
      if (isWalkableTerrain(this.terrain[i]) !== isWalkableTerrain(t) || isWaterTerrain(this.terrain[i]) !== isWaterTerrain(t)) this.regionsDirty = true;
      this.terrain[i] = t;
      if (isWaterTerrain(t)) {
        this.flora[i] = Flora.NONE;
        this.grass[i] = 0;
        this.fire[i] = 0;
        this.lava[i] = 0;
      } else if (!isFertileTerrain(t)) {
        this.grass[i] = 0;
        if (this.flora[i] !== Flora.TREE && !isDeposit(this.flora[i])) this.flora[i] = Flora.NONE;
      }
    }
    this.markDirtyIdx(i);
  }

  setBiome(i: number, b: BiomeId): void {
    if (this.biome[i] === b) return;
    this.biome[i] = b;
    this.markDirtyIdx(i);
  }

  setFlora(i: number, f: FloraId): void {
    if (this.flora[i] === f) return;
    this.flora[i] = f;
    this.markDirtyIdx(i);
  }

  setGrass(i: number, g: number): void {
    const v = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    // Sólo se redibuja cuando cambia el escalón visual de la hierba.
    if ((this.grass[i] >> 6) !== (v >> 6)) this.markDirtyIdx(i);
    this.grass[i] = v;
  }

  markDirtyIdx(i: number): void {
    const x = i % this.width;
    const y = (i - x) / this.width;
    this.markChunkAt(x, y);
    // El color de una casilla depende de sus vecinas (relieve, espuma): si está en el borde
    // de un chunk, el chunk de al lado también se repinta.
    const ex = x % CHUNK_SIZE;
    const ey = y % CHUNK_SIZE;
    if (ex === 0 || ex === CHUNK_SIZE - 1 || ey === 0 || ey === CHUNK_SIZE - 1) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) this.markChunkAt(x + dx, y + dy);
    }
  }

  private markChunkAt(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const c = Math.floor(y / CHUNK_SIZE) * this.chunksX + Math.floor(x / CHUNK_SIZE);
    if (this.dirty[c] === 0) {
      this.dirty[c] = 1;
      this.dirtyList.push(c);
    }
  }

  /** Todos los datos por casilla en orden fijo (para guardar partidas). */
  dataViews(): ArrayBufferView[] {
    return [this.heightMap, this.terrain, this.biome, this.grass, this.flora, this.buildingAt, this.reserved, this.region, this.zoneOwner, this.fire, this.lava, this.sea];
  }

  markAllDirty(): void {
    for (let c = 0; c < this.dirty.length; c++) {
      if (this.dirty[c] === 0) {
        this.dirty[c] = 1;
        this.dirtyList.push(c);
      }
    }
  }

  /** Entrega y limpia la lista de chunks modificados (para el render). */
  consumeDirtyChunks(visit: (cx: number, cy: number) => void, max = Infinity): void {
    const n = Math.min(max, this.dirtyList.length);
    for (let k = 0; k < n; k++) {
      const c = this.dirtyList[k];
      this.dirty[c] = 0;
      visit(c % this.chunksX, Math.floor(c / this.chunksX));
    }
    this.dirtyList.splice(0, n);
  }

  hasDirtyChunks(): boolean {
    return this.dirtyList.length > 0;
  }

  /** Índice de la zona que contiene la casilla. */
  zoneIndex(x: number, y: number): number {
    return Math.floor(y / ZONE_SIZE) * this.zonesX + Math.floor(x / ZONE_SIZE);
  }

  /** Aldea dueña de la casilla (-1 si es tierra libre). */
  ownerAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return -1;
    return this.zoneOwner[this.zoneIndex(x, y)] - 1;
  }

  regionAt(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return this.inBounds(tx, ty) ? this.region[ty * this.width + tx] : 0;
  }

  /** Etiqueta las islas pisables y los mares con un relleno por inundación (BFS, 4 vecinos). */
  computeRegions(): void {
    const queue = new Int32Array(this.size);
    this.label(this.region, (t) => isWalkableTerrain(t), queue);
    this.seaSizes = this.label(this.sea, (t) => isWaterTerrain(t), queue);
    this.regionsDirty = false;
  }

  /** Sólo los mares (para partidas antiguas que no los guardaban). */
  computeSeas(): void {
    this.seaSizes = this.label(this.sea, (t) => isWaterTerrain(t), new Int32Array(this.size));
  }

  /** Recalcula el tamaño de cada mar a partir de `sea` (al cargar una partida). */
  rebuildSeaSizes(): void {
    const sizes = [0];
    for (let i = 0; i < this.size; i++) {
      const s = this.sea[i];
      while (sizes.length <= s) sizes.push(0);
      sizes[s]++;
    }
    sizes[0] = 0;
    this.seaSizes = sizes;
  }

  /** Relleno por inundación genérico; devuelve el tamaño de cada etiqueta. */
  private label(out: Int32Array, accept: (terrain: number) => boolean, queue: Int32Array): number[] {
    const { width: w, height: h, terrain } = this;
    out.fill(0);
    const sizes = [0];
    let label = 0;
    for (let start = 0; start < this.size; start++) {
      if (out[start] !== 0 || !accept(terrain[start])) continue;
      label++;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      out[start] = label;
      const visit = (j: number): void => {
        if (out[j] !== 0 || !accept(terrain[j])) return;
        out[j] = label;
        queue[tail++] = j;
      };
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (y > 0) visit(i - w);
        if (y < h - 1) visit(i + w);
      }
      sizes.push(tail);
    }
    return sizes;
  }

  /** Mar de la casilla (0 si es tierra o está fuera del mapa). */
  seaAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.sea[this.idx(x, y)] : 0;
  }

  stateHash(): number {
    return hashViews([this.heightMap, this.terrain, this.biome, this.grass, this.flora, this.buildingAt, this.reserved, this.zoneOwner, this.fire, this.lava]);
  }
}
