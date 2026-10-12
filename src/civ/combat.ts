import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { Move, moveToward, pickWanderTarget } from '../ai/movement';
import { Nav, clearPath, navigateTo } from '../ai/navigation';
import type { SpeciesDef } from '../entities/species';
import { NO_UNIT, UnitState } from '../entities/units';
import { Job, type Village } from './model';

/** Los guerreros sólo combaten contra guerreros: las guerras cambian fronteras, no exterminan pueblos. */
const ENGAGE_SIGHT = 9;
const DEFEND_RADIUS = 16;
const SHELTER_RADIUS = 3;
const FLEE_RADIUS_CIVIL = 4;
const MELEE_RANGE = 0.9;
const ATTACK_COOLDOWN = 8;
const GEAR_DAMAGE = 1.6;
const GEAR_ARMOR = 0.7;
const SIEGE_DISTANCE = 5;
const SIEGE_WANDER = 4;

/** El enemigo más cercano (de un reino en guerra con el suyo) dentro del radio, o -1. */
export function nearestEnemy(ctx: AiContext, i: number, x: number, y: number, radius: number, warriorsOnly: boolean): number {
  const u = ctx.units;
  const ks = ctx.civ.kingdoms;
  const mine = ks.kingdomOfUnit(i);
  if (mine < 0) return NO_UNIT;
  return ctx.spatial.nearest(u, x, y, radius, (j) => (!warriorsOnly || u.job[j] === Job.WARRIOR) && ks.areHostile(mine, ks.kingdomOfUnit(j)));
}

function engage(ctx: AiContext, i: number, enemy: number): void {
  const u = ctx.units;
  ctx.civ.releaseWork(i);
  clearPath(ctx, i);
  u.state[i] = UnitState.FIGHT;
  u.target[i] = u.handleOf(enemy);
}

/**
 * Decisión de un guerrero cuando su reino está en guerra. Devuelve false en tiempos
 * de paz (entonces se comporta como un aldeano de guardia).
 */
export function thinkWarrior(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  if (!ctx.civ.kingdoms.isAtWar(v.kingdom)) return false;
  if (u.state[i] === UnitState.FIGHT && u.resolve(u.target[i]) !== NO_UNIT) return true;
  const near = nearestEnemy(ctx, i, u.x[i], u.y[i], ENGAGE_SIGHT, true);
  if (near !== NO_UNIT) {
    engage(ctx, i, near);
    return true;
  }
  const raid = v.armyTarget >= 0 ? ctx.civ.villages[v.armyTarget] : null;
  if (raid && raid.alive && ctx.civ.kingdoms.areHostile(v.kingdom, raid.kingdom)) {
    siege(ctx, i, raid);
    return true;
  }
  // Defensa: enemigos cerca de casa.
  const intruder = nearestEnemy(ctx, i, v.cx + 0.5, v.cy + 0.5, DEFEND_RADIUS, true);
  if (intruder !== NO_UNIT) {
    engage(ctx, i, intruder);
    return true;
  }
  return false;
}

/** Marcha hacia la aldea enemiga y, al llegar, la rodea para conquistarla. */
function siege(ctx: AiContext, i: number, raid: Village): void {
  const u = ctx.units;
  const dx = raid.cx + 0.5 - u.x[i];
  const dy = raid.cy + 0.5 - u.y[i];
  if (dx * dx + dy * dy > SIEGE_DISTANCE * SIEGE_DISTANCE) {
    if (u.state[i] === UnitState.MARCH) return;
    u.tx[i] = raid.cx + 0.5;
    u.ty[i] = raid.cy + 0.5;
    clearPath(ctx, i);
    u.state[i] = UnitState.MARCH;
    return;
  }
  if (u.state[i] === UnitState.WANDER) return;
  const ox = u.x[i];
  const oy = u.y[i];
  u.x[i] = raid.cx + 0.5;
  u.y[i] = raid.cy + 0.5;
  const ok = pickWanderTarget(ctx.world, u, i, ctx.rng, SIEGE_WANDER);
  u.x[i] = ox;
  u.y[i] = oy;
  u.state[i] = ok ? UnitState.WANDER : UnitState.IDLE;
}

/** Civiles: si un guerrero enemigo se acerca, huyen. Devuelve true si empezó a huir. */
export function fleeIfThreatened(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  if (u.state[i] === UnitState.FLEE || !ctx.civ.kingdoms.isAtWar(v.kingdom)) return false;
  const threat = nearestEnemy(ctx, i, u.x[i], u.y[i], FLEE_RADIUS_CIVIL, true);
  if (threat === NO_UNIT) return false;
  ctx.civ.releaseWork(i);
  // Se refugian en su ayuntamiento (así defienden la aldea con su presencia); si ya están allí, se apartan del enemigo.
  const hx = v.cx + 0.5 - u.x[i];
  const hy = v.cy + 0.5 - u.y[i];
  if (hx * hx + hy * hy > SHELTER_RADIUS * SHELTER_RADIUS) {
    u.tx[i] = v.cx + 0.5;
    u.ty[i] = v.cy + 0.5;
  } else {
    const dx = u.x[i] - u.x[threat];
    const dy = u.y[i] - u.y[threat];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    u.tx[i] = u.x[i] + (dx / d) * 2;
    u.ty[i] = u.y[i] + (dy / d) * 2;
  }
  clearPath(ctx, i);
  u.state[i] = UnitState.FLEE;
  return true;
}

export function actFlee(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  if (moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed * def.sprint) !== Move.MOVING) giveUp(u, i);
}

export function actMarch(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const r = navigateTo(ctx, i, u.tx[i], u.ty[i], def.speed);
  if (r === Nav.ARRIVED || r === Nav.FAILED) giveUp(u, i);
}

/** Combate cuerpo a cuerpo; las armas de hierro hacen más daño y protegen. */
export function actFight(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const enemy = u.resolve(u.target[i]);
  const ks = ctx.civ.kingdoms;
  if (enemy === NO_UNIT || !ks.areHostile(ks.kingdomOfUnit(i), ks.kingdomOfUnit(enemy))) return giveUp(u, i);
  const dx = u.x[enemy] - u.x[i];
  const dy = u.y[enemy] - u.y[i];
  const d2 = dx * dx + dy * dy;
  if (d2 > ENGAGE_SIGHT * ENGAGE_SIGHT * 4) return giveUp(u, i);
  if (d2 > MELEE_RANGE * MELEE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[enemy], u.y[enemy], def.speed * def.sprint) === Move.BLOCKED) giveUp(u, i);
    return;
  }
  if (u.attackCd[i] > 0) return;
  u.attackCd[i] = ATTACK_COOLDOWN;
  const damage = def.damage * (u.gear[i] ? GEAR_DAMAGE : 1) * (u.gear[enemy] ? GEAR_ARMOR : 1);
  u.hp[enemy] -= Math.max(1, Math.round(damage));
  if (u.hp[enemy] > 0) return;
  ks.recordLoss(ks.kingdomOfUnit(enemy));
  killUnit(ctx, enemy, DeathCause.KILLED);
  u.kills[i]++;
  giveUp(u, i);
  u.think[i] = 1;
}
