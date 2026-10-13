import { SPECIES, isMonster, type SpeciesDef } from '../entities/species';
import { NO_UNIT, Sex, UnitState, type UnitStore } from '../entities/units';
import { Flora } from '../world/terrain';
import { DeathCause, STATE_TIMEOUT_TICKS, THINK_INTERVAL, giveUp, killUnit, type AiContext } from './context';
import { Move, moveToward, pickWanderTarget } from './movement';
import { recordBirth, setBreedCooldown } from './life';
import { inheritTraits } from '../entities/traits';
import { damageMultiplier, damageTakenMultiplier } from '../powers/status';

const HUNGRY_FRACTION = 0.6;
const BREED_FRACTION = 0.5;
const FULL_FRACTION = 0.95;
const GRASS_BITE = 5;
const HUNGER_PER_GRASS = 4;
const MIN_GRASS_TO_EAT = 15;
const BERRY_HUNGER = 350;
const BERRY_SCORE = 300;
const FOOD_SAMPLES = 10;
const ATTACK_COOLDOWN = 8;
const MELEE_RANGE = 0.9;
const MATE_RANGE = 1;
const WANDER_RADIUS = 6;
const FAR_WANDER_RADIUS = 14;
const FLEE_DISTANCE = 7;
const IDLE_CHANCE = 0.3;
const CROWD_RADIUS = 4;
const CROWD_LIMIT = 6;

/** Comportamiento de animales (herbívoros y depredadores); la vida común va en life.ts. */
export function updateAnimal(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  u.think[i]--;
  if (u.think[i] === 0) {
    u.think[i] = THINK_INTERVAL;
    if (u.stateTicks[i] > STATE_TIMEOUT_TICKS) giveUp(u, i);
    if (def.diet === 'herbivore') thinkHerbivore(ctx, i, def);
    else thinkCarnivore(ctx, i, def);
  }
  act(ctx, i, def);
}

export function isHungry(u: UnitStore, i: number, def: SpeciesDef): boolean {
  return u.hunger[i] < def.maxHunger * HUNGRY_FRACTION;
}

function thinkHerbivore(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const threat = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight, (j) => SPECIES[u.species[j]].diet === 'carnivore' || isMonster(u.species[j]));
  if (threat !== NO_UNIT) {
    flee(ctx, i, threat);
    return;
  }
  const s = u.state[i];
  if (s === UnitState.EAT || s === UnitState.MATE || s === UnitState.SEEK_FOOD) return;
  if (isHungry(u, i, def)) {
    seekFood(ctx, i, def);
    return;
  }
  if (tryFindMate(ctx, i, def)) return;
  wander(ctx, i, WANDER_RADIUS);
}

function thinkCarnivore(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.HUNT && u.resolve(u.target[i]) !== NO_UNIT) return;
  if (u.state[i] === UnitState.MATE) return;
  if (isHungry(u, i, def)) {
    const prey = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight, (j) => SPECIES[u.species[j]].diet === 'herbivore');
    if (prey !== NO_UNIT) {
      u.state[i] = UnitState.HUNT;
      u.target[i] = u.handleOf(prey);
      return;
    }
    wander(ctx, i, FAR_WANDER_RADIUS);
    return;
  }
  if (tryFindMate(ctx, i, def)) return;
  wander(ctx, i, WANDER_RADIUS);
}

function flee(ctx: AiContext, i: number, threat: number): void {
  const u = ctx.units;
  const dx = u.x[i] - u.x[threat];
  const dy = u.y[i] - u.y[threat];
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  u.tx[i] = u.x[i] + (dx / d) * FLEE_DISTANCE;
  u.ty[i] = u.y[i] + (dy / d) * FLEE_DISTANCE;
  u.state[i] = UnitState.FLEE;
  u.target[i] = NO_UNIT;
}

export function wander(ctx: AiContext, i: number, radius: number): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.WANDER) return;
  if (ctx.rng.chance(IDLE_CHANCE)) {
    u.state[i] = UnitState.IDLE;
    return;
  }
  u.state[i] = pickWanderTarget(ctx.world, u, i, ctx.rng, radius) ? UnitState.WANDER : UnitState.IDLE;
}

