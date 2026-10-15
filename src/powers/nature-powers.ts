import { DeathCause, killUnit, type AiContext } from '../ai/context';
import { SPECIES, Species } from '../entities/species';
import type { Rng } from '../core/rng';
import { BIOME_INFO, Biome, Flora, Terrain, isFertileTerrain, type BiomeId } from '../world/terrain';
import { treeNeighbors } from '../world/vegetation';
import type { World } from '../world/world';
import type { HazardSystem } from './hazards';
import { damageInRadius, type BuildingDamage, type Effect } from './disasters';
import { Status } from './status';

/**
 * Desastres y poderes de la naturaleza (fases P, U y X): maremoto, ventisca, langostas,
 * tormenta de arena, lluvia fértil y fertilidad. Todo determinista: el azar llega del flujo
 * de los poderes.
 */

/** Visita las casillas del círculo (centro y radio en casillas). */
export function forCircle(w: World, cx: number, cy: number, r: number, visit: (i: number) => void): void {
  const ir = Math.ceil(r);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!w.inBounds(x, y)) continue;
      const ox = x + 0.5 - cx;
      const oy = y + 0.5 - cy;
      if (ox * ox + oy * oy <= r * r) visit(w.idx(x, y));
    }
  }
}

// ---------- Maremoto ----------

/** Parte mínima de agua en el círculo para que haya ola (tierra adentro no pasa nada). */
const TSUNAMI_MIN_WATER = 0.12;
const TSUNAMI_DAMAGE = 45;
/** Casillas que la ola arrastra a las criaturas tierra adentro. */
const TSUNAMI_PUSH = 2.5;
const TSUNAMI_PLANT_LOSS = 0.5;
const TSUNAMI_BUILDING_CHANCE = 0.35;
const TSUNAMI_BOAT_CHANCE = 0.8;
/** Los edificios caen en la parte de la ola más cercana al mar. */
const TSUNAMI_BUILDING_REACH = 0.8;

/** ¿Tierra baja (arena o tierra llana), la que inunda una ola? */
function isLowLand(w: World, i: number): boolean {
  const t = w.terrain[i];
  return t === Terrain.SAND || t === Terrain.SOIL_LOW;
}

/**
 * Maremoto: una ola barre la costa del radio. Arrastra plantas y hierba de la tierra baja,
 * apaga el fuego, hiere y empuja tierra adentro a las criaturas, hunde barcos y derriba
 * parte de los edificios. Devuelve false si no hay mar cerca (entonces no pasa nada).
 */
export function tsunami(w: World, cx: number, cy: number, r: number, ctx: AiContext, rng: Rng, civ: BuildingDamage): boolean {
  let water = 0;
  let total = 0;
  forCircle(w, cx, cy, r, (i) => {
    total++;
    if (w.isWaterIdx(i)) water++;
  });
  if (total === 0 || water / total < TSUNAMI_MIN_WATER) return false;
  forCircle(w, cx, cy, r, (i) => {
    if (w.isWaterIdx(i) || !isLowLand(w, i)) return;
    w.setGrass(i, 0);
    ctx.hazards.extinguish(i);
    if (w.flora[i] !== Flora.NONE && w.flora[i] <= Flora.BERRY_BUSH && rng.chance(TSUNAMI_PLANT_LOSS)) w.setFlora(i, Flora.NONE);
  });
  // Primero el golpe de la ola (a todos los del círculo) y luego el arrastre tierra adentro.
  damageInRadius(ctx, cx, cy, r, TSUNAMI_DAMAGE);
  const u = ctx.units;
  ctx.spatial.forEachInRadius(u, cx, cy, r, (j) => {
    if (u.alive[j] === 0 || (u.status[j] & Status.HELD) !== 0) return;
    if (!isLowLand(w, w.idx(Math.floor(u.x[j]), Math.floor(u.y[j])))) return;
    // Empujón en dirección contraria al centro de la ola (si cae en tierra pisable).
    const dx = u.x[j] - cx;
    const dy = u.y[j] - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = u.x[j] + (dx / d) * TSUNAMI_PUSH;
    const ny = u.y[j] + (dy / d) * TSUNAMI_PUSH;
    if (!w.isWalkableAt(nx, ny)) return;
    u.x[j] = nx;
    u.y[j] = ny;
    u.pathLen[j] = 0;
  });
  civ.damageBuildingsIn(cx, cy, r * TSUNAMI_BUILDING_REACH, TSUNAMI_BUILDING_CHANCE, rng);
  civ.wreckBoatsIn(cx, cy, r, TSUNAMI_BOAT_CHANCE, rng);
  return true;
}

