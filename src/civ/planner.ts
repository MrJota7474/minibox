import type { AiContext } from '../ai/context';
import { TICKS_PER_YEAR } from '../core/time';
import { SPECIES } from '../entities/species';
import { NO_VILLAGE, OFFMAP_FLAGS, Sex, UnitState } from '../entities/units';
import { isFertileTerrain } from '../world/terrain';
import type { CivSystem } from './civ-system';
import { BUILDING_DEFS, BuildingType, JOB_COUNT, Job, Resource, canAfford, pay, type Building, type JobId, type Village } from './model';
import { enlistSettler, findDockSpot, isCoastal, launchSettlers, launchWarFleet } from './boats';

const BUILD_RADIUS = 14;
const POP_PER_ZONE = 2.5;
const MAX_ZONES = 40;
const SETTLER_MIN_POP = 28;
const SETTLER_GROUP = 4;
const SETTLER_FOOD = 10;
const SETTLER_COOLDOWN = 5 * TICKS_PER_YEAR;
/** Si no se encontró destino por mar, se vuelve a intentar pasado este tiempo. */
const NAVAL_RETRY_TICKS = TICKS_PER_YEAR;
/** Las flotas de guerra se preparan con esta cadencia (buscar desembarco y ruta cuesta). */
const FLEET_CHECK_TICKS = 300;
const SETTLER_MIN_DIST = 30;
const SETTLER_MAX_DIST = 45;
const SETTLER_ATTEMPTS = 24;
const MAX_VILLAGES = 40;
const MAX_STORAGES = 3;
/** Cada cuántos ticks mira una aldea si puede construir un muelle (buscar sitio en la costa cuesta). */
const DOCK_CHECK_TICKS = 300;
const CENSUS_TICKS = 30;
/** Prioridad al repartir oficios (de más a menos importante). */
const JOB_PRIORITY: readonly JobId[] = [Job.FARMER, Job.FISHER, Job.WARRIOR, Job.BUILDER, Job.GATHERER, Job.WOODCUTTER, Job.MINER, Job.HUNTER];

/** Decisiones periódicas de una aldea (cada censo). */
export function planVillage(civ: CivSystem, v: Village, ctx: AiContext): void {
  const hall = civ.building(v.hallId);
  if (!hall) return;
  if (v.sites < 1 + Math.floor(v.population / 15)) chooseConstruction(civ, v, hall, ctx);
  assignJobs(civ, v, ctx, hall);
  if (v.population > v.zones * POP_PER_ZONE && v.zones < MAX_ZONES) civ.claimZone(v);
  maybeSendSettlers(civ, v, ctx);
  if (civ.kingdoms.isAtWar(v.kingdom) && (ctx.tick + v.id * CENSUS_TICKS) % FLEET_CHECK_TICKS === 0) launchWarFleet(civ, v, ctx);
}

function chooseConstruction(civ: CivSystem, v: Village, hall: Building, ctx: AiContext): void {
  if (tryUpgrade(v, hall)) return;
  if ((ctx.tick + v.id * CENSUS_TICKS) % DOCK_CHECK_TICKS === 0 && tryBuildDock(civ, v, hall, ctx)) return;
  if (v.population >= v.housing - 1) {
    // Primero se mejoran las chozas (más plazas por casa y progreso visible); si no, se construye otra.
    if (tryUpgradeHouse(civ, v, hall)) return;
    if (tryBuild(civ, v, BuildingType.HOUSE, hall)) return;
  }
  const farmsWanted = Math.ceil(v.population / 7);
  if (countOfType(civ, v, BuildingType.FARM) < farmsWanted && v.resources[Resource.FOOD] < v.population * 3 && tryBuild(civ, v, BuildingType.FARM, hall)) return;
  const fullest = Math.max(...v.resources);
  if (fullest >= v.storageCap * 0.8 && countOfType(civ, v, BuildingType.STORAGE) < MAX_STORAGES) tryBuild(civ, v, BuildingType.STORAGE, hall);
}

/** Un muelle por aldea costera: da pescado y permite botar barcos. */
function tryBuildDock(civ: CivSystem, v: Village, hall: Building, ctx: AiContext): boolean {
  const def = BUILDING_DEFS[BuildingType.DOCK];
  if (countOfType(civ, v, BuildingType.DOCK) > 0 || hall.level < def.hallLevel[0] || v.population < def.minPop[0] || !canAfford(v.resources, def.cost[0])) return false;
  if (!isCoastal(ctx.world, v)) return false;
  const spot = findDockSpot(ctx.world, v);
  if (!spot) return false;
  pay(v.resources, def.cost[0]);
  civ.placeBuilding(v, BuildingType.DOCK, spot.x, spot.y);
  v.sites++;
  return true;
}

