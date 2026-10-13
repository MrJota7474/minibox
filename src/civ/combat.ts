import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { Move, moveToward, pickWanderTarget } from '../ai/movement';
import { Nav, clearPath, navigateTo } from '../ai/navigation';
import { monsterCount } from '../ai/monster-spawn';
import { isMonster, type SpeciesDef } from '../entities/species';
import { NO_UNIT, UnitState } from '../entities/units';
import { damageMultiplier, damageTakenMultiplier } from '../powers/status';
import { Job, type Village } from './model';
import { gearBonus, warriorBonus } from './society';

/** Los guerreros sólo combaten contra guerreros: las guerras cambian fronteras, no exterminan pueblos. */
const ENGAGE_SIGHT = 9;
const DEFEND_RADIUS = 16;
const SHELTER_RADIUS = 3;
const FLEE_RADIUS_CIVIL = 4;
/** De los monstruos se huye desde algo más lejos. */
const FLEE_RADIUS_MONSTER = 5;
/** Monstruos a esta distancia del ayuntamiento ponen la aldea en pie de guerra. */
const THREAT_RADIUS = 18;
/** Radio de alerta: cubre hasta donde llegan a trabajar los aldeanos, con margen. */
const ALERT_RADIUS = 40;
const MELEE_RANGE = 0.9;
const ATTACK_COOLDOWN = 8;
const GEAR_DAMAGE = 1.6;
export const GEAR_ARMOR = 0.7;
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

/** El monstruo más cercano a (x, y) dentro del radio y en la isla `region`, o -1. */
export function nearestMonster(ctx: AiContext, x: number, y: number, radius: number, region: number): number {
  const u = ctx.units;
  return ctx.spatial.nearest(u, x, y, radius, (j) => isMonster(u.species[j]) && ctx.world.regionAt(u.x[j], u.y[j]) === region);
}

/**
 * Marca las aldeas con algún monstruo en sus alrededores. Se recalcula al empezar cada
 * tick (dato derivado: no se guarda), para que sólo sus aldeanos hagan consultas espaciales.
 */
export function markMonsterAlerts(ctx: AiContext): void {
  const u = ctx.units;
  const alert = ctx.civ.monsterAlert;
  const villages = ctx.civ.villages;
  alert.length = villages.length;
  alert.fill(false);
  if (monsterCount(u) === 0) return;
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0 || !isMonster(u.species[i])) continue;
    for (const v of villages) {
      if (!v.alive || alert[v.id]) continue;
      const dx = v.cx - u.x[i];
      const dy = v.cy - u.y[i];
      if (dx * dx + dy * dy <= ALERT_RADIUS * ALERT_RADIUS) alert[v.id] = true;
    }
  }
}

/** ¿Hay monstruos rondando la aldea? (entonces recluta como en guerra) */
export function villageThreatened(ctx: AiContext, v: Village): boolean {
  if (monsterCount(ctx.units) === 0) return false;
  return nearestMonster(ctx, v.cx + 0.5, v.cy + 0.5, THREAT_RADIUS, ctx.world.regionAt(v.cx, v.cy)) !== NO_UNIT;
}

/**
 * Los guerreros combaten a los monstruos que ven o que se acercan a su aldea, haya o no
 * guerra. Devuelve true si el guerrero queda ocupado en ello.
 */
export function defendFromMonsters(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  if (!ctx.civ.monsterAlert[v.id]) return false;
  if (u.state[i] === UnitState.FIGHT && u.resolve(u.target[i]) !== NO_UNIT) return true;
  const region = ctx.world.regionAt(u.x[i], u.y[i]);
  let monster = nearestMonster(ctx, u.x[i], u.y[i], ENGAGE_SIGHT, region);
  if (monster === NO_UNIT) monster = nearestMonster(ctx, v.cx + 0.5, v.cy + 0.5, DEFEND_RADIUS, region);
  if (monster === NO_UNIT) return false;
  engage(ctx, i, monster);
  return true;
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
    // Si está en otra isla, se llega en barco: mientras tanto, a embarcar o a defender.
    if (ctx.world.regionAt(raid.cx, raid.cy) === ctx.world.regionAt(u.x[i], u.y[i])) {
      siege(ctx, i, raid);
      return true;
    }
    if (u.state[i] === UnitState.BOARD) return true;
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

/** Civiles: si un monstruo o un guerrero enemigo se acerca, huyen. Devuelve true si empezó a huir. */
export function fleeIfThreatened(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  if (u.state[i] === UnitState.FLEE) return false;
  let threat = ctx.civ.monsterAlert[v.id] ? nearestMonster(ctx, u.x[i], u.y[i], FLEE_RADIUS_MONSTER, ctx.world.regionAt(u.x[i], u.y[i])) : NO_UNIT;
  if (threat === NO_UNIT && ctx.civ.kingdoms.isAtWar(v.kingdom)) threat = nearestEnemy(ctx, i, u.x[i], u.y[i], FLEE_RADIUS_CIVIL, true);
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
  const monster = enemy !== NO_UNIT && isMonster(u.species[enemy]);
  if (enemy === NO_UNIT || (!monster && !ks.areHostile(ks.kingdomOfUnit(i), ks.kingdomOfUnit(enemy)))) return giveUp(u, i);
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
  // La cultura de su aldea cuenta: la forja mejora las armas y las culturas belicosas pegan más.
  const home = ctx.civ.villageOf(i);
  const weapon = u.gear[i] ? GEAR_DAMAGE * gearBonus(ctx.civ, home) : 1;
  const damage = def.damage * weapon * warriorBonus(ctx.civ, home) * (u.gear[enemy] ? GEAR_ARMOR : 1) * damageMultiplier(u, i) * damageTakenMultiplier(u, enemy);
  u.hp[enemy] -= Math.max(1, Math.round(damage));
  if (u.hp[enemy] > 0) return;
  if (!monster) ks.recordLoss(ks.kingdomOfUnit(enemy));
  killUnit(ctx, enemy, DeathCause.KILLED);
  u.addKill(i);
  giveUp(u, i);
  u.think[i] = 1;
}
