import { DeathCause, THINK_INTERVAL, giveUp, killUnit, type AiContext } from '../ai/context';
import { Move, moveToward, pickWanderTarget } from '../ai/movement';
import { Nav, clearPath, navigateTo } from '../ai/navigation';
import { SPECIES, type RaceTraits, type SpeciesDef } from '../entities/species';
import { NO_UNIT, Sex, UnitState, type UnitStore } from '../entities/units';
import { Flora } from '../world/terrain';
import { actFight, actFlee, actMarch, fleeIfThreatened, thinkWarrior } from './combat';
import { BuildingType, FARM_HARVEST_FOOD, FARM_RIPE, Job, Resource, type Building, type Village } from './model';

const CIV_TIMEOUT_TICKS = 600;
/** Los colonos hacen viajes largos: su límite es mayor. */
const SETTLE_TIMEOUT_TICKS = 3000;
/** Espera antes de volver a buscar trabajo si no se encontró nada (evita búsquedas inútiles cada tick). */
const SEARCH_BACKOFF_TICKS = 40;
const HUNGRY_FRACTION = 0.5;
const MEAL_FRACTION = 0.6;
const BREED_FRACTION = 0.6;
const BREED_TRY_CHANCE = 0.15;
const SEARCH_RADIUS = 18;
/** Distancia máxima (Chebyshev) al ayuntamiento para buscar recursos. */
const WORK_RANGE = 24;
const HOME_WANDER = 5;
const MATE_RANGE = 1;
const MELEE_RANGE = 0.9;
const ATTACK_COOLDOWN = 8;
const HUNT_SIGHT = 14;
const SETTLE_ARRIVE = 3;
const SETTLE_GROUP_RADIUS = 8;
const FARM_SHIFT_TICKS = 120;

/** Duración base (ticks) y botín de cada tipo de trabajo sobre una casilla. */
const TILE_WORK: Readonly<Record<number, { ticks: number; resource: number; amount: number; deplete: number; trait: keyof RaceTraits }>> = {
  [Flora.TREE]: { ticks: 40, resource: Resource.WOOD, amount: 3, deplete: 1, trait: 'chop' },
  [Flora.BERRY_BUSH]: { ticks: 20, resource: Resource.FOOD, amount: 3, deplete: 1, trait: 'gather' },
  [Flora.ROCK]: { ticks: 50, resource: Resource.STONE, amount: 2, deplete: 0.3, trait: 'mine' },
  [Flora.IRON]: { ticks: 60, resource: Resource.IRON, amount: 1, deplete: 0.35, trait: 'mine' },
  [Flora.GOLD]: { ticks: 70, resource: Resource.GOLD, amount: 1, deplete: 0.4, trait: 'mine' },
};

/** Comportamiento de un aldeano (la vida común va en ai/life.ts). */
export function updateVillager(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  u.think[i]--;
  if (u.think[i] === 0) {
    u.think[i] = THINK_INTERVAL;
    const limit = u.state[i] === UnitState.SETTLE ? SETTLE_TIMEOUT_TICKS : CIV_TIMEOUT_TICKS;
    if (u.stateTicks[i] > limit) {
      abandonTask(ctx, i);
      if (u.job[i] === Job.SETTLER) ctx.civ.leaveVillage(i);
    }
    think(ctx, i, def);
  }
  act(ctx, i, def);
}

function abandonTask(ctx: AiContext, i: number): void {
  ctx.civ.releaseWork(i);
  giveUp(ctx.units, i);
}

function isAdult(u: UnitStore, i: number, def: SpeciesDef): boolean {
  return u.age[i] >= def.adultTicks;
}

