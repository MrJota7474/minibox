import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { Move, moveToward, pickWanderTarget } from '../ai/movement';
import { isMonster, type SpeciesDef } from '../entities/species';
import { Trait, addTrait, traitMods } from '../entities/traits';
import { ABOARD_FLAG, CURSED_FLAG, HELD_FLAG, NO_UNIT, UnitState, type UnitStore } from '../entities/units';

/** Estados permanentes (bits de `units.status`). */
export const Status = { BLESSED: 1, CURSED: CURSED_FLAG, IMMUNE: 4, HELD: HELD_FLAG, ABOARD: ABOARD_FLAG } as const;

export const PLAGUE_DURATION = 900;
const PLAGUE_DAMAGE_INTERVAL = 20;
const PLAGUE_DAMAGE = 2;
const PLAGUE_SPREAD_INTERVAL = 30;
const PLAGUE_SPREAD_RADIUS = 1.6;
const PLAGUE_SPREAD_CHANCE = 0.35;
export const MADNESS_DURATION = 1200;
const MAD_SIGHT = 8;
const MAD_WANDER = 6;
const MELEE_RANGE = 0.9;
const ATTACK_COOLDOWN = 8;
const BLESSED_DAMAGE = 1.5;
const CURSED_DAMAGE = 0.6;
const BLESSED_TAKEN = 0.6;
const CURSED_TAKEN = 1.5;
/** Parte de su vida que la luz divina le quita a un no-muerto. */
const SMITE_FRACTION = 0.6;

export function has(u: UnitStore, i: number, flag: number): boolean {
  return (u.status[i] & flag) !== 0;
}

/** Contagia la plaga (salvo a los inmunes, a los ya enfermos y a los monstruos). */
export function infect(u: UnitStore, i: number): boolean {
  if (has(u, i, Status.IMMUNE) || u.plague[i] > 0 || isMonster(u.species[i]) || traitMods(u.traits[i]).plagueImmune) return false;
  u.plague[i] = PLAGUE_DURATION;
  return true;
}

export function bless(u: UnitStore, i: number): void {
  u.status[i] = (u.status[i] | Status.BLESSED) & ~Status.CURSED;
}

export function curse(u: UnitStore, i: number): void {
  u.status[i] = (u.status[i] | Status.CURSED) & ~Status.BLESSED;
}

export function madden(u: UnitStore, i: number): void {
  u.mad[i] = MADNESS_DURATION;
}

/** Luz divina: cura heridas, plaga, locura y maldición. */
export function heal(u: UnitStore, i: number, def: SpeciesDef): void {
  u.hp[i] = def.maxHp;
  u.plague[i] = 0;
  u.mad[i] = 0;
  u.status[i] &= ~Status.CURSED;
}

/** Luz divina sobre un no-muerto: en vez de curarlo, lo deshace. */
export function smite(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  u.hp[i] -= Math.ceil(def.maxHp * SMITE_FRACTION);
  if (u.hp[i] <= 0) killUnit(ctx, i, DeathCause.DIVINE);
}

/** Multiplicador del daño que hace la criatura. */
export function damageMultiplier(u: UnitStore, i: number): number {
  return (has(u, i, Status.BLESSED) ? BLESSED_DAMAGE : 1) * (has(u, i, Status.CURSED) ? CURSED_DAMAGE : 1) * traitMods(u.traits[i]).damage;
}

/** Multiplicador del daño que recibe la criatura. */
export function damageTakenMultiplier(u: UnitStore, i: number): number {
  return (has(u, i, Status.BLESSED) ? BLESSED_TAKEN : 1) * (has(u, i, Status.CURSED) ? CURSED_TAKEN : 1) * traitMods(u.traits[i]).damageTaken;
}

/** Aplica un golpe de i a j con los modificadores de estado. Devuelve true si j murió. */
export function strike(ctx: AiContext, i: number, j: number, baseDamage: number): boolean {
  const u = ctx.units;
  const damage = Math.max(1, Math.round(baseDamage * damageMultiplier(u, i) * damageTakenMultiplier(u, j)));
  u.hp[j] -= damage;
  if (u.hp[j] > 0) return false;
  killUnit(ctx, j, DeathCause.KILLED);
  u.addKill(i);
  return true;
}

/** Plaga: daño periódico y contagio a los vecinos. Devuelve false si la criatura murió. */
export function updatePlague(ctx: AiContext, i: number): boolean {
  const u = ctx.units;
  if (u.plague[i] === 0) return true;
  u.plague[i]--;
  if ((ctx.tick + i) % PLAGUE_DAMAGE_INTERVAL === 0) {
    u.hp[i] -= Math.max(1, Math.round(PLAGUE_DAMAGE * damageTakenMultiplier(u, i)));
    if (u.hp[i] <= 0) {
      killUnit(ctx, i, DeathCause.PLAGUE);
      return false;
    }
  }
  if ((ctx.tick + i) % PLAGUE_SPREAD_INTERVAL === 0) {
    ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], PLAGUE_SPREAD_RADIUS, (j) => {
      if (j !== i && ctx.rng.chance(PLAGUE_SPREAD_CHANCE)) infect(u, j);
    });
  }
  // Quien sobrevive a la plaga queda inmune y curtido.
  if (u.plague[i] === 0) {
    u.status[i] |= Status.IMMUNE;
    u.traits[i] = addTrait(u.traits[i], Trait.SURVIVOR);
  }
  return true;
}

/**
 * Locura: la criatura ataca a cualquiera que tenga cerca. Mientras dura sustituye a su IA
 * normal; devuelve true si se encargó del tick.
 */
export function updateMadness(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  if (u.mad[i] === 0) return false;
  u.mad[i]--;
  // Un aldeano enloquecido abandona su tarea (y la casilla que tenía reservada).
  if (u.work[i] >= 0) ctx.civ.releaseWork(i);
  if (u.mad[i] === 0) {
    giveUp(u, i);
    return false;
  }
  let target = u.state[i] === UnitState.FIGHT ? u.resolve(u.target[i]) : NO_UNIT;
  if (target === NO_UNIT && (ctx.tick + i) % 5 === 0) {
    target = ctx.spatial.nearest(u, u.x[i], u.y[i], MAD_SIGHT, (j) => j !== i && (u.status[j] & Status.HELD) === 0);
    if (target !== NO_UNIT) {
      u.state[i] = UnitState.FIGHT;
      u.target[i] = u.handleOf(target);
    }
  }
  if (target === NO_UNIT) {
    if (u.state[i] !== UnitState.WANDER && pickWanderTarget(ctx.world, u, i, ctx.rng, MAD_WANDER)) u.state[i] = UnitState.WANDER;
    if (u.state[i] === UnitState.WANDER && moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed) !== Move.MOVING) u.state[i] = UnitState.IDLE;
    return true;
  }
  const dx = u.x[target] - u.x[i];
  const dy = u.y[target] - u.y[i];
  if (dx * dx + dy * dy > MELEE_RANGE * MELEE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[target], u.y[target], def.speed * def.sprint) === Move.BLOCKED) giveUp(u, i);
    return true;
  }
  if (u.attackCd[i] === 0) {
    u.attackCd[i] = ATTACK_COOLDOWN;
    if (strike(ctx, i, target, Math.max(2, def.damage))) giveUp(u, i);
  }
  return true;
}
