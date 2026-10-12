import type { Rng } from '../core/rng';
import { BIOME_INFO, Flora, isFertileTerrain } from './terrain';
import type { World } from './world';

/** Ticks que tarda una pasada completa de vegetación sobre todo el mapa (5 s en x1). */
export const VEGETATION_PASS_TICKS = 50;

const SAPLING_GROW_CHANCE = 0.08;
const BERRY_REGROW_CHANCE = 0.15;
const TREE_DEATH_CHANCE = 0.0015;
const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Procesa una porción del mapa por tick (actualización escalonada):
 * crecimiento de hierba, retoños, bayas y expansión de bosques.
 */
export class VegetationSystem {
  private cursor = 0;
  private readonly tilesPerTick: number;

  constructor(private readonly world: World) {
    this.tilesPerTick = Math.ceil(world.size / VEGETATION_PASS_TICKS);
  }

  getCursor(): number {
    return this.cursor;
  }

  setCursor(value: number): void {
    this.cursor = value % this.world.size;
  }

  step(rng: Rng): void {
    const w = this.world;
    const end = Math.min(this.cursor + this.tilesPerTick, w.size);
    for (let i = this.cursor; i < end; i++) {
      if (!isFertileTerrain(w.terrain[i])) continue;
      this.growGrass(i);
      this.growFlora(i, rng);
    }
    this.cursor = end >= w.size ? 0 : end;
  }

  private growGrass(i: number): void {
    const w = this.world;
    const info = BIOME_INFO[w.biome[i]];
    const g = w.grass[i];
    if (g < info.grassMax) w.setGrass(i, Math.min(info.grassMax, g + info.grassRegrow));
    else if (g > info.grassMax) w.setGrass(i, info.grassMax);
  }

  private growFlora(i: number, rng: Rng): void {
    const w = this.world;
    const f = w.flora[i];
    if (f === Flora.SAPLING) {
      if (rng.chance(SAPLING_GROW_CHANCE)) w.setFlora(i, Flora.TREE);
    } else if (f === Flora.BUSH) {
      if (rng.chance(BERRY_REGROW_CHANCE)) w.setFlora(i, Flora.BERRY_BUSH);
    } else if (f === Flora.TREE) {
      if (rng.chance(TREE_DEATH_CHANCE)) {
        w.setFlora(i, Flora.NONE);
        return;
      }
      if (rng.chance(BIOME_INFO[w.biome[i]].treeSpread)) this.spreadSapling(i, rng);
    }
  }

  private spreadSapling(i: number, rng: Rng): void {
    const w = this.world;
    const x = i % w.width;
    const y = (i - x) / w.width;
    const [dx, dy] = NEIGHBORS[rng.int(NEIGHBORS.length)];
    const nx = x + dx * 2;
    const ny = y + dy * 2;
    if (!w.inBounds(nx, ny)) return;
    const j = w.idx(nx, ny);
    if (w.flora[j] === Flora.NONE && w.buildingAt[j] === 0 && isFertileTerrain(w.terrain[j])) w.setFlora(j, Flora.SAPLING);
  }
}