function think(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const home = ctx.civ.villageOf(i);
  // Los guerreros también comen: si tienen hambre y hay comida, vuelven a casa antes de seguir luchando.
  const warriorHungry = home !== null && u.job[i] === Job.WARRIOR && u.hunger[i] < def.maxHunger * HUNGRY_FRACTION && home.resources[Resource.FOOD] > 0;
  if (home && warriorHungry && u.state[i] !== UnitState.EAT_GO && u.state[i] !== UnitState.FIGHT) {
    startTrip(ctx, i, home, UnitState.EAT_GO);
    return;
  }
  if (home && u.job[i] === Job.WARRIOR && u.state[i] !== UnitState.EAT_GO && thinkWarrior(ctx, i, home)) return;
  if (home && u.job[i] !== Job.WARRIOR && fleeIfThreatened(ctx, i, home)) return;
  const s = u.state[i];
  if (s === UnitState.WORK || s === UnitState.DELIVER || s === UnitState.EAT_GO || s === UnitState.SETTLE || s === UnitState.MATE || s === UnitState.HUNT) return;
  if (s === UnitState.FIGHT || s === UnitState.MARCH || s === UnitState.FLEE) return;
  const v = ctx.civ.villageOf(i);
  const canForage = u.carry[i] === 0 && s !== UnitState.WORK_GO && u.workTimer[i] === 0;
  if (canForage && u.hunger[i] < def.maxHunger * HUNGRY_FRACTION && (!v || v.resources[Resource.FOOD] === 0)) {
    if (startTileWork(ctx, i, Flora.BERRY_BUSH, u.x[i], u.y[i])) return;
    u.workTimer[i] = SEARCH_BACKOFF_TICKS;
  }
  if (s !== UnitState.WORK && u.workTimer[i] > 0) u.workTimer[i] = Math.max(0, u.workTimer[i] - THINK_INTERVAL);
  if (!v) {
    u.carry[i] = 0;
    if (s !== UnitState.WORK_GO) wanderNear(ctx, i, u.x[i], u.y[i], 8);
    return;
  }
  if (u.hunger[i] < def.maxHunger * HUNGRY_FRACTION && v.resources[Resource.FOOD] > 0) {
    startTrip(ctx, i, v, UnitState.EAT_GO);
    return;
  }
  if (u.carry[i] !== 0) {
    startTrip(ctx, i, v, UnitState.DELIVER);
    return;
  }
  if (s === UnitState.WORK_GO) return;
  if (isAdult(u, i, def) && ctx.rng.chance(BREED_TRY_CHANCE) && tryFindMate(ctx, i, def, v)) return;
  if (u.workTimer[i] === 0 && startJob(ctx, i, v)) return;
  if (u.job[i] !== Job.NONE && u.workTimer[i] === 0) u.workTimer[i] = SEARCH_BACKOFF_TICKS;
  wanderNear(ctx, i, v.cx, v.cy, HOME_WANDER);
}

function wanderNear(ctx: AiContext, i: number, cx: number, cy: number, radius: number): void {
  const u = ctx.units;
  if (u.state[i] === UnitState.WANDER) return;
  const dx = cx - u.x[i];
  const dy = cy - u.y[i];
  if (dx * dx + dy * dy > radius * radius * 4) {
    u.tx[i] = cx + 0.5;
    u.ty[i] = cy + 0.5;
    clearPath(ctx, i);
    u.state[i] = UnitState.WANDER;
    return;
  }
  u.state[i] = pickWanderTarget(ctx.world, u, i, ctx.rng, radius) ? UnitState.WANDER : UnitState.IDLE;
  clearPath(ctx, i);
}

/** Va al almacén (o ayuntamiento) más cercano para descargar o comer. */
function startTrip(ctx: AiContext, i: number, v: Village, state: typeof UnitState.DELIVER | typeof UnitState.EAT_GO): void {
  const u = ctx.units;
  const store = ctx.civ.storageFor(v, u.x[i], u.y[i]);
  if (!store) return;
  ctx.civ.releaseWork(i);
  u.tx[i] = store.x + store.w / 2;
  u.ty[i] = store.y + store.h / 2;
  clearPath(ctx, i);
  u.state[i] = state;
}

function startJob(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  switch (u.job[i]) {
    case Job.WOODCUTTER:
      return startTileWork(ctx, i, Flora.TREE, v.cx, v.cy);
    case Job.GATHERER:
      return startTileWork(ctx, i, Flora.BERRY_BUSH, v.cx, v.cy);
    case Job.MINER:
      return startTileWork(ctx, i, -1, v.cx, v.cy);
    case Job.BUILDER:
      return startBuildingWork(ctx, i, v, (b) => b.underConstruction);
    case Job.FARMER:
      return startBuildingWork(ctx, i, v, (b) => b.type === BuildingType.FARM && b.level >= 1);
    case Job.HUNTER:
      return startHunt(ctx, i);
    default:
      return false;
  }
}

