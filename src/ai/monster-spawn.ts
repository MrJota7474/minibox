import type { Rng } from '../core/rng';
import { TICKS_PER_YEAR } from '../core/time';
import { MONSTER_IDS, SPECIES, Species, type SpeciesId } from '../entities/species';
import { NO_UNIT, type UnitStore } from '../entities/units';
import { Biome, Flora, isWalkableTerrain } from '../world/terrain';
import type { World } from '../world/world';
import type { AiContext } from './context';

/**
 * De dónde salen los monstruos: del yermo maldito y de los muertos (penantes), de la lava
 * al enfriarse (escorios) y de los pantanos sin dueño (cenagosos). Los que crea el jugador
 * con el pincel no pasan por aquí.
 */

/** Parte del límite de criaturas que pueden ocupar los monstruos que aparecen solos. */
const MONSTER_LIMIT_SHARE = 0.12;
const ESCORIO_LIMIT_SHARE = 0.01;
const MIN_ESCORIOS = 2;
/** Un cenagoso por cada tantas casillas de mapa (al menos uno). */
const TILES_PER_CENAGOSO = 20000;
/** Cada cuántos ticks se buscan sitios de aparición (un mes). */
const SPAWN_INTERVAL = 50;
/** Casillas al azar que se miran en cada búsqueda: una por cada tantas del mapa. */
const TILES_PER_SAMPLE = 256;
const MIN_SAMPLES = 16;
/** Una mancha de yermo de 150 casillas da unos tres penantes al año. */
const BLIGHT_SPAWN_CHANCE = 0.4;
/** Los pantanos de un mapa mediano sueltan un cenagoso cada cuatro o cinco años. */
const SWAMP_SPAWN_CHANCE = 0.0025;
/** Los pantanos dejan en paz a las primeras aldeas mientras crecen. */
const SWAMP_GRACE_TICKS = 8 * TICKS_PER_YEAR;
/** Probabilidad de que una casilla de lava, al enfriarse, despierte a un escorio. */
const ESCORIO_BIRTH_CHANCE = 0.008;
/** Tiempo mínimo entre dos avisos iguales en la crónica. */
const BLIGHT_NOTICE_TICKS = 5 * TICKS_PER_YEAR;
const RISE_NOTICE_TICKS = 10 * TICKS_PER_YEAR;
const LAVA_NOTICE_TICKS = TICKS_PER_YEAR;

export function monsterCount(u: UnitStore): number {
  let n = 0;
  for (const id of MONSTER_IDS) n += u.speciesCount[id];
  return n;
}

/** ¿Cabe otro monstruo de los que aparecen solos? (ley del mundo y topes de población) */
export function canSpawnMonster(ctx: AiContext, species: SpeciesId): boolean {
  const u = ctx.units;
  if (!ctx.laws.monsters || u.count >= ctx.unitLimit) return false;
  if (monsterCount(u) >= Math.floor(ctx.unitLimit * MONSTER_LIMIT_SHARE)) return false;
  if (species === Species.CENAGOSO) return u.speciesCount[species] < Math.max(1, Math.floor(ctx.world.size / TILES_PER_CENAGOSO));
  if (species === Species.ESCORIO) return u.speciesCount[species] < Math.max(MIN_ESCORIOS, Math.floor(ctx.unitLimit * ESCORIO_LIMIT_SHARE));
  return true;
}

/** Hace aparecer un monstruo recién nacido en (x, y); NO_UNIT si el sitio no es pisable o no hay hueco. */
export function spawnMonster(ctx: AiContext, species: SpeciesId, x: number, y: number): number {
  if (!ctx.world.isWalkableAt(x, y)) return NO_UNIT;
  return ctx.units.spawn(species, x, y, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: ctx.tick + Math.floor(x) });
}

