import type { Rng } from '../core/rng';
import { neutralClimate, type ClimateMods } from './climate';
import { BIOME_INFO, Biome, Flora, isFertileTerrain, isMagicBiome, isPlant } from './terrain';
import { ROAD_PATH, type World } from './world';

/** Desgaste que pierde un sendero en cada pasada (unos 24 al año). */
const ROAD_DECAY = 2;
/** Ticks que tarda una pasada completa de vegetación sobre todo el mapa (5 s en x1). */
export const VEGETATION_PASS_TICKS = 50;

const SAPLING_GROW_CHANCE = 0.08;
const BERRY_REGROW_CHANCE = 0.15;
const TREE_DEATH_CHANCE = 0.0015;
/** Probabilidad por pasada de que el yermo maldito marchite una planta. */
const BLIGHT_WITHER_CHANCE = 0.05;
const NEUTRAL = neutralClimate();
const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Distancia máxima (en cada eje) a la que cae un retoño. */
const SAPLING_REACH = 3;
/** Un retoño no brota si ya hay tantos árboles (o retoños) en sus 8 vecinas: el bosque deja claros. */
const MAX_TREE_NEIGHBORS = 3;

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

  step(rng: Rng, climate: ClimateMods = NEUTRAL, magicSpread = true): void {
    const w = this.world;
    const end = Math.min(this.cursor + this.tilesPerTick, w.size);
    for (let i = this.cursor; i < end; i++) {
      // Los senderos sin tránsito se van borrando (también en arena o roca).
      if (w.road[i] > 0) w.decayRoad(i, ROAD_DECAY);
      if (!isFertileTerrain(w.terrain[i])) continue;
      this.growGrass(i, climate.grass);
      this.growFlora(i, rng, climate.tree);
      if (magicSpread && isMagicBiome(w.biome[i])) this.spreadMagic(i, rng, climate.magic);
    }
    this.cursor = end >= w.size ? 0 : end;
  }

  private growGrass(i: number, mult: number): void {
    const w = this.world;
    const info = BIOME_INFO[w.biome[i]];
    const g = w.grass[i];
    const regrow = info.grassRegrow > 0 && mult > 0 ? Math.max(1, Math.round(info.grassRegrow * mult)) : 0;
    if (g < info.grassMax) w.setGrass(i, Math.min(info.grassMax, g + regrow));
    else if (g > info.grassMax) w.setGrass(i, info.grassMax);
  }

  private growFlora(i: number, rng: Rng, treeMult: number): void {
    const w = this.world;
    const f = w.flora[i];
    // El yermo maldito marchita lo que crece en él.
    if (w.biome[i] === Biome.BLIGHT && isPlant(f)) {
      if (rng.chance(BLIGHT_WITHER_CHANCE)) w.setFlora(i, Flora.NONE);
      return;
    }
    if (f === Flora.SAPLING) {
      if (rng.chance(SAPLING_GROW_CHANCE * treeMult)) w.setFlora(i, Flora.TREE);
    } else if (f === Flora.BUSH) {
      if (rng.chance(BERRY_REGROW_CHANCE)) w.setFlora(i, Flora.BERRY_BUSH);
    } else if (f === Flora.TREE) {
      if (rng.chance(TREE_DEATH_CHANCE)) {
        w.setFlora(i, Flora.NONE);
        return;
      }
      if (rng.chance(BIOME_INFO[w.biome[i]].treeSpread * treeMult)) this.spreadSapling(i, rng);
    }
  }

  /** Los biomas mágicos invaden poco a poco la tierra fértil vecina. */
  private spreadMagic(i: number, rng: Rng, mult: number): void {
    const w = this.world;
    const biome = w.biome[i];
    if (!rng.chance(BIOME_INFO[biome].spread * mult)) return;
    const x = i % w.width;
    const y = (i - x) / w.width;
    const [dx, dy] = NEIGHBORS[rng.int(NEIGHBORS.length)];
    if (!w.inBounds(x + dx, y + dy)) return;
    const j = w.idx(x + dx, y + dy);
    if (w.biome[j] === biome || !isFertileTerrain(w.terrain[j])) return;
    w.setBiome(j, biome as (typeof Biome)[keyof typeof Biome]);
    if (w.grass[j] > BIOME_INFO[biome].grassMax) w.setGrass(j, BIOME_INFO[biome].grassMax);
  }

  /**
   * El árbol suelta una semilla a una distancia y dirección al azar (no siempre a dos casillas en
   * cruz, que dibujaba los bosques como un tablero de ajedrez). Sólo brota si no está apiñada.
   */
  private spreadSapling(i: number, rng: Rng): void {
    const w = this.world;
    const x = i % w.width;
    const y = (i - x) / w.width;
    const dx = rng.range(-SAPLING_REACH, SAPLING_REACH);
    const dy = rng.range(-SAPLING_REACH, SAPLING_REACH);
    if (dx === 0 && dy === 0) return;
    const nx = x + dx;
    const ny = y + dy;
    if (!w.inBounds(nx, ny)) return;
    const j = w.idx(nx, ny);
    // En los senderos y caminos no brota nada.
    if (w.flora[j] !== Flora.NONE || w.buildingAt[j] !== 0 || w.road[j] >= ROAD_PATH || !isFertileTerrain(w.terrain[j])) return;
    if (treeNeighbors(w, nx, ny) >= MAX_TREE_NEIGHBORS) return;
    w.setFlora(j, Flora.SAPLING);
  }
}

/** Árboles y retoños en las 8 casillas vecinas. */
export function treeNeighbors(w: World, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dy === 0) || !w.inBounds(x + dx, y + dy)) continue;
      const f = w.flora[w.idx(x + dx, y + dy)];
      if (f === Flora.TREE || f === Flora.SAPLING) n++;
    }
  }
  return n;
}