/** Busca y reserva la casilla más cercana con el recurso (flora = -1: cualquier mineral). */
function startTileWork(ctx: AiContext, i: number, flora: number, cx: number, cy: number): boolean {
  const { world, units: u } = ctx;
  const region = world.regionAt(u.x[i], u.y[i]);
  const ox = Math.floor(cx);
  const oy = Math.floor(cy);
  const tile = searchFrom(ctx, Math.floor(u.x[i]), Math.floor(u.y[i]), region, (t) => {
    if (world.reserved[t] !== 0) return false;
    const f = world.flora[t];
    if (flora === -1 ? f < Flora.ROCK : f !== flora) return false;
    const x = t % world.width;
    const y = (t - x) / world.width;
    return Math.max(Math.abs(x - ox), Math.abs(y - oy)) <= WORK_RANGE;
  });
  if (tile < 0) return false;
  ctx.civ.releaseWork(i);
  world.reserved[tile] = 1;
  u.work[i] = tile;
  u.tx[i] = (tile % world.width) + 0.5;
  u.ty[i] = Math.floor(tile / world.width) + 0.5;
  clearPath(ctx, i);
  u.state[i] = UnitState.WORK_GO;
  return true;
}

function searchFrom(ctx: AiContext, x: number, y: number, region: number, accept: (t: number) => boolean): number {
  const w = ctx.world;
  let found = -1;
  for (let r = 0; r <= SEARCH_RADIUS && found < 0; r++) {
    for (let dy = -r; dy <= r && found < 0; dy++) {
      const edge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : Math.max(1, 2 * r)) {
        const tx = x + dx;
        const ty = y + dy;
        if (!w.inBounds(tx, ty)) continue;
        const t = w.idx(tx, ty);
        if (w.region[t] === region && accept(t)) {
          found = t;
          break;
        }
      }
    }
  }
  return found;
}

