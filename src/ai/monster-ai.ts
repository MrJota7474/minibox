import { GEAR_ARMOR } from '../civ/combat';
import { BuildingType, type Building, type Village } from '../civ/model';
import { SPECIES, isCivilized, isMonster, type SpeciesDef } from '../entities/species';
import { NO_UNIT, OFFMAP_FLAGS, UnitState } from '../entities/units';
import { damageMultiplier, damageTakenMultiplier } from '../powers/status';
import { wander } from './animal-ai';
import { DeathCause, THINK_INTERVAL, giveUp, killUnit, type AiContext } from './context';
import { Move, moveToward } from './movement';
import { Nav, clearPath, navigateTo } from './navigation';

const MELEE_RANGE = 0.9;
const ATTACK_COOLDOWN = 8;
/** Los animales sólo les interesan si se cruzan en su camino; en calma, tampoco buscan más lejos. */
const NEAR_PREY = 3;
const WANDER_RADIUS = 6;
/** A esta distancia del centro de la aldea dejan de marchar y eligen un edificio. */
const RAID_ARRIVE = 7;
/** Distancia al muro desde la que golpean un edificio. */
const RAZE_REACH = 1.3;
/** Calma tras un asalto o una persecución imposibles, antes de volver a intentarlo. */
const RAID_RETRY_TICKS = 300;
const CHASE_RETRY_TICKS = 60;
/** Tras tanto tiempo en la misma tarea sin acabarla, la abandonan. */
const MONSTER_TIMEOUT_TICKS = 1500;
/** Probabilidad de que un golpe de un monstruo ardiente prenda la casilla. */
const IGNITE_CHANCE = 0.15;

/** Comportamiento de un monstruo (la vida común va en life.ts). */
export function updateMonster(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  u.think[i]--;
  if (u.think[i] === 0) {
    u.think[i] = THINK_INTERVAL;
    if (u.stateTicks[i] > MONSTER_TIMEOUT_TICKS) abandon(ctx, i, RAID_RETRY_TICKS);
    think(ctx, i, def);
  }
  act(ctx, i, def);
}

/** Deja lo que hacía y se queda en calma `rest` ticks (`cooldown` es su reloj de calma). */
function abandon(ctx: AiContext, i: number, rest: number): void {
  const u = ctx.units;
  u.work[i] = -1;
  giveUp(u, i);
  if (rest > u.cooldown[i]) u.cooldown[i] = rest;
}

function think(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.FIGHT && u.resolve(u.target[i]) !== NO_UNIT) return;
  const calm = u.cooldown[i] > 0;
  const prey = findPrey(ctx, i, calm ? NEAR_PREY : def.sight);
  if (prey !== NO_UNIT) {
    u.work[i] = -1;
    clearPath(ctx, i);
    u.state[i] = UnitState.FIGHT;
    u.target[i] = u.handleOf(prey);
    return;
  }
  if (u.state[i] === UnitState.RAZE || u.state[i] === UnitState.MARCH) return;
  if (!calm && startRaid(ctx, i, def.monster?.raidRadius ?? 0)) return;
  wander(ctx, i, WANDER_RADIUS);
}

/**
 * La presa más cercana de su isla: cualquier aldeano a la vista o un herbívoro que pase
 * al lado. A los depredadores los dejan en paz (son pocos y no sabrían huir de ellos).
 */
function findPrey(ctx: AiContext, i: number, sight: number): number {
  const u = ctx.units;
  const w = ctx.world;
  const region = w.regionAt(u.x[i], u.y[i]);
  let best = NO_UNIT;
  let bestD = Infinity;
  ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], sight, (j, d2) => {
    const species = u.species[j];
    if (j === i || d2 >= bestD || isMonster(species)) return;
    if (!isCivilized(species) && (d2 > NEAR_PREY * NEAR_PREY || SPECIES[species].diet !== 'herbivore')) return;
    if (w.regionAt(u.x[j], u.y[j]) !== region) return;
    best = j;
    bestD = d2;
  });
  return best;
}

/** Marcha hacia la aldea más cercana o, si ya está en ella, elige un edificio que arrasar. */
function startRaid(ctx: AiContext, i: number, radius: number): boolean {
  const u = ctx.units;
  const v = nearestVillage(ctx, i, radius);
  if (!v) return false;
  const dx = v.cx + 0.5 - u.x[i];
  const dy = v.cy + 0.5 - u.y[i];
  if (dx * dx + dy * dy > RAID_ARRIVE * RAID_ARRIVE) {
    u.tx[i] = v.cx + 0.5;
    u.ty[i] = v.cy + 0.5;
    clearPath(ctx, i);
    u.state[i] = UnitState.MARCH;
    return true;
  }
  const b = pickBuilding(ctx, i, v);
  if (!b) return false;
  u.work[i] = ctx.world.size + b.id;
  u.tx[i] = b.x + b.w / 2;
  u.ty[i] = b.y + b.h / 2;
  clearPath(ctx, i);
  u.state[i] = UnitState.RAZE;
  return true;
}