function seekFood(ctx: AiContext, i: number, def: SpeciesDef): void {
  const { world, units: u, rng } = ctx;
  const here = world.idx(Math.floor(u.x[i]), Math.floor(u.y[i]));
  if (world.grass[here] >= MIN_GRASS_TO_EAT || world.flora[here] === Flora.BERRY_BUSH) {
    u.state[i] = UnitState.EAT;
    return;
  }
  let bestScore = 0;
  let bestX = 0;
  let bestY = 0;
  const r = def.sight;
  for (let s = 0; s < FOOD_SAMPLES; s++) {
    const x = Math.floor(u.x[i]) + rng.range(-r, r);
    const y = Math.floor(u.y[i]) + rng.range(-r, r);
    if (!world.isWalkableAt(x, y)) continue;
    const t = world.idx(x, y);
    const score = world.grass[t] + (world.flora[t] === Flora.BERRY_BUSH ? BERRY_SCORE : 0);
    if (score > bestScore && (score >= MIN_GRASS_TO_EAT)) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }
  if (bestScore > 0) {
    u.tx[i] = bestX + 0.5;
    u.ty[i] = bestY + 0.5;
    u.state[i] = UnitState.SEEK_FOOD;
  } else {
    u.state[i] = UnitState.IDLE;
    wander(ctx, i, FAR_WANDER_RADIUS);
  }
}

/**
 * Los herbívoros (contados aparte) no pasan de esta parte del límite: dejan hueco a los
 * depredadores y a las aldeas. Si contaran a todas las criaturas, los lobos les quitarían
 * las plazas de cría mientras se los comen y ambas especies acabarían extinguiéndose.
 * Cada especie tiene su parte: con un cupo común, la que cría más rápido (conejos)
 * ocuparía todas las plazas libres y acabaría desplazando a la otra (ovejas).
 */
const HERBIVORE_LIMIT_SHARE = 0.7;
/** Un depredador sólo cría si hay al menos tantos herbívoros por cada depredador en el mundo. */
const PREY_PER_PREDATOR = 20;
const HERBIVORE_IDS: readonly number[] = SPECIES.filter((s) => s.diet === 'herbivore').map((s) => s.id);
const CARNIVORE_IDS: readonly number[] = SPECIES.filter((s) => s.diet === 'carnivore').map((s) => s.id);

function countOf(u: UnitStore, ids: readonly number[]): number {
  let n = 0;
  for (const id of ids) n += u.speciesCount[id];
  return n;
}

function hasRoomToBreed(ctx: AiContext, def: SpeciesDef): boolean {
  const u = ctx.units;
  if (u.count >= ctx.unitLimit) return false;
  if (def.diet === 'herbivore') return u.speciesCount[def.id] < (ctx.unitLimit * HERBIVORE_LIMIT_SHARE) / HERBIVORE_IDS.length;
  return countOf(u, HERBIVORE_IDS) >= countOf(u, CARNIVORE_IDS) * PREY_PER_PREDATOR;
}

function canBreed(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  return (
    u.age[i] >= def.adultTicks &&
    u.cooldown[i] === 0 &&
    u.hunger[i] >= def.maxHunger * BREED_FRACTION &&
    hasRoomToBreed(ctx, def)
  );
}

function isCrowded(ctx: AiContext, i: number): boolean {
  const u = ctx.units;
  const sp = u.species[i];
  let n = 0;
  ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], CROWD_RADIUS, (j) => {
    if (u.species[j] === sp) n++;
    return n >= CROWD_LIMIT;
  });
  return n >= CROWD_LIMIT;
}

function tryFindMate(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  if (!canBreed(ctx, i, def) || isCrowded(ctx, i)) return false;
  const mate = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight, (j) =>
    j !== i &&
    u.species[j] === u.species[i] &&
    u.sex[j] !== u.sex[i] &&
    u.state[j] !== UnitState.FLEE &&
    u.state[j] !== UnitState.HUNT &&
    u.state[j] !== UnitState.MATE &&
    canBreed(ctx, j, def),
  );
  if (mate === NO_UNIT) return false;
  u.state[i] = UnitState.MATE;
  u.target[i] = u.handleOf(mate);
  u.state[mate] = UnitState.MATE;
  u.target[mate] = u.handleOf(i);
  u.stateTicks[mate] = 0;
  return true;
}