function startBuildingWork(ctx: AiContext, i: number, v: Village, accept: (b: Building) => boolean): boolean {
  const u = ctx.units;
  let best: Building | null = null;
  let bestD = Infinity;
  for (const id of v.buildingIds) {
    const b = ctx.civ.buildings[id];
    if (!b.alive || !accept(b)) continue;
    const dx = b.x + b.w / 2 - u.x[i];
    const dy = b.y + b.h / 2 - u.y[i];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (!best) return false;
  ctx.civ.releaseWork(i);
  u.work[i] = ctx.world.size + best.id;
  u.tx[i] = best.x + best.w / 2;
  u.ty[i] = best.y + best.h / 2;
  clearPath(ctx, i);
  u.state[i] = UnitState.WORK_GO;
  return true;
}

function startHunt(ctx: AiContext, i: number): boolean {
  const u = ctx.units;
  const prey = ctx.spatial.nearest(u, u.x[i], u.y[i], HUNT_SIGHT, (j) => SPECIES[u.species[j]].diet === 'herbivore');
  if (prey === NO_UNIT) return false;
  u.state[i] = UnitState.HUNT;
  u.target[i] = u.handleOf(prey);
  return true;
}

function act(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  switch (u.state[i]) {
    case UnitState.WANDER:
      if (moveToward(ctx.world, u, i, u.tx[i], u.ty[i], def.speed) !== Move.MOVING) u.state[i] = UnitState.IDLE;
      break;
    case UnitState.WORK_GO:
      travel(ctx, i, def, () => beginWork(ctx, i, def));
      break;
    case UnitState.WORK:
      doWork(ctx, i, def);
      break;
    case UnitState.DELIVER:
      travel(ctx, i, def, () => deliver(ctx, i));
      break;
    case UnitState.EAT_GO:
      travel(ctx, i, def, () => eatAtStore(ctx, i, def));
      break;
    case UnitState.SETTLE:
      settle(ctx, i, def);
      break;
    case UnitState.HUNT:
      hunt(ctx, i, def);
      break;
    case UnitState.MATE:
      mate(ctx, i, def);
      break;
    case UnitState.FIGHT:
      actFight(ctx, i, def);
      break;
    case UnitState.MARCH:
      actMarch(ctx, i, def);
      break;
    case UnitState.FLEE:
      actFlee(ctx, i, def);
      break;
    default:
      break;
  }
}

function travel(ctx: AiContext, i: number, def: SpeciesDef, onArrive: () => void): void {
  const u = ctx.units;
  const r = navigateTo(ctx, i, u.tx[i], u.ty[i], def.speed);
  if (r === Nav.ARRIVED) onArrive();
  else if (r === Nav.FAILED) abandonTask(ctx, i);
}

function traitFor(def: SpeciesDef, key: keyof RaceTraits): number {
  const v = def.race?.[key];
  return typeof v === 'number' ? v : 1;
}

function beginWork(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const w = u.work[i];
  if (w < 0) return giveUp(u, i);
  if (w < ctx.world.size) {
    const spec = TILE_WORK[ctx.world.flora[w]];
    if (!spec) return abandonTask(ctx, i);
    u.workTimer[i] = Math.max(5, Math.round(spec.ticks / traitFor(def, spec.trait)));
  } else {
    u.workTimer[i] = FARM_SHIFT_TICKS;
  }
  u.state[i] = UnitState.WORK;
}

function doWork(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const w = u.work[i];
  if (w < 0) return giveUp(u, i);
  if (w >= ctx.world.size) return workBuilding(ctx, i, def, w - ctx.world.size);
  const spec = TILE_WORK[ctx.world.flora[w]];
  if (!spec) return abandonTask(ctx, i);
  if (u.workTimer[i] > 0) {
    u.workTimer[i]--;
    return;
  }
  harvestTile(ctx, i, def, w, spec);
}

function harvestTile(ctx: AiContext, i: number, def: SpeciesDef, tile: number, spec: (typeof TILE_WORK)[number]): void {
  const { world, units: u } = ctx;
  const flora = world.flora[tile];
  if (flora === Flora.BERRY_BUSH) world.setFlora(tile, Flora.BUSH);
  else if (flora === Flora.TREE) world.setFlora(tile, ctx.rng.chance(0.25) ? Flora.SAPLING : Flora.NONE);
  else if (ctx.rng.chance(spec.deplete)) world.setFlora(tile, Flora.NONE);
  ctx.civ.releaseWork(i);
  let amount = spec.amount;
  // Quien recoge comida con hambre se come una parte en el acto.
  if (spec.resource === Resource.FOOD && u.hunger[i] < def.maxHunger * HUNGRY_FRACTION) {
    u.hunger[i] = Math.min(def.maxHunger, u.hunger[i] + def.maxHunger * MEAL_FRACTION);
    amount--;
  }
  setCarry(u, i, spec.resource, amount);
  u.state[i] = UnitState.IDLE;
  u.think[i] = 1;
}

function setCarry(u: UnitStore, i: number, resource: number, amount: number): void {
  if (amount <= 0) return;
  u.carry[i] = resource + 1;
  u.carryAmount[i] = Math.min(255, amount);
}

function workBuilding(ctx: AiContext, i: number, def: SpeciesDef, id: number): void {
  const u = ctx.units;
  const b = ctx.civ.building(id);
  if (!b) return abandonTask(ctx, i);
  if (b.type === BuildingType.FARM && !b.underConstruction) {
    if (b.growth >= FARM_RIPE) {
      b.growth = 0;
      ctx.civ.releaseWork(i);
      setCarry(u, i, Resource.FOOD, Math.round(FARM_HARVEST_FOOD * traitFor(def, 'farm')));
      u.state[i] = UnitState.IDLE;
      u.think[i] = 1;
      return;
    }
    // Cuidar el cultivo lo hace crecer más rápido.
    if (u.workTimer[i] % 2 === 0) b.growth = Math.min(FARM_RIPE, b.growth + 1);
  } else if (b.underConstruction) {
    ctx.civ.addWork(b, traitFor(def, 'build'));
    if (!b.underConstruction) return abandonTask(ctx, i);
  } else {
    return abandonTask(ctx, i);
  }
  if (u.workTimer[i] > 0) u.workTimer[i]--;
  else abandonTask(ctx, i);
}

function deliver(ctx: AiContext, i: number): void {
  const u = ctx.units;
  const v = ctx.civ.villageOf(i);
  if (v && u.carry[i] !== 0) {
    const r = u.carry[i] - 1;
    v.resources[r] = Math.min(Math.max(v.storageCap, v.resources[r]), v.resources[r] + u.carryAmount[i]);
  }
  u.carry[i] = 0;
  u.carryAmount[i] = 0;
  giveUp(u, i);
  u.think[i] = 1;
}

function eatAtStore(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const v = ctx.civ.villageOf(i);
  if (v && v.resources[Resource.FOOD] > 0) {
    v.resources[Resource.FOOD]--;
    u.hunger[i] = Math.min(def.maxHunger, u.hunger[i] + def.maxHunger * MEAL_FRACTION);
  }
  // De paso descarga lo que llevara.
  if (u.carry[i] !== 0) return deliver(ctx, i);
  giveUp(u, i);
  u.think[i] = 1;
}

function settle(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const dx = u.tx[i] - u.x[i];
  const dy = u.ty[i] - u.y[i];
  const near = dx * dx + dy * dy <= SETTLE_ARRIVE * SETTLE_ARRIVE;
  const r = near ? Nav.ARRIVED : navigateTo(ctx, i, u.tx[i], u.ty[i], def.speed);
  if (r === Nav.MOVING || r === Nav.WAITING) return;
  const group: number[] = [];
  ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], SETTLE_GROUP_RADIUS, (j) => {
    if (u.species[j] === u.species[i] && u.job[j] === Job.SETTLER && u.village[j] < 0) group.push(j);
  });
  if (!group.includes(i)) group.push(i);
  const v = r === Nav.ARRIVED ? ctx.civ.foundVillage(def.id, u.tx[i], u.ty[i], group, ctx, u.homeKingdom[i]) : null;
  if (!v) {
    // No se pudo fundar: pasan a ser aldeanos sin aldea (se unirán a otra o fundarán en grupo).
    for (const j of group) ctx.civ.leaveVillage(j);
  }
}

