import { Rng } from '../core/rng';
import { fbm } from './noise';
import { BIOME_INFO, Biome, Flora, SEA_LEVEL, isFertileTerrain, terrainFromHeight, type BiomeId } from './terrain';
import { World } from './world';

/** Fracción aproximada del mapa que queda bajo el agua. */
const WATER_FRACTION = 0.48;
const HISTOGRAM_BINS = 1024;
/** Cuántas "celdas" de ruido base caben en el mapa (más = continentes más pequeños). */
const CONTINENT_CELLS = 4;
const ISLAND_FALLOFF = 0.75;

export function generateWorld(seed: number, width: number, height: number): World {
  const world = new World(width, height);
  const raw = buildElevation(seed, width, height);
  applyHeights(world, raw);
  assignBiomes(world, seed);
  seedVegetation(world, new Rng(seed ^ 0x5eed));
  world.markAllDirty();
  return world;
}

function buildElevation(seed: number, width: number, height: number): Float32Array {
  const raw = new Float32Array(width * height);
  const scale = CONTINENT_CELLS / Math.max(width, height);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const e = fbm(x * scale, y * scale, seed, 6);
      const ridge = fbm(x * scale * 3, y * scale * 3, seed + 77, 3);
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const d = dx * dx + dy * dy;
      raw[y * width + x] = e + (ridge - 0.5) * 0.25 - d * ISLAND_FALLOFF * 0.5;
    }
  }
  return raw;
}

/** Normaliza por percentil para que siempre haya la misma proporción de agua. */
function applyHeights(world: World, raw: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }
  const span = max - min || 1;
  const hist = new Uint32Array(HISTOGRAM_BINS);
  for (let i = 0; i < raw.length; i++) {
    const b = Math.min(HISTOGRAM_BINS - 1, Math.floor(((raw[i] - min) / span) * HISTOGRAM_BINS));
    hist[b]++;
  }
  const target = raw.length * WATER_FRACTION;
  let acc = 0;
  let seaBin = 0;
  while (seaBin < HISTOGRAM_BINS - 1 && acc + hist[seaBin] < target) acc += hist[seaBin++];
  const sea = min + (seaBin / HISTOGRAM_BINS) * span;

  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    let h: number;
    if (v < sea) {
      h = ((v - min) / (sea - min || 1)) * (SEA_LEVEL - 1);
    } else {
      h = SEA_LEVEL + ((v - sea) / (max - sea || 1)) * (255 - SEA_LEVEL);
    }
    const hh = Math.max(0, Math.min(255, Math.round(h)));
    world.heightMap[i] = hh;
    world.terrain[i] = terrainFromHeight(hh);
  }
}

function assignBiomes(world: World, seed: number): void {
  const scale = 6 / Math.max(world.width, world.height);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const i = y * world.width + x;
      const moisture = fbm(x * scale, y * scale, seed + 1001, 4);
      const heat = fbm(x * scale, y * scale, seed + 2002, 3);
      world.biome[i] = pickBiome(moisture, heat);
      if (isFertileTerrain(world.terrain[i])) {
        world.grass[i] = BIOME_INFO[world.biome[i]].grassMax;
      }
    }
  }
}

function pickBiome(moisture: number, heat: number): BiomeId {
  if (heat > 0.6 && moisture < 0.48) return Biome.DESERT;
  if (moisture > 0.54) return Biome.FOREST;
  return Biome.GRASS;
}

const TREE_DENSITY: readonly number[] = [0.03, 0.35, 0.004];
const BUSH_DENSITY: readonly number[] = [0.02, 0.025, 0];

function seedVegetation(world: World, rng: Rng): void {
  for (let i = 0; i < world.size; i++) {
    if (!isFertileTerrain(world.terrain[i])) continue;
    const b = world.biome[i];
    const r = rng.float();
    if (r < TREE_DENSITY[b]) world.flora[i] = Flora.TREE;
    else if (r < TREE_DENSITY[b] + BUSH_DENSITY[b]) world.flora[i] = Flora.BERRY_BUSH;
  }
}