function act(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  switch (u.state[i]) {
    case UnitState.WANDER:
      if (moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed) !== Move.MOVING) u.state[i] = UnitState.IDLE;
      break;
    case UnitState.SEEK_FOOD: {
      const r = moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed);
      if (r === Move.ARRIVED) u.state[i] = UnitState.EAT;
      else if (r === Move.BLOCKED) u.state[i] = UnitState.IDLE;
      break;
    }
    case UnitState.FLEE:
      if (moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed * def.sprint) !== Move.MOVING) u.state[i] = UnitState.IDLE;
      break;
    case UnitState.EAT:
      eat(ctx, i, def);
      break;
    case UnitState.HUNT:
      hunt(ctx, i, def);
      break;
    case UnitState.MATE:
      mate(ctx, i, def);
      break;
    default:
      break;
  }
}

function eat(ctx: AiContext, i: number, def: SpeciesDef): void {
  const { world, units: u } = ctx;
  const t = world.idx(Math.floor(u.x[i]), Math.floor(u.y[i]));
  if (world.flora[t] === Flora.BERRY_BUSH) {
    world.setFlora(t, Flora.BUSH);
    u.hunger[i] = Math.min(def.maxHunger, u.hunger[i] + BERRY_HUNGER);
  } else if (world.grass[t] >= GRASS_BITE) {
    world.setGrass(t, world.grass[t] - GRASS_BITE);
    u.hunger[i] = Math.min(def.maxHunger, u.hunger[i] + GRASS_BITE * HUNGER_PER_GRASS);
  } else {
    u.state[i] = UnitState.IDLE;
    u.think[i] = 1;
    return;
  }
  if (u.hunger[i] >= def.maxHunger * FULL_FRACTION) u.state[i] = UnitState.IDLE;
}

function hunt(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const prey = u.resolve(u.target[i]);
  if (prey === NO_UNIT) {
    giveUp(u, i);
    u.think[i] = 1;
    return;
  }
  const dx = u.x[prey] - u.x[i];
  const dy = u.y[prey] - u.y[i];
  const d2 = dx * dx + dy * dy;
  const maxChase = def.sight * 1.5;
  if (d2 > maxChase * maxChase) {
    giveUp(u, i);
    return;
  }
  if (d2 > MELEE_RANGE * MELEE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[prey], u.y[prey], def.speed * def.sprint) === Move.BLOCKED) {
      giveUp(u, i);
      wander(ctx, i, FAR_WANDER_RADIUS);
    }
    return;
  }
  if (u.attackCd[i] > 0) return;
  u.attackCd[i] = ATTACK_COOLDOWN;
  u.hp[prey] -= Math.max(1, Math.round(def.damage * damageMultiplier(u, i) * damageTakenMultiplier(u, prey)));
  if (u.hp[prey] > 0) return;
  const meat = SPECIES[u.species[prey]].meatValue;
  killUnit(ctx, prey, DeathCause.KILLED);
  u.hunger[i] = Math.min(def.maxHunger, u.hunger[i] + meat);
  u.addKill(i);
  u.state[i] = UnitState.IDLE;
  u.target[i] = NO_UNIT;
}

function mate(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const partner = u.resolve(u.target[i]);
  if (partner === NO_UNIT || u.resolve(u.target[partner]) !== i || u.state[partner] !== UnitState.MATE) {
    giveUp(u, i);
    return;
  }
  const dx = u.x[partner] - u.x[i];
  const dy = u.y[partner] - u.y[i];
  if (dx * dx + dy * dy > MATE_RANGE * MATE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[partner], u.y[partner], def.speed) === Move.BLOCKED) giveUp(u, i);
    return;
  }
  const mother = u.sex[i] === Sex.FEMALE ? i : partner;
  const generation = Math.max(u.generation[i], u.generation[partner]) + 1;
  const litter = ctx.rng.range(1, def.litterMax);
  for (let k = 0; k < litter && u.count < ctx.unitLimit; k++) {
    const child = u.spawn(def.id, u.x[mother], u.y[mother], {
      sex: ctx.rng.int(2),
      ageTicks: 0,
      generation: Math.min(generation, 0xffff),
      thinkOffset: ctx.rng.int(THINK_INTERVAL),
      traits: inheritTraits(u.traits[i], u.traits[partner], ctx.rng),
    });
    if (child !== NO_UNIT) recordBirth(ctx, i, partner);
  }
  setBreedCooldown(u, i, def);
  setBreedCooldown(u, partner, def);
  giveUp(u, i);
  giveUp(u, partner);
}