function nearestVillage(ctx: AiContext, i: number, radius: number): Village | null {
  const u = ctx.units;
  const w = ctx.world;
  const region = w.regionAt(u.x[i], u.y[i]);
  let best: Village | null = null;
  let bestD = radius * radius;
  for (const v of ctx.civ.villages) {
    if (!v.alive || w.regionAt(v.cx, v.cy) !== region) continue;
    const dx = v.cx - u.x[i];
    const dy = v.cy - u.y[i];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/** El edificio más cercano; el ayuntamiento sólo cuando no queda otra cosa en pie. */
function pickBuilding(ctx: AiContext, i: number, v: Village): Building | null {
  const u = ctx.units;
  let best: Building | null = null;
  let bestD = Infinity;
  let hall: Building | null = null;
  for (const id of v.buildingIds) {
    const b = ctx.civ.buildings[id];
    if (!b.alive) continue;
    if (b.type === BuildingType.HALL) {
      hall = b;
      continue;
    }
    const dx = b.x + b.w / 2 - u.x[i];
    const dy = b.y + b.h / 2 - u.y[i];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best ?? hall;
}

function act(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  switch (u.state[i]) {
    case UnitState.WANDER:
      if (moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed) !== Move.MOVING) u.state[i] = UnitState.IDLE;
      break;
    case UnitState.MARCH:
      march(ctx, i, def);
      break;
    case UnitState.FIGHT:
      fight(ctx, i, def);
      break;
    case UnitState.RAZE:
      raze(ctx, i, def);
      break;
    default:
      break;
  }
}

function march(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const dx = u.tx[i] - u.x[i];
  const dy = u.ty[i] - u.y[i];
  const r = dx * dx + dy * dy <= RAID_ARRIVE * RAID_ARRIVE ? Nav.ARRIVED : navigateTo(ctx, i, u.tx[i], u.ty[i], def.speed);
  if (r === Nav.ARRIVED) {
    giveUp(u, i);
    u.think[i] = 1;
  } else if (r === Nav.FAILED) {
    abandon(ctx, i, RAID_RETRY_TICKS);
  }
}

function fight(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const prey = u.resolve(u.target[i]);
  if (prey === NO_UNIT || (u.status[prey] & OFFMAP_FLAGS) !== 0) {
    giveUp(u, i);
    u.think[i] = 1;
    return;
  }
  const dx = u.x[prey] - u.x[i];
  const dy = u.y[prey] - u.y[i];
  const d2 = dx * dx + dy * dy;
  const maxChase = def.sight * 1.5;
  if (d2 > maxChase * maxChase) return giveUp(u, i);
  if (d2 > MELEE_RANGE * MELEE_RANGE) {
    if (navigateTo(ctx, i, u.x[prey], u.y[prey], def.speed * def.sprint) === Nav.FAILED) abandon(ctx, i, CHASE_RETRY_TICKS);
    return;
  }
  if (u.attackCd[i] > 0) return;
  u.attackCd[i] = ATTACK_COOLDOWN;
  const m = def.monster;
  const px = Math.floor(u.x[prey]);
  const py = Math.floor(u.y[prey]);
  if (m?.fiery && ctx.world.inBounds(px, py) && ctx.rng.chance(IGNITE_CHANCE)) ctx.hazards.ignite(ctx.world.idx(px, py));
  const damage = def.damage * (u.gear[prey] ? GEAR_ARMOR : 1) * damageMultiplier(u, i) * damageTakenMultiplier(u, prey);
  u.hp[prey] -= Math.max(1, Math.round(damage));
  if (u.hp[prey] > 0) return;
  const sated = isCivilized(u.species[prey]) ? (m?.restTicks ?? 0) : 0;
  killUnit(ctx, prey, DeathCause.KILLED, i);
  u.addKill(i);
  abandon(ctx, i, sated);
  u.think[i] = 1;
}

/** Golpea el edificio elegido hasta echarlo abajo (el daño se suma al del fuego). */
function raze(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const b = u.work[i] >= ctx.world.size ? ctx.civ.building(u.work[i] - ctx.world.size) : null;
  if (!b) {
    abandon(ctx, i, 0);
    u.think[i] = 1;
    return;
  }
  const nx = Math.max(b.x, Math.min(u.x[i], b.x + b.w));
  const ny = Math.max(b.y, Math.min(u.y[i], b.y + b.h));
  const dx = nx - u.x[i];
  const dy = ny - u.y[i];
  if (dx * dx + dy * dy > RAZE_REACH * RAZE_REACH) {
    if (navigateTo(ctx, i, u.tx[i], u.ty[i], def.speed) === Nav.FAILED) abandon(ctx, i, RAID_RETRY_TICKS);
    return;
  }
  if (u.attackCd[i] > 0) return;
  u.attackCd[i] = ATTACK_COOLDOWN;
  const tile = ctx.world.idx(b.x, b.y);
  if (def.monster?.fiery && ctx.rng.chance(IGNITE_CHANCE)) ctx.hazards.ignite(tile);
  ctx.civ.burnBuildingAt(tile, def.monster?.raze ?? 1);
}
