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
      if (isWalkableTerrain(this.terrain[i]) !== isWalkableTerrain(t)) this.regionsDirty = true;
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
    const c = Math.floor(y / CHUNK_SIZE) * this.chunksX + Math.floor(x / CHUNK_SIZE);
    if (this.dirty[c] === 0) {
      this.dirty[c] = 1;
      this.dirtyList.push(c);
    }
  }

  /** Todos los datos por casilla en orden fijo (para guardar partidas). */
  dataViews(): ArrayBufferView[] {
    return [this.heightMap, this.terrain, this.biome, this.grass, this.flora, this.buildingAt, this.reserved, this.region, this.zoneOwner, this.fire, this.lava];
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
  consumeDirtyChunks(visit: (cx: number, cy: number) => void): void {
    for (const c of this.dirtyList) {
      this.dirty[c] = 0;
      visit(c % this.chunksX, Math.floor(c / this.chunksX));
    }
    this.dirtyList.length = 0;
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

  /** Etiqueta las islas pisables con un relleno por inundación (BFS, 4 vecinos). */
  computeRegions(): void {
    const { width: w, height: h, region } = this;
    region.fill(0);
    const queue = new Int32Array(this.size);
    let label = 0;
    for (let start = 0; start < this.size; start++) {
      if (region[start] !== 0 || !isWalkableTerrain(this.terrain[start])) continue;
      label++;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      region[start] = label;
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0) tail = this.visit(i - 1, label, queue, tail);
        if (x < w - 1) tail = this.visit(i + 1, label, queue, tail);
        if (y > 0) tail = this.visit(i - w, label, queue, tail);
        if (y < h - 1) tail = this.visit(i + w, label, queue, tail);
      }
    }
    this.regionsDirty = false;
  }

  private visit(j: number, label: number, queue: Int32Array, tail: number): number {
    if (this.region[j] !== 0 || !isWalkableTerrain(this.terrain[j])) return tail;
    this.region[j] = label;
    queue[tail] = j;
    return tail + 1;
  }

  stateHash(): number {
    return hashViews([this.heightMap, this.terrain, this.biome, this.grass, this.flora, this.buildingAt, this.reserved, this.zoneOwner, this.fire, this.lava]);
  }
}
