import type { SpeciesDef } from '../entities/species';
import { DeathCause, killUnit, type AiContext } from './context';
import { escapeBlockedTile } from './movement';

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
  if (ctx.laws.aging && u.age[i] > def.lifespanTicks && ctx.rng.chance(OLD_AGE_DEATH_CHANCE)) {
    killUnit(ctx, i, DeathCause.AGE);
    return false;
  }
  if (!updateHunger(ctx, i, def)) return false;
  if (u.hp[i] < def.maxHp && (ctx.tick + i) % HEAL_INTERVAL === 0 && u.hunger[i] > def.maxHunger * HEAL_MIN_HUNGER) {
    u.hp[i] = Math.min(def.maxHp, u.hp[i] + Math.max(1, Math.round(def.maxHp * HEAL_FRACTION)));
  }
  if (!ctx.world.isWalkableAt(u.x[i], u.y[i]) && !handleBlockedTile(ctx, i)) return false;
  return true;
}

function updateHunger(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  if (!ctx.laws.hunger) return true;
  const h = Math.max(0, u.hunger[i] - def.hungerRate);
  u.hunger[i] = h;
  if (h > 0 || (ctx.tick + i) % STARVE_INTERVAL !== 0) return true;
  u.hp[i] -= Math.max(1, Math.round(def.maxHp * STARVE_DAMAGE_FRACTION));
  if (u.hp[i] > 0) return true;
  killUnit(ctx, i, DeathCause.HUNGER);
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
