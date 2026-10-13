import type { Rng } from '../core/rng';
import { SPECIES, type SpeciesId } from '../entities/species';
import { randomTraits } from '../entities/traits';
import { NO_UNIT, type UnitStore } from '../entities/units';
import type { BrushToolId } from '../sim/commands';
import {
  BIOME_INFO,
  Biome,
  Flora,
  SEA_LEVEL,
  TERRAIN_INFO,
  Terrain,
  isFertileTerrain,
  isPlant,
  type BiomeId,
  type TerrainId,
} from '../world/terrain';
import type { World } from '../world/world';

export const BRUSH_SIZES = [1, 3, 5, 9, 15] as const;
export const MAX_BRUSH_SIZE = BRUSH_SIZES[BRUSH_SIZES.length - 1];

const HEIGHT_STEP = 6;
const PAINT_JITTER = 2;
const TREE_DENSITY = 0.3;
const BUSH_DENSITY = 0.12;

/** Visita las casillas de un pincel circular de diámetro `size`. */
export function forEachTileInBrush(world: World, cx: number, cy: number, size: number, visit: (i: number) => void): void {
  const r = (Math.min(Math.max(size, 1), MAX_BRUSH_SIZE) - 1) / 2;
  const limit = r * r + r * 0.8;
  const ir = Math.ceil(r);
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy > limit) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (world.inBounds(x, y)) visit(world.idx(x, y));
    }
  }
}

const PAINT_TERRAIN: Partial<Record<BrushToolId, TerrainId>> = {
  deep: Terrain.DEEP,
  ocean: Terrain.OCEAN,
  water: Terrain.SHALLOW,
  sand: Terrain.SAND,
  soil: Terrain.SOIL_LOW,
  hills: Terrain.HILLS,
  mountain: Terrain.MOUNTAIN,
};

const PAINT_BIOME: Partial<Record<BrushToolId, BiomeId>> = {
  grass: Biome.GRASS,
  forest: Biome.FOREST,
  desert: Biome.DESERT,
  snow: Biome.SNOW,
  swamp: Biome.SWAMP,
  jungle: Biome.JUNGLE,
  savanna: Biome.SAVANNA,
  grove: Biome.GROVE,
  blight: Biome.BLIGHT,
};

export function applyBrush(world: World, rng: Rng, tool: BrushToolId, cx: number, cy: number, size: number): void {
  const single = size <= 1;
  const terrain = PAINT_TERRAIN[tool];
  const biome = PAINT_BIOME[tool];
  forEachTileInBrush(world, cx, cy, size, (i) => {
    if (terrain !== undefined) paintTerrain(world, rng, i, terrain);
    else if (biome !== undefined) paintBiome(world, i, biome);
    else applyTool(world, rng, tool, i, single);
  });
}

function paintTerrain(world: World, rng: Rng, i: number, terrain: TerrainId): void {
  const before = world.terrain[i];
  world.setHeight(i, TERRAIN_INFO[terrain].paintHeight + rng.range(-PAINT_JITTER, PAINT_JITTER));
  // La tierra recién creada empieza desnuda y reverdece con el tiempo.
  if (before !== world.terrain[i] && isFertileTerrain(world.terrain[i]) && !isFertileTerrain(before)) {
    world.setGrass(i, 0);
  }
}

function paintBiome(world: World, i: number, biome: BiomeId): void {
  if (world.isWaterIdx(i)) return;
  world.setBiome(i, biome);
  if (biome === Biome.DESERT) {
    world.setGrass(i, 0);
    if (world.flora[i] === Flora.BERRY_BUSH || world.flora[i] === Flora.BUSH) world.setFlora(i, Flora.NONE);
  } else if (world.grass[i] > BIOME_INFO[biome].grassMax) {
    world.setGrass(i, BIOME_INFO[biome].grassMax);
  }
}

function applyTool(world: World, rng: Rng, tool: BrushToolId, i: number, single: boolean): void {
  switch (tool) {
    case 'raise':
      world.setHeight(i, world.heightMap[i] + HEIGHT_STEP);
      break;
    case 'lower':
      world.setHeight(i, world.heightMap[i] - HEIGHT_STEP);
      break;
    case 'sponge':
      if (world.isWaterIdx(i)) world.setHeight(i, SEA_LEVEL + 2);
      break;
    case 'tree':
      if (canPlant(world, i) && (single || rng.chance(TREE_DENSITY))) world.setFlora(i, Flora.TREE);
      break;
    case 'bush':
      if (canPlant(world, i) && (single || rng.chance(BUSH_DENSITY))) world.setFlora(i, Flora.BERRY_BUSH);
      break;
    case 'clear-flora':
      if (isPlant(world.flora[i])) world.setFlora(i, Flora.NONE);
      break;
    default:
      break;
  }
}

function canPlant(world: World, i: number): boolean {
  return world.flora[i] === Flora.NONE && isFertileTerrain(world.terrain[i]);
}

/** Número de criaturas que crea un toque del pincel de creación. */
export function spawnCountForSize(size: number): number {
  return size <= 1 ? 1 : Math.max(1, Math.round(size * size * 0.08));
}

const SPAWN_ATTEMPTS = 8;

/** Crea criaturas adultas en posiciones pisables dentro del pincel. */
export function spawnInBrush(
  world: World,
  units: UnitStore,
  rng: Rng,
  species: SpeciesId,
  cx: number,
  cy: number,
  size: number,
  limit: number,
): { spawned: number; limited: boolean } {
  const def = SPECIES[species];
  const want = spawnCountForSize(size);
  const r = Math.max(0, (size - 1) / 2);
  let spawned = 0;
  for (let k = 0; k < want; k++) {
    if (units.count >= limit) return { spawned, limited: true };
    for (let a = 0; a < SPAWN_ATTEMPTS; a++) {
      const x = cx + rng.range(-Math.floor(r), Math.floor(r)) + 0.5;
      const y = cy + rng.range(-Math.floor(r), Math.floor(r)) + 0.5;
      if (!world.isWalkableAt(x, y)) continue;
      const i = units.spawn(species, x, y, {
        sex: rng.int(2),
        ageTicks: def.adultTicks + rng.int(Math.floor(def.lifespanTicks * 0.3)),
        generation: 0,
        thinkOffset: rng.int(5),
        nameSeed: rng.nextU32(),
        traits: randomTraits(rng),
      });
      if (i !== NO_UNIT) spawned++;
      break;
    }
  }
  return { spawned, limited: false };
}
