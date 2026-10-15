import { Rng } from '../core/rng';
import { fbm } from './noise';
import { treeNeighbors } from './vegetation';
import { BIOME_INFO, Biome, Flora, SEA_LEVEL, Terrain, isFertileTerrain, terrainFromHeight, type BiomeId } from './terrain';
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
  seedVegetation(world, new Rng(seed ^ 0x5eed), seed);
  world.computeRegions();
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
      // Cuanto más alto, más frío.
      const altitude = Math.max(0, (world.heightMap[i] - SEA_LEVEL) / (255 - SEA_LEVEL));
      const heat = fbm(x * scale, y * scale, seed + 2002, 3) - altitude * ALTITUDE_COOLING;
      world.biome[i] = pickBiome(moisture, heat, world.terrain[i]);
      if (isFertileTerrain(world.terrain[i])) {
        world.grass[i] = BIOME_INFO[world.biome[i]].grassMax;
      }
    }
  }
}

/** Bioma natural según humedad, calor y capa de terreno (los mágicos no se generan). */
function pickBiome(moisture: number, heat: number, terrain: number): BiomeId {
  if (heat < COLD) return Biome.SNOW;
  if (heat > HOT) {
    if (moisture < DRY) return Biome.DESERT;
    return moisture > WET ? Biome.JUNGLE : Biome.SAVANNA;
  }
  // Las tierras bajas muy húmedas se encharcan.
  if (moisture > 0.62 && terrain === Terrain.SOIL_LOW) return Biome.SWAMP;
  if (moisture > 0.54) return Biome.FOREST;
  return Biome.GRASS;
}

const COLD = 0.26;
const HOT = 0.55;
const DRY = 0.45;
const WET = 0.57;
const ALTITUDE_COOLING = 0.18;

/** Probabilidad de roca, hierro y oro por capa de terreno. */
const DEPOSITS: Readonly<Record<number, readonly [number, number, number]>> = {
  [Terrain.SOIL_HIGH]: [0.006, 0, 0],
  [Terrain.HILLS]: [0.04, 0.012, 0.002],
  [Terrain.MOUNTAIN]: [0.06, 0.025, 0.008],
};

/** Arboledas y claros: escala del ruido y a partir de qué valor hay bosque denso. */
const GROVE_SCALE = 0.07;
const GROVE_THRESHOLD = 0.38;
const GROVE_GAIN = 2.4;
/** Al generar, no se planta un árbol con tantos árboles ya pegados (los de arriba y a la izquierda). */
const SEED_MAX_NEIGHBORS = 3;

function seedVegetation(world: World, rng: Rng, seed: number): void {
  for (let i = 0; i < world.size; i++) {
    const dep = DEPOSITS[world.terrain[i]];
    if (dep) {
      const r = rng.float();
      if (r < dep[2]) world.flora[i] = Flora.GOLD;
      else if (r < dep[2] + dep[1]) world.flora[i] = Flora.IRON;
      else if (r < dep[2] + dep[1] + dep[0]) world.flora[i] = Flora.ROCK;
      if (world.flora[i] !== Flora.NONE) continue;
    }
    if (!isFertileTerrain(world.terrain[i])) continue;
    const b = world.biome[i];
    const r = rng.float();
    const info = BIOME_INFO[b];
    const x = i % world.width;
    const y = (i - x) / world.width;
    // Más árboles en las arboledas y casi ninguno en los claros.
    const grove = Math.min(1.6, Math.max(0.08, (fbm(x * GROVE_SCALE, y * GROVE_SCALE, seed + 3003, 3) - GROVE_THRESHOLD) * GROVE_GAIN));
    if (r < info.treeDensity * grove) {
      if (treeNeighbors(world, x, y) < SEED_MAX_NEIGHBORS) world.flora[i] = Flora.TREE;
    } else if (r < info.treeDensity + info.bushDensity) world.flora[i] = Flora.BERRY_BUSH;
  }
}
