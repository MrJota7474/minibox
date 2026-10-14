import { SPECIES, isMonster, type SpeciesDef } from '../entities/species';
import { NO_UNIT, Sex, UnitState, type UnitStore } from '../entities/units';
import { Flora } from '../world/terrain';
import { DeathCause, STATE_TIMEOUT_TICKS, THINK_INTERVAL, giveUp, killUnit, type AiContext } from './context';
import { Move, moveToward, pickWanderTarget } from './movement';
import { habitatCap, inHabitat, isScarce } from './habitat';
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
/** Con tantos de su especie a esta distancia ya no cría... */
const CROWD_RADIUS = 5;
const CROWD_LIMIT = 4;
/** ...y con tantos, se aleja del grupo. */
const DISPERSE_LIMIT = 5;
const DISPERSE_DISTANCE = 14;
/** Intentos para encontrar un destino de paseo dentro de su hábitat. */
const HABITAT_TRIES = 4;
/**
 * Distancia a la que un animal busca pareja: más que su vista, porque las especies escasas
 * (osos, zorros, lobos) viven repartidas y si no, nunca se encontrarían.
 */
const MATE_SEARCH = 24;
/**
 * Olfato: un depredador con hambre busca presa más allá de su vista. Con los herbívoros
 * repartidos por todo su hábitat, si sólo mirara hasta donde ve moriría de hambre.
 */
const SCENT_FACTOR = 2.5;
/** Hasta dónde persigue una presa antes de rendirse (respecto al olfato). */
const CHASE_FACTOR = 1.2;

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
  const threat = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight, (j) => isMonster(u.species[j]) || canHunt(SPECIES[u.species[j]], def));
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
  if (disperse(ctx, i, def)) return;
  wander(ctx, i, WANDER_RADIUS, def);
}

/** ¿Puede el depredador cazar a esa especie? (según el tamaño: el zorro, presas pequeñas; el oso, cualquiera) */
export function canHunt(hunter: SpeciesDef, prey: SpeciesDef): boolean {
  return hunter.diet === 'carnivore' && prey.diet === 'herbivore' && (prey.animal?.bodySize ?? 1) <= (hunter.animal?.preyMax ?? 0);
}

function thinkCarnivore(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.HUNT && u.resolve(u.target[i]) !== NO_UNIT) return;
  if (u.state[i] === UnitState.MATE) return;
  if (isHungry(u, i, def)) {
    const prey = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight * SCENT_FACTOR, (j) => canHunt(def, SPECIES[u.species[j]]) && !isScarce(u.speciesCount, u.species[j]));
    if (prey !== NO_UNIT) {
      u.state[i] = UnitState.HUNT;
      u.target[i] = u.handleOf(prey);
      return;
    }
    // Zorros y osos, a falta de presa, comen bayas.
    if (def.animal?.omnivore && u.state[i] !== UnitState.SEEK_FOOD && u.state[i] !== UnitState.EAT && seekBerries(ctx, i, def)) return;
    wander(ctx, i, FAR_WANDER_RADIUS, def);
    return;
  }
  if (tryFindMate(ctx, i, def)) return;
  if (disperse(ctx, i, def)) return;
  wander(ctx, i, WANDER_RADIUS, def);
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

/** Pasea cerca; un animal (con `def`) prefiere los destinos de su hábitat. */
export function wander(ctx: AiContext, i: number, radius: number, def?: SpeciesDef): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.WANDER) return;
  if (ctx.rng.chance(IDLE_CHANCE)) {
    u.state[i] = UnitState.IDLE;
    return;
  }
  if (!def?.animal) {
    u.state[i] = pickWanderTarget(ctx.world, u, i, ctx.rng, radius) ? UnitState.WANDER : UnitState.IDLE;
    return;
  }
  // Se queda con el primer destino de su hábitat; si no hay ninguno, con el último pisable.
  let found = false;
  for (let k = 0; k < HABITAT_TRIES; k++) {
    if (!pickWanderTarget(ctx.world, u, i, ctx.rng, radius)) continue;
    found = true;
    const t = ctx.world.idx(Math.floor(u.tx[i]), Math.floor(u.ty[i]));
    if (inHabitat(def, ctx.world, t)) break;
  }
  u.state[i] = found ? UnitState.WANDER : UnitState.IDLE;
}

/** Si hay demasiados de su especie alrededor, se aleja del grupo. Devuelve true si se va. */
/**
 * Direcciones que se prueban al dispersarse: la contraria al grupo y, si esa está cortada
 * (agua, fuera del hábitat), girada unos 50° a cada lado (coseno y seno precalculados: la
 * simulación no usa trigonometría).
 */
const DISPERSE_TURNS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.6428, 0.766],
  [0.6428, -0.766],
];
/** Puntos del camino que se comprueban (en fracciones del trayecto) para no cruzar agua. */
const DISPERSE_CHECKS: readonly number[] = [0.33, 0.66, 1];