// ---------- Ventisca ----------

const BLIZZARD_INTERVAL = 10;
const BLIZZARD_DAMAGE = 2;
const BLIZZARD_TILES = 6;
const BLIZZARD_GRASS_LOSS = 15;
/** Probabilidad de que una casilla tocada quede nevada para siempre. */
const BLIZZARD_SNOW_CHANCE = 0.2;
const BLIZZARD_FROST = -4;

/** Ventisca: el frío hiere, hiela las cosechas, apaga el fuego y deja la tierra nevada. */
export function stepBlizzard(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage, randomTile: () => number): void {
  if (ctx.tick % BLIZZARD_INTERVAL !== 0) return;
  damageInRadius(ctx, e.x, e.y, e.r, BLIZZARD_DAMAGE);
  civ.tendFarmsIn(e.x, e.y, e.r, BLIZZARD_FROST);
  const w = ctx.world;
  for (let k = 0; k < BLIZZARD_TILES; k++) {
    const i = randomTile();
    if (i < 0 || w.isWaterIdx(i)) continue;
    w.setGrass(i, w.grass[i] - BLIZZARD_GRASS_LOSS);
    ctx.hazards.extinguish(i);
    if (isFertileTerrain(w.terrain[i]) && w.biome[i] !== Biome.SNOW && rng.chance(BLIZZARD_SNOW_CHANCE)) w.setBiome(i, Biome.SNOW);
  }
}

// ---------- Tormenta de arena ----------

const SAND_SPEED = 0.07;
const SAND_TURN_INTERVAL = 60;
/** Cuánto se tuerce el rumbo de la tormenta cada vez (mucho menos que las langostas: avanza recta). */
const SAND_WOBBLE = 0.3;
const SAND_INTERVAL = 10;
const SAND_DAMAGE = 1;
const SAND_TILES = 8;
const SAND_GRASS_LOSS = 25;
const SAND_FARM_LOSS = -5;
const SAND_SAPLING_LOSS = 0.4;
/** Probabilidad de que una casilla fértil junto al desierto quede convertida en arena. */
const SAND_DUNE_CHANCE = 0.3;
const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Los hechos al desierto (dromedarios y razas a las que no afecta el calor) aguantan la arena. */
export function sandProof(species: number): boolean {
  return species === Species.CAMEL || SPECIES[species]?.race?.heatProof === true;
}

function nextToDesert(w: World, i: number): boolean {
  const x = i % w.width;
  const y = (i - x) / w.width;
  return NEIGHBORS.some(([dx, dy]) => w.inBounds(x + dx, y + dy) && w.biome[w.idx(x + dx, y + dy)] === Biome.DESERT);
}

/**
 * Tormenta de arena: un muro de polvo que avanza casi recto. Hiere poco a poco a quien no está
 * hecho al desierto, entierra hierba, retoños y cosechas, apaga el fuego y deja arena al borde
 * de los desiertos.
 */
export function stepSandstorm(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage, randomTile: () => number): void {
  const w = ctx.world;
  if (ctx.tick % SAND_TURN_INTERVAL === 0) {
    e.dx += (rng.float() - 0.5) * SAND_WOBBLE;
    e.dy += (rng.float() - 0.5) * SAND_WOBBLE;
    const len = Math.sqrt(e.dx * e.dx + e.dy * e.dy) || 1;
    e.dx /= len;
    e.dy /= len;
  }
  e.x = Math.min(w.width - 1, Math.max(1, e.x + e.dx * SAND_SPEED));
  e.y = Math.min(w.height - 1, Math.max(1, e.y + e.dy * SAND_SPEED));
  if (ctx.tick % SAND_INTERVAL !== 0) return;
  const u = ctx.units;
  ctx.spatial.forEachInRadius(u, e.x, e.y, e.r, (j) => {
    if (u.alive[j] === 0 || (u.status[j] & Status.HELD) !== 0 || sandProof(u.species[j])) return;
    u.hp[j] -= SAND_DAMAGE;
    if (u.hp[j] <= 0) killUnit(ctx, j, DeathCause.DISASTER);
  });
  civ.tendFarmsIn(e.x, e.y, e.r, SAND_FARM_LOSS);
  for (let k = 0; k < SAND_TILES; k++) {
    const i = randomTile();
    if (i < 0 || w.isWaterIdx(i)) continue;
    w.setGrass(i, w.grass[i] - SAND_GRASS_LOSS);
    ctx.hazards.extinguish(i);
    if (w.flora[i] === Flora.SAPLING && rng.chance(SAND_SAPLING_LOSS)) w.setFlora(i, Flora.NONE);
    if (isFertileTerrain(w.terrain[i]) && w.biome[i] !== Biome.DESERT && nextToDesert(w, i) && rng.chance(SAND_DUNE_CHANCE)) w.setBiome(i, Biome.DESERT);
  }
}