/** Muelles terminados de la aldea. */
function finishedDocks(civ: CivSystem, v: Village): number {
  let n = 0;
  for (const id of v.buildingIds) {
    const b = civ.buildings[id];
    if (b.type === BuildingType.DOCK && b.level >= 1) n++;
  }
  return n;
}

/** Edificios de un tipo, terminados o en obra. */
function countOfType(civ: CivSystem, v: Village, type: number): number {
  let n = 0;
  for (const id of v.buildingIds) if (civ.buildings[id].type === type) n++;
  return n;
}

function tryUpgrade(v: Village, b: Building): boolean {
  const def = BUILDING_DEFS[b.type];
  if (b.underConstruction || b.level >= def.names.length) return false;
  if (v.population < def.minPop[b.level] || !canAfford(v.resources, def.cost[b.level])) return false;
  pay(v.resources, def.cost[b.level]);
  b.underConstruction = true;
  b.progress = 0;
  v.sites++;
  return true;
}

function tryBuild(civ: CivSystem, v: Village, type: (typeof BuildingType)[keyof typeof BuildingType], hall: Building): boolean {
  const def = BUILDING_DEFS[type];
  if (hall.level < def.hallLevel[0] || v.population < def.minPop[0] || !canAfford(v.resources, def.cost[0])) return false;
  const spot = civ.findSpotFor(v, type, BUILD_RADIUS);
  if (!spot) return false;
  pay(v.resources, def.cost[0]);
  civ.placeBuilding(v, type, spot.x, spot.y);
  v.sites++;
  return true;
}

function tryUpgradeHouse(civ: CivSystem, v: Village, hall: Building): boolean {
  let best: Building | null = null;
  for (const id of v.buildingIds) {
    const b = civ.buildings[id];
    if (b.type !== BuildingType.HOUSE || b.underConstruction || b.level < 1) continue;
    const def = BUILDING_DEFS[b.type];
    if (b.level >= def.names.length || hall.level < def.hallLevel[b.level]) continue;
    if (!best || b.level < best.level) best = b;
  }
  return best !== null && tryUpgrade(v, best);
}

/** Cuántos aldeanos quiere la aldea en cada oficio. */
function desiredJobs(v: Village, hall: Building, atWar: boolean, docks: number): number[] {
  const a = v.adults;
  const want = new Array<number>(JOB_COUNT).fill(0);
  want[Job.WARRIOR] = atWar ? Math.ceil(a * 0.35) : a >= 6 ? Math.max(1, Math.ceil(a * 0.1)) : 0;
  const foodLow = v.resources[Resource.FOOD] < v.population * 2;
  want[Job.FARMER] = Math.min(v.farms, a);
  want[Job.BUILDER] = v.sites > 0 ? Math.min(v.sites * 2, 1 + Math.floor(a / 6)) : 0;
  want[Job.GATHERER] = foodLow ? Math.max(1, Math.ceil(a * 0.3)) : Math.ceil(a * 0.15);
  want[Job.WOODCUTTER] = Math.max(1, Math.ceil(a * 0.25));
  want[Job.MINER] = hall.level >= 2 || v.population >= 8 ? Math.max(1, Math.ceil(a * 0.15)) : 0;
  want[Job.HUNTER] = a >= 6 ? 1 : 0;
  want[Job.FISHER] = docks > 0 ? Math.min(docks * 2, Math.max(1, Math.ceil(a * (foodLow ? 0.2 : 0.1)))) : 0;
  return want;
}

function assignJobs(civ: CivSystem, v: Village, ctx: AiContext, hall: Building): void {
  const u = ctx.units;
  const want = desiredJobs(v, hall, civ.kingdoms.isAtWar(v.kingdom), finishedDocks(civ, v));
  const have = new Array<number>(JOB_COUNT).fill(0);
  const free: number[] = [];
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0 || u.village[i] !== v.id) continue;
    if (u.age[i] < SPECIES[u.species[i]].adultTicks) {
      if (u.job[i] !== Job.NONE) setJob(civ, v, i, Job.NONE, ctx);
      continue;
    }
    const job = u.job[i];
    if (u.state[i] === UnitState.BOARD || (u.status[i] & OFFMAP_FLAGS) !== 0) {
      // De viaje: conserva su oficio.
      have[job]++;
      continue;
    }
    if (job !== Job.NONE && have[job] < want[job]) have[job]++;
    else free.push(i);
  }
  let next = 0;
  for (const job of JOB_PRIORITY) {
    while (have[job] < want[job] && next < free.length) {
      setJob(civ, v, free[next++], job, ctx);
      have[job]++;
    }
  }
  // Los que sobran ayudan con comida y madera; si ya hacían una de las dos, la conservan (sin cambios de oficio continuos).
  for (let k = next; k < free.length; k++) {
    const i = free[k];
    if (u.job[i] === Job.GATHERER || u.job[i] === Job.WOODCUTTER) continue;
    setJob(civ, v, i, k % 2 === 0 ? Job.GATHERER : Job.WOODCUTTER, ctx);
  }
}