function hunt(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const prey = u.resolve(u.target[i]);
  if (prey === NO_UNIT) return giveUp(u, i);
  const dx = u.x[prey] - u.x[i];
  const dy = u.y[prey] - u.y[i];
  const d2 = dx * dx + dy * dy;
  if (d2 > HUNT_SIGHT * HUNT_SIGHT * 2) return giveUp(u, i);
  if (d2 > MELEE_RANGE * MELEE_RANGE) {
    if (moveToward(ctx.world, u, i, u.x[prey], u.y[prey], def.speed * def.sprint) === Move.BLOCKED) giveUp(u, i);
    return;
  }
  if (u.attackCd[i] > 0) return;
  u.attackCd[i] = ATTACK_COOLDOWN;
  u.hp[prey] -= def.damage;
  if (u.hp[prey] > 0) return;
  const food = Math.max(1, Math.ceil(SPECIES[u.species[prey]].meatValue / 120));
  killUnit(ctx, prey, DeathCause.KILLED);
  u.kills[i]++;
  setCarry(u, i, Resource.FOOD, food);
  giveUp(u, i);
  u.think[i] = 1;
}

function canBreed(ctx: AiContext, i: number, def: SpeciesDef, v: Village): boolean {
  const u = ctx.units;
  return (
    isAdult(u, i, def) &&
    u.cooldown[i] === 0 &&
    u.hunger[i] >= def.maxHunger * BREED_FRACTION &&
    v.population < v.housing &&
    u.count < ctx.unitLimit
  );
}

function tryFindMate(ctx: AiContext, i: number, def: SpeciesDef, v: Village): boolean {
  const u = ctx.units;
  if (!canBreed(ctx, i, def, v)) return false;
  const busy = (s: number): boolean => s === UnitState.MATE || s === UnitState.WORK || s === UnitState.HUNT || s === UnitState.SETTLE;
  const mate = ctx.spatial.nearest(u, u.x[i], u.y[i], def.sight, (j) =>
    j !== i && u.village[j] === v.id && u.sex[j] !== u.sex[i] && !busy(u.state[j]) && canBreed(ctx, j, def, v),
  );
  if (mate === NO_UNIT) return false;
  for (const [a, b] of [
    [i, mate],
    [mate, i],
  ]) {
    ctx.civ.releaseWork(a);
    u.state[a] = UnitState.MATE;
    u.target[a] = u.handleOf(b);
    u.stateTicks[a] = 0;
    clearPath(ctx, a);
  }
  return true;
}

function mate(ctx: AiContext, i: number, def: SpeciesDef): void {
  const u = ctx.units;
  const partner = u.resolve(u.target[i]);
  if (partner === NO_UNIT || u.resolve(u.target[partner]) !== i || u.state[partner] !== UnitState.MATE) return giveUp(u, i);
  const dx = u.x[partner] - u.x[i];
  const dy = u.y[partner] - u.y[i];
  if (dx * dx + dy * dy > MATE_RANGE * MATE_RANGE) {
    const r = navigateTo(ctx, i, u.x[partner], u.y[partner], def.speed);
    if (r === Nav.FAILED) giveUp(u, i);
    return;
  }
  const v = ctx.civ.villageOf(i);
  const mother = u.sex[i] === Sex.FEMALE ? i : partner;
  if (v && v.population < v.housing && u.count < ctx.unitLimit) {
    const child = u.spawn(def.id, u.x[mother], u.y[mother], {
      sex: ctx.rng.int(2),
      ageTicks: 0,
      generation: Math.min(Math.max(u.generation[i], u.generation[partner]) + 1, 0xffff),
      thinkOffset: ctx.rng.int(THINK_INTERVAL),
      nameSeed: ctx.rng.nextU32(),
      village: v.id,
    });
    if (child !== NO_UNIT) {
      ctx.stats.births++;
      v.population++;
    }
  }
  u.cooldown[i] = def.breedCooldownTicks;
  u.cooldown[partner] = def.breedCooldownTicks;
  giveUp(u, i);
  giveUp(u, partner);
}