// ---------- Clima de zona: reverdecer y sequía ----------

const CLIMATE_INTERVAL = 10;
/** No brota un retoño con tantos árboles pegados (bosques sin apiñar). */
const MAX_TREE_NEIGHBORS = 3;
const CLIMATE_TILES = 10;
/** Probabilidad de que una casilla tocada cambie de bioma un paso. */
const CLIMATE_SHIFT_CHANCE = 0.3;
const GREEN_GRASS_GAIN = 40;
const GREEN_SAPLING_CHANCE = 0.05;
const GREEN_FARM_GROWTH = 3;
const DROUGHT_GRASS_LOSS = 35;
const DROUGHT_FARM_LOSS = -4;
const DROUGHT_SAPLING_LOSS = 0.3;
/** Probabilidad de que la hierba seca prenda en cada casilla tocada por la sequía. */
const DROUGHT_FIRE_CHANCE = 0.006;

/** Un paso hacia lo verde (el yermo maldito también se cura) y un paso hacia lo seco. */
const GREENER: Readonly<Partial<Record<number, BiomeId>>> = {
  [Biome.DESERT]: Biome.SAVANNA,
  [Biome.SAVANNA]: Biome.GRASS,
  [Biome.BLIGHT]: Biome.GRASS,
};
const DRIER: Readonly<Partial<Record<number, BiomeId>>> = {
  [Biome.FOREST]: Biome.GRASS,
  [Biome.JUNGLE]: Biome.SAVANNA,
  [Biome.SWAMP]: Biome.GRASS,
  [Biome.GRASS]: Biome.SAVANNA,
  [Biome.SAVANNA]: Biome.DESERT,
};

/** Casilla al azar del círculo del efecto (el sorteo es en un cuadrado: se descartan las esquinas), o -1. */
function tileInCircle(e: Effect, w: World, randomTile: () => number): number {
  const i = randomTile();
  if (i < 0) return -1;
  const x = i % w.width;
  const dx = x + 0.5 - e.x;
  const dy = (i - x) / w.width + 0.5 - e.y;
  return dx * dx + dy * dy <= e.r * e.r ? i : -1;
}

/** Reverdecer: durante un rato la zona pasa del desierto a la sabana y de ahí a la pradera; brota hierba y algún retoño. */
export function stepGreening(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage, randomTile: () => number): void {
  if (ctx.tick % CLIMATE_INTERVAL !== 0) return;
  const w = ctx.world;
  civ.tendFarmsIn(e.x, e.y, e.r, GREEN_FARM_GROWTH);
  for (let k = 0; k < CLIMATE_TILES; k++) {
    const i = tileInCircle(e, w, randomTile);
    if (i < 0 || w.isWaterIdx(i) || !isFertileTerrain(w.terrain[i])) continue;
    const next = GREENER[w.biome[i]];
    if (next !== undefined && rng.chance(CLIMATE_SHIFT_CHANCE)) w.setBiome(i, next);
    w.setGrass(i, Math.min(BIOME_INFO[w.biome[i]].grassMax, w.grass[i] + GREEN_GRASS_GAIN));
    if (w.flora[i] === Flora.NONE && w.buildingAt[i] === 0 && rng.chance(GREEN_SAPLING_CHANCE)) {
      const x = i % w.width;
      if (treeNeighbors(w, x, (i - x) / w.width) < MAX_TREE_NEIGHBORS) w.setFlora(i, Flora.SAPLING);
    }
  }
}

