import { hashViews } from '../core/hash';
import {
  Flora,
  isFertileTerrain,
  isWalkableTerrain,
  isWaterTerrain,
  terrainFromHeight,
  type BiomeId,
  type FloraId,
  type TerrainId,
} from './terrain';

export const CHUNK_SIZE = 32;

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
    return isWalkableTerrain(this.terrain[ty * this.width + tx]);
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
      this.terrain[i] = t;
      if (isWaterTerrain(t)) {
        this.flora[i] = Flora.NONE;
        this.grass[i] = 0;
      } else if (!isFertileTerrain(t)) {
        this.grass[i] = 0;
        if (this.flora[i] !== Flora.TREE) this.flora[i] = Flora.NONE;
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

  stateHash(): number {
    return hashViews([this.heightMap, this.terrain, this.biome, this.grass, this.flora]);
  }
}
