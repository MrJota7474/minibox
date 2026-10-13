import type { SpeciesDef } from '../entities/species';
import { traitMods } from '../entities/traits';
import { BIOME_INFO, isWalkableTerrain } from '../world/terrain';
import type { UnitStore } from '../entities/units';
import { DeathCause, killUnit, type AiContext } from './context';
import { escapeBlockedTile } from './movement';
import { healBonus } from '../civ/society';

const STARVE_INTERVAL = 50;
const STARVE_DAMAGE_FRACTION = 0.1;
const OLD_AGE_DEATH_CHANCE = 1 / 600;
const BLOCKED_DAMAGE = 3;
const BLOCKED_DAMAGE_INTERVAL = 5;
/** Curación lenta de las criaturas bien alimentadas. */
const HEAL_INTERVAL = 60;
const HEAL_FRACTION = 0.05;
const HEAL_MIN_HUNGER = 0.5;

/**
 * Edad, enfriamientos, vejez, hambre y casillas no pisables.
 * Común a animales y aldeanos. Devuelve false si la criatura murió.
 */
export function updateLife(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  u.age[i]++;
  if (u.cooldown[i] > 0) u.cooldown[i]--;
  if (u.attackCd[i] > 0) u.attackCd[i]--;
  const mods = traitMods(u.traits[i]);
  if (ctx.laws.aging && u.age[i] > def.lifespanTicks * mods.lifespan && ctx.rng.chance(OLD_AGE_DEATH_CHANCE)) {
    killUnit(ctx, i, DeathCause.AGE);
    return false;
  }
  const biome = BIOME_INFO[ctx.world.biome[ctx.world.idx(Math.floor(u.x[i]), Math.floor(u.y[i]))]] ?? BIOME_INFO[0];
  if (!updateHunger(ctx, i, def, mods.hunger * biome.hunger * ctx.climate.hunger)) return false;
  // A los no-muertos les pasa al revés: el yermo maldito los cura y la arboleda mágica los hiere.
  const vitality = def.monster?.undead ? -biome.vitality : biome.vitality;
  if (vitality !== 0 && (ctx.tick + i) % HEAL_INTERVAL === 0 && !applyVitality(ctx, i, def, vitality)) return false;
  // En un yermo maldito nadie se recupera por sí solo.
  if (vitality >= 0 && u.hp[i] < def.maxHp && (ctx.tick + i) % HEAL_INTERVAL === 0 && u.hunger[i] > def.maxHunger * HEAL_MIN_HUNGER) {
    // La medicina de su cultura cura antes a los aldeanos.
    const medicine = def.diet === 'civilized' ? healBonus(ctx.civ, ctx.civ.villageOf(i)) : 1;
    u.hp[i] = Math.min(def.maxHp, u.hp[i] + Math.max(1, Math.round(def.maxHp * HEAL_FRACTION * mods.heal * medicine)));
  }
  if (!ctx.world.isWalkableAt(u.x[i], u.y[i]) && !(def.monster?.fiery && standsOnLava(ctx, i)) && !handleBlockedTile(ctx, i)) return false;
  return true;
}

/** ¿Está sobre lava en terreno que, sin ella, sería pisable? (a los monstruos ardientes no los atrapa) */
function standsOnLava(ctx: AiContext, i: number): boolean {
  const w = ctx.world;
  const x = Math.floor(ctx.units.x[i]);
  const y = Math.floor(ctx.units.y[i]);
  if (!w.inBounds(x, y)) return false;
  const t = w.idx(x, y);
  return w.lava[t] > 0 && isWalkableTerrain(w.terrain[t]);
}

function updateHunger(ctx: AiContext, i: number, def: SpeciesDef, rate: number): boolean {
  const u = ctx.units;
  if (!ctx.laws.hunger) return true;
  const h = Math.max(0, u.hunger[i] - scaledStep(def.hungerRate, rate, ctx.tick + i));
  u.hunger[i] = h;
  if (h > 0 || (ctx.tick + i) % STARVE_INTERVAL !== 0) return true;
  u.hp[i] -= Math.max(1, Math.round(def.maxHp * STARVE_DAMAGE_FRACTION));
  if (u.hp[i] > 0) return true;
  killUnit(ctx, i, DeathCause.HUNGER);
  return false;
}

/**
 * Reparte un ritmo fraccionario en pasos enteros de forma determinista: a lo largo de
 * N ticks suma `base · mult · N` (p. ej. 1,3 por tick = 1, 1, 2, 1, 1, 2…).
 */
export function scaledStep(base: number, mult: number, phase: number): number {
  if (mult === 1) return base;
  const r = base * mult;
  return Math.floor((phase + 1) * r) - Math.floor(phase * r);
}

/** Pone el enfriamiento de cría según los rasgos de fertilidad. */
export function setBreedCooldown(u: UnitStore, i: number, def: SpeciesDef): void {
  u.cooldown[i] = Math.min(0xffff, Math.round(def.breedCooldownTicks * traitMods(u.traits[i]).breedCooldown));
}

/** Cuenta un nacimiento para la estadística y para cada progenitor. */
export function recordBirth(ctx: AiContext, a: number, b: number): void {
  const u = ctx.units;
  ctx.stats.births++;
  if (u.children[a] < 0xffff) u.children[a]++;
  if (u.children[b] < 0xffff) u.children[b]++;
}

/** Biomas mágicos: la arboleda cura y el yermo maldito hiere. Devuelve false si la criatura murió. */
function applyVitality(ctx: AiContext, i: number, def: SpeciesDef, vitality: number): boolean {
  const u = ctx.units;
  const amount = Math.max(1, Math.round(def.maxHp * Math.abs(vitality)));
  if (vitality > 0) {
    u.hp[i] = Math.min(def.maxHp, u.hp[i] + amount);
    return true;
  }
  u.hp[i] -= amount;
  if (u.hp[i] > 0) return true;
  killUnit(ctx, i, DeathCause.DISASTER);
  return false;
}

/** Devuelve false si la criatura murió atrapada (ahogada o aplastada). */
function handleBlockedTile(ctx: AiContext, i: number): boolean {
  const u = ctx.units;
  if (escapeBlockedTile(ctx.world, u, i)) {
    u.pathLen[i] = 0;
    return true;
  }
  if ((ctx.tick + i) % BLOCKED_DAMAGE_INTERVAL !== 0) return true;
  u.hp[i] -= BLOCKED_DAMAGE;
  if (u.hp[i] > 0) return true;
  const x = Math.min(ctx.world.width - 1, Math.max(0, Math.floor(u.x[i])));
  const y = Math.min(ctx.world.height - 1, Math.max(0, Math.floor(u.y[i])));
  killUnit(ctx, i, ctx.world.isWaterIdx(ctx.world.idx(x, y)) ? DeathCause.DROWNED : DeathCause.DIVINE);
  return false;
}