/** Sequía: la hierba se seca, las cosechas se marchitan, la tierra pasa de pradera a sabana y a desierto, y a veces prende. */
export function stepDrought(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage, randomTile: () => number): void {
  if (ctx.tick % CLIMATE_INTERVAL !== 0) return;
  const w = ctx.world;
  civ.tendFarmsIn(e.x, e.y, e.r, DROUGHT_FARM_LOSS);
  for (let k = 0; k < CLIMATE_TILES; k++) {
    const i = tileInCircle(e, w, randomTile);
    if (i < 0 || w.isWaterIdx(i) || !isFertileTerrain(w.terrain[i])) continue;
    const next = DRIER[w.biome[i]];
    if (next !== undefined && rng.chance(CLIMATE_SHIFT_CHANCE)) w.setBiome(i, next);
    // La hierba no pasa del tope del bioma (más seco) en el que queda.
    w.setGrass(i, Math.min(BIOME_INFO[w.biome[i]].grassMax, w.grass[i] - DROUGHT_GRASS_LOSS));
    if (w.flora[i] === Flora.SAPLING && rng.chance(DROUGHT_SAPLING_LOSS)) w.setFlora(i, Flora.NONE);
    else if (w.flora[i] === Flora.BERRY_BUSH) w.setFlora(i, Flora.BUSH);
    // Sólo prende lo que puede arder (hierba, plantas o edificios), no la tierra pelada.
    if (rng.chance(DROUGHT_FIRE_CHANCE) && ctx.hazards.isFlammable(i)) ctx.hazards.ignite(i);
  }
}

// ---------- Langostas ----------

const LOCUST_SPEED = 0.12;
const LOCUST_TURN_INTERVAL = 40;
const LOCUST_TILES = 4;
const LOCUST_FARM_INTERVAL = 5;
const LOCUST_FARM_LOSS = -6;
const LOCUST_SAPLING_LOSS = 0.3;

/** Plaga de langostas: una nube que vaga devorando hierba, bayas, retoños y cosechas (no hiere a nadie). */
export function stepLocusts(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage, randomTile: () => number): void {
  const w = ctx.world;
  if (ctx.tick % LOCUST_TURN_INTERVAL === 0) {
    e.dx += (rng.float() - 0.5) * 0.8;
    e.dy += (rng.float() - 0.5) * 0.8;
    const len = Math.sqrt(e.dx * e.dx + e.dy * e.dy) || 1;
    e.dx /= len;
    e.dy /= len;
  }
  e.x = Math.min(w.width - 1, Math.max(1, e.x + e.dx * LOCUST_SPEED));
  e.y = Math.min(w.height - 1, Math.max(1, e.y + e.dy * LOCUST_SPEED));
  for (let k = 0; k < LOCUST_TILES; k++) {
    const i = randomTile();
    if (i < 0) continue;
    w.setGrass(i, 0);
    if (w.flora[i] === Flora.BERRY_BUSH) w.setFlora(i, Flora.BUSH);
    else if (w.flora[i] === Flora.SAPLING && rng.chance(LOCUST_SAPLING_LOSS)) w.setFlora(i, Flora.NONE);
  }
  if (ctx.tick % LOCUST_FARM_INTERVAL === 0) civ.tendFarmsIn(e.x, e.y, e.r, LOCUST_FARM_LOSS);
}

// ---------- Fertilidad ----------

/**
 * Fertilidad: las criaturas del círculo (salvo los monstruos y las que sujeta el imán) quedan
 * saciadas y pueden volver a criar enseguida. Los cupos de cada especie siguen valiendo.
 */
export function fertility(ctx: AiContext, cx: number, cy: number, r: number): void {
  const u = ctx.units;
  ctx.spatial.forEachInRadius(u, cx, cy, r, (j) => {
    if (u.alive[j] === 0 || (u.status[j] & Status.HELD) !== 0) return;
    const def = SPECIES[u.species[j]];
    if (def.diet === 'monster') return;
    u.cooldown[j] = 0;
    u.hunger[j] = def.maxHunger;
  });
}

// ---------- Lluvia fértil ----------

const RAIN_SAPLING_CHANCE = 0.06;
const RAIN_FARM_GROWTH = 40;

/** Lluvia fértil: hierba a tope, bayas de nuevo, algún retoño, cosechas adelantadas y el fuego apagado. */
export function fertileRain(w: World, hazards: HazardSystem, cx: number, cy: number, r: number, rng: Rng, civ: BuildingDamage): void {
  forCircle(w, cx, cy, r, (i) => {
    if (w.isWaterIdx(i)) return;
    hazards.extinguish(i);
    w.setGrass(i, BIOME_INFO[w.biome[i]].grassMax);
    if (w.flora[i] === Flora.BUSH) w.setFlora(i, Flora.BERRY_BUSH);
    else if (w.flora[i] === Flora.NONE && w.buildingAt[i] === 0 && isFertileTerrain(w.terrain[i]) && rng.chance(RAIN_SAPLING_CHANCE)) {
      const x = i % w.width;
      if (treeNeighbors(w, x, (i - x) / w.width) < MAX_TREE_NEIGHBORS) w.setFlora(i, Flora.SAPLING);
    }
  });
  civ.tendFarmsIn(cx, cy, r, RAIN_FARM_GROWTH);
}