function disperse(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const u = ctx.units;
  const sp = u.species[i];
  let n = 0;
  let sx = 0;
  let sy = 0;
  ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], CROWD_RADIUS, (j) => {
    if (j === i || u.species[j] !== sp) return;
    n++;
    sx += u.x[j];
    sy += u.y[j];
  });
  if (n < DISPERSE_LIMIT) return false;
  // Hacia el lado contrario al centro del grupo (o en una dirección al azar si está en medio).
  let dx = u.x[i] - sx / n;
  let dy = u.y[i] - sy / n;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.2) {
    dx = ctx.rng.range(-10, 10);
    dy = ctx.rng.range(-10, 10);
  }
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const w = ctx.world;
  // Si ninguna dirección sirve (en una playa, junto a un lago), pasea como siempre.
  for (const [c, sn] of DISPERSE_TURNS) {
    const rx = ux * c - uy * sn;
    const ry = ux * sn + uy * c;
    const tx = Math.floor(u.x[i] + rx * DISPERSE_DISTANCE) + 0.5;
    const ty = Math.floor(u.y[i] + ry * DISPERSE_DISTANCE) + 0.5;
    if (!DISPERSE_CHECKS.every((f) => w.isWalkableAt(u.x[i] + rx * DISPERSE_DISTANCE * f, u.y[i] + ry * DISPERSE_DISTANCE * f))) continue;
    if (!inHabitat(def, w, w.idx(Math.floor(tx), Math.floor(ty)))) continue;
    u.tx[i] = tx;
    u.ty[i] = ty;
    u.state[i] = UnitState.WANDER;
    return true;
  }
  return false;
}

/** Busca un arbusto con bayas cerca (para los omnívoros). Devuelve true si va hacia uno. */
function seekBerries(ctx: AiContext, i: number, def: SpeciesDef): boolean {
  const { world, units: u, rng } = ctx;
  // Los arbustos con bayas escasean: se busca más lejos y en más sitios que la hierba.
  const r = def.sight * 2;
  for (let s = 0; s < FOOD_SAMPLES * 2; s++) {
    const x = Math.floor(u.x[i]) + rng.range(-r, r);
    const y = Math.floor(u.y[i]) + rng.range(-r, r);
    if (!world.isWalkableAt(x, y) || world.flora[world.idx(x, y)] !== Flora.BERRY_BUSH) continue;
    u.tx[i] = x + 0.5;
    u.ty[i] = y + 0.5;
    u.state[i] = UnitState.SEEK_FOOD;
    return true;
  }
  return false;
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
    wander(ctx, i, FAR_WANDER_RADIUS, def);
  }
}

/**
 * Cada especie cría hasta llenar su hábitat (ver habitat.ts) y nunca pasa de su parte del
 * límite de criaturas, para dejar hueco a las aldeas. Cada una tiene su parte: con un cupo
 * común, la que cría más rápido ocuparía todas las plazas libres y desplazaría a las demás.
 * Si los herbívoros contaran a todas las criaturas, los depredadores les quitarían las
 * plazas de cría mientras se los comen y ambos acabarían extinguiéndose.
 */
const HERBIVORE_LIMIT_SHARE = 0.4;
const CARNIVORE_LIMIT_SHARE = 0.06;
/**
 * Un depredador sólo cría si hay al menos tantas presas suyas (las que puede cazar) por cada
 * uno de su especie: cada especie cuenta las suyas, así los zorros no dependen de los lobos.
 */
const PREY_PER_PREDATOR = 10;
const HERBIVORE_IDS: readonly number[] = SPECIES.filter((s) => s.diet === 'herbivore').map((s) => s.id);
const CARNIVORE_IDS: readonly number[] = SPECIES.filter((s) => s.diet === 'carnivore').map((s) => s.id);
/** Presas de cada especie (vacío si no es depredador). */
const PREY_IDS: readonly (readonly number[])[] = SPECIES.map((hunter) => HERBIVORE_IDS.filter((h) => canHunt(hunter, SPECIES[h])));

function countOf(u: UnitStore, ids: readonly number[]): number {
  let n = 0;
  for (const id of ids) n += u.speciesCount[id];
  return n;
}

function hasRoomToBreed(ctx: AiContext, def: SpeciesDef): boolean {
  const u = ctx.units;
  if (u.count >= ctx.unitLimit) return false;
  const herbivore = def.diet === 'herbivore';
  const share = herbivore ? HERBIVORE_LIMIT_SHARE / HERBIVORE_IDS.length : CARNIVORE_LIMIT_SHARE / CARNIVORE_IDS.length;
  if (u.speciesCount[def.id] >= Math.min(habitatCap(ctx.world, def), ctx.unitLimit * share)) return false;
  return herbivore || countOf(u, PREY_IDS[def.id]) >= u.speciesCount[def.id] * PREY_PER_PREDATOR;
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
  const mate = ctx.spatial.nearest(u, u.x[i], u.y[i], Math.max(def.sight, MATE_SEARCH), (j) =>
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
    // Un depredador come las bayas de un bocado y vuelve a lo suyo.
    if (def.diet === 'carnivore') {
      u.state[i] = UnitState.IDLE;
      return;
    }
  } else if (def.diet === 'herbivore' && world.grass[t] >= GRASS_BITE) {
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
  const maxChase = def.sight * SCENT_FACTOR * CHASE_FACTOR;
  if (d2 > maxChase * maxChase) {
    giveUp(u, i);
    return;
  }
  if (d2 > MELEE_RANGE * MELEE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[prey], u.y[prey], def.speed * def.sprint) === Move.BLOCKED) {
      giveUp(u, i);
      wander(ctx, i, FAR_WANDER_RADIUS, def);
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
  // Cada cría vuelve a mirar el cupo: varias parejas que crían a la vez no lo desbordan.
  for (let k = 0; k < litter && hasRoomToBreed(ctx, def); k++) {
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