/** Armas de hierro: cuestan 2 de hierro por guerrero. */
const GEAR_IRON = 2;

function setJob(civ: CivSystem, v: Village, i: number, job: JobId, ctx: AiContext): void {
  const u = ctx.units;
  if (u.job[i] === job) return;
  u.job[i] = job;
  if (job === Job.WARRIOR && u.gear[i] === 0 && v.resources[Resource.IRON] >= GEAR_IRON) {
    v.resources[Resource.IRON] -= GEAR_IRON;
    u.gear[i] = 1;
  }
  const busy = u.state[i] === UnitState.EAT_GO || u.state[i] === UnitState.DELIVER || u.state[i] === UnitState.MATE;
  if (!busy) civ.resetTask(i);
}

/** Si la aldea está llena y próspera, un grupo parte a fundar otra. */
function maybeSendSettlers(civ: CivSystem, v: Village, ctx: AiContext): void {
  if (v.population < SETTLER_MIN_POP || v.population < v.housing - 2) return;
  if (v.resources[Resource.FOOD] < SETTLER_FOOD * 2 || ctx.tick - v.lastSettlers < SETTLER_COOLDOWN) return;
  if (civ.villages.filter((x) => x.alive).length >= MAX_VILLAGES) return;
  const dest = findSettlementSite(civ, v, ctx);
  if (!dest) {
    // Sin sitio en su isla: si tiene muelle, los colonos se van en barco.
    const group = pickSettlers(v, ctx);
    if (launchSettlers(civ, v, group, ctx)) {
      v.lastSettlers = ctx.tick;
      v.resources[Resource.FOOD] -= SETTLER_FOOD;
    } else {
      v.lastSettlers = ctx.tick - SETTLER_COOLDOWN + NAVAL_RETRY_TICKS;
    }
    return;
  }
  const group = pickSettlers(v, ctx);
  if (group.length < 2) return;
  v.lastSettlers = ctx.tick;
  v.resources[Resource.FOOD] -= SETTLER_FOOD;
  const u = ctx.units;
  for (const i of group) {
    enlistSettler(civ, u, i, v.kingdom);
    u.state[i] = UnitState.SETTLE;
    u.tx[i] = dest.x + 0.5;
    u.ty[i] = dest.y + 0.5;
  }
}

function findSettlementSite(civ: CivSystem, v: Village, ctx: AiContext): { x: number; y: number } | null {
  const w = ctx.world;
  const region = w.regionAt(v.cx, v.cy);
  for (let a = 0; a < SETTLER_ATTEMPTS; a++) {
    const dx = ctx.rng.range(-SETTLER_MAX_DIST, SETTLER_MAX_DIST);
    const dy = ctx.rng.range(-SETTLER_MAX_DIST, SETTLER_MAX_DIST);
    const d2 = dx * dx + dy * dy;
    if (d2 < SETTLER_MIN_DIST * SETTLER_MIN_DIST || d2 > SETTLER_MAX_DIST * SETTLER_MAX_DIST) continue;
    const x = v.cx + dx;
    const y = v.cy + dy;
    if (!w.inBounds(x, y) || w.region[w.idx(x, y)] !== region) continue;
    if (!isFertileTerrain(w.terrain[w.idx(x, y)]) || !civ.isFreeSite(x, y)) continue;
    return { x, y };
  }
  return null;
}

/** Elige adultos sin carga, intentando mezclar sexos. */
function pickSettlers(v: Village, ctx: AiContext): number[] {
  const u = ctx.units;
  const bySex: number[][] = [[], []];
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0 || u.village[i] !== v.id || u.carry[i] !== 0) continue;
    if (u.age[i] < SPECIES[u.species[i]].adultTicks || u.job[i] === Job.BUILDER || u.job[i] === Job.WARRIOR) continue;
    bySex[u.sex[i] === Sex.FEMALE ? 0 : 1].push(i);
  }
  const group: number[] = [];
  for (let k = 0; group.length < SETTLER_GROUP && (k < bySex[0].length || k < bySex[1].length); k++) {
    if (k < bySex[0].length) group.push(bySex[0][bySex[0].length - 1 - k]);
    if (group.length < SETTLER_GROUP && k < bySex[1].length) group.push(bySex[1][bySex[1].length - 1 - k]);
  }
  return group.filter((i) => u.village[i] !== NO_VILLAGE);
}