/** Aviso en la crónica, como mucho uno igual cada `every` ticks. */
function announce(ctx: AiContext, text: string, every: number): void {
  const log = ctx.civ.chronicle;
  for (let k = log.length - 1; k >= 0 && ctx.tick - log[k].tick < every; k--) {
    if (log[k].type === 'monster' && log[k].text === text) return;
  }
  ctx.civ.addEvent('monster', -1, text);
}

/**
 * Lo que queda tras una muerte: el escorio se enfría en una roca y, con probabilidad
 * `rise`, la víctima se levanta como penante donde cayó.
 */
export function afterDeath(ctx: AiContext, species: number, x: number, y: number, rise: number): void {
  if (SPECIES[species].monster?.fiery) leaveRock(ctx.world, x, y);
  if (rise <= 0 || !canSpawnMonster(ctx, Species.PENANTE)) return;
  if (rise < 1 && !ctx.rng.chance(rise)) return;
  if (spawnMonster(ctx, Species.PENANTE, x, y) !== NO_UNIT) announce(ctx, 'Los caídos se levantan como penantes', RISE_NOTICE_TICKS);
}

function leaveRock(world: World, x: number, y: number): void {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!world.inBounds(tx, ty)) return;
  const t = world.idx(tx, ty);
  if (world.flora[t] !== Flora.NONE || world.buildingAt[t] !== 0 || world.lava[t] > 0 || !isWalkableTerrain(world.terrain[t])) return;
  world.setFlora(t, Flora.ROCK);
}

/** Una casilla de lava acaba de enfriarse: a veces despierta a un escorio. */
export function bornFromLava(ctx: AiContext, rng: Rng, tile: number): void {
  if (!ctx.laws.monsters || !rng.chance(ESCORIO_BIRTH_CHANCE) || !canSpawnMonster(ctx, Species.ESCORIO)) return;
  const x = tile % ctx.world.width;
  const y = (tile - x) / ctx.world.width;
  if (spawnMonster(ctx, Species.ESCORIO, x + 0.5, y + 0.5) !== NO_UNIT) announce(ctx, 'Un escorio ha nacido de la lava', LAVA_NOTICE_TICKS);
}

/**
 * Apariciones espontáneas (una vez al mes): se miran casillas al azar, así que cuanto
 * más yermo maldito o más pantano salvaje hay, más monstruos salen de ellos.
 */
export function stepMonsterSpawns(ctx: AiContext, rng: Rng): void {
  if (!ctx.laws.monsters || ctx.tick === 0 || ctx.tick % SPAWN_INTERVAL !== 0) return;
  const w = ctx.world;
  const samples = Math.max(MIN_SAMPLES, Math.round(w.size / TILES_PER_SAMPLE));
  for (let s = 0; s < samples; s++) {
    const t = rng.int(w.size);
    const biome = w.biome[t];
    if (biome !== Biome.BLIGHT && biome !== Biome.SWAMP) continue;
    if (!isWalkableTerrain(w.terrain[t]) || w.lava[t] > 0 || w.buildingAt[t] !== 0) continue;
    const x = t % w.width;
    const y = (t - x) / w.width;
    if (biome === Biome.BLIGHT) {
      if (!rng.chance(BLIGHT_SPAWN_CHANCE) || !canSpawnMonster(ctx, Species.PENANTE)) continue;
      if (spawnMonster(ctx, Species.PENANTE, x + 0.5, y + 0.5) !== NO_UNIT) announce(ctx, 'Los penantes vagan por el yermo maldito', BLIGHT_NOTICE_TICKS);
    } else if (ctx.tick >= SWAMP_GRACE_TICKS && w.ownerAt(x, y) < 0) {
      if (!rng.chance(SWAMP_SPAWN_CHANCE) || !canSpawnMonster(ctx, Species.CENAGOSO)) continue;
      if (spawnMonster(ctx, Species.CENAGOSO, x + 0.5, y + 0.5) !== NO_UNIT) announce(ctx, 'Un cenagoso ha salido de los pantanos', 0);
    }
  }
}
