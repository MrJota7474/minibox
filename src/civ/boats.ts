import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { clearPath } from '../ai/navigation';
import { findSeaRoute } from '../ai/sea-route';
import { hashMix } from '../core/hash';
import type { Rng } from '../core/rng';
import { SPECIES } from '../entities/species';
import { ABOARD_FLAG, UnitState, type UnitStore } from '../entities/units';
import { isFertileTerrain, isWalkableTerrain } from '../world/terrain';
import { ZONE_SIZE, type World } from '../world/world';
import type { CivSystem } from './civ-system';
import { BUILDING_DEFS, BuildingType, Job, Resource, type Building, type Village } from './model';
import { canPlace, forEachRing } from './placement';

/**
 * Barcos: llevan colonos a otras islas y ejércitos a costas enemigas. Zarpan de un muelle,
 * esperan a que suba el pasaje, navegan por una ruta de agua, desembarcan y vuelven a puerto.
 * Las criaturas a bordo quedan fuera del mundo (bit ABOARD) y viajan con el barco.
 */
export const BoatKind = { SETTLERS: 0, WAR: 1 } as const;
export const BoatState = { BOARDING: 0, SAILING: 1, RETURNING: 2 } as const;
export const BOAT_KIND_NAMES: readonly string[] = ['Barco de colonos', 'Barco de guerra'];
export const BOAT_STATE_NAMES: readonly string[] = ['Embarcando', 'Navegando', 'Volviendo a puerto'];

export interface Boat {
  readonly id: number;
  readonly kind: number;
  readonly village: number;
  readonly kingdom: number;
  /** Muelle de origen (id de edificio). */
  readonly dock: number;
  /** Casilla de agua del muelle (punto de partida y de regreso). */
  readonly home: number;
  /** Casilla de tierra donde desembarca el pasaje. */
  readonly landing: number;
  /** Aldea enemiga objetivo (barcos de guerra) o -1. */
  readonly target: number;
  x: number;
  y: number;
  /** Posición del tick anterior (sólo para interpolar el dibujo). */
  px: number;
  py: number;
  /** Mira a la derecha (1) o a la izquierda (-1). */
  dir: number;
  state: number;
  timer: number;
  /** Casillas de agua por las que pasa (la última es el destino del tramo actual). */
  route: number[];
  routeIdx: number;
  /** Criaturas que embarcan o van a bordo (handles). */
  passengers: number[];
  /** Lo alcanzó un desastre: se hunde en el siguiente tick. */
  wrecked: boolean;
  alive: boolean;
}

const BOAT_SPEED = 0.16;
const BOARD_TIMEOUT = 600;
const BOARD_RANGE = 3;
const MIN_PASSENGERS = 2;
/** Madera que cuesta botar un barco. */
export const BOAT_WOOD = 12;
const MAX_ACTIVE_BOATS = 16;
const WAR_CAPACITY = 8;
/** Un mar necesita al menos estas casillas para un muelle (un estanque no vale). */
export const MIN_SEA_SIZE = 150;
const VOYAGE_MIN = 25;
const VOYAGE_MAX = 110;
const VOYAGE_ATTEMPTS = 30;
/** Rutas marítimas que se calculan como mucho por intento de viaje. */
const MAX_ROUTE_TRIES = 3;
const LANDING_SEARCH = 8;
export const RAID_LANDING_SEARCH = 24;
const BEACH_SEARCH = 3;

// ---------- Muelles y costas ----------

/** Primera casilla de agua (de un mar grande) junto al rectángulo, en orden fijo; -1 si no hay. */
function waterNextTo(world: World, x: number, y: number, w: number, h: number): number {
  for (let ty = y - 1; ty <= y + h; ty++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      if (!world.inBounds(tx, ty)) continue;
      const i = world.idx(tx, ty);
      const sea = world.sea[i];
      if (sea !== 0 && (world.seaSizes[sea] ?? 0) >= MIN_SEA_SIZE) return i;
    }
  }
  return -1;
}

export function dockWaterTile(world: World, b: Building): number {
  return waterNextTo(world, b.x, b.y, b.w, b.h);
}

/** Muelle terminado de la aldea con salida al mar, o null. */
export function activeDock(civ: CivSystem, world: World, v: Village): Building | null {
  for (const id of v.buildingIds) {
    const b = civ.buildings[id];
    if (b.alive && b.type === BuildingType.DOCK && b.level >= 1 && dockWaterTile(world, b) >= 0) return b;
  }
  return null;
}

/** Sitio para un muelle: dentro del territorio propio, en la costa, lo más cerca del centro. */
export function findDockSpot(world: World, v: Village): { x: number; y: number } | null {
  const def = BUILDING_DEFS[BuildingType.DOCK];
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let z = 0; z < world.zoneOwner.length; z++) {
    if (world.zoneOwner[z] !== v.id + 1) continue;
    const x0 = (z % world.zonesX) * ZONE_SIZE;
    const y0 = Math.floor(z / world.zonesX) * ZONE_SIZE;
    for (let y = y0; y < y0 + ZONE_SIZE; y++) {
      for (let x = x0; x < x0 + ZONE_SIZE; x++) {
        const d = (x - v.cx) * (x - v.cx) + (y - v.cy) * (y - v.cy);
        if (d >= bestD || world.ownerAt(x + def.w - 1, y + def.h - 1) !== v.id || world.ownerAt(x + def.w - 1, y) !== v.id || world.ownerAt(x, y + def.h - 1) !== v.id) continue;
        if (waterNextTo(world, x, y, def.w, def.h) < 0 || !canPlace(world, x, y, def.w, def.h, v.id)) continue;
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** ¿Tiene la aldea tierra junto a un mar grande? (barato: sólo mira el territorio) */
export function isCoastal(world: World, v: Village): boolean {
  for (let z = 0; z < world.zoneOwner.length; z++) {
    if (world.zoneOwner[z] !== v.id + 1) continue;
    const x0 = (z % world.zonesX) * ZONE_SIZE;
    const y0 = Math.floor(z / world.zonesX) * ZONE_SIZE;
    if (waterNextTo(world, x0, y0, ZONE_SIZE, ZONE_SIZE) >= 0) return true;
  }
  return false;
}

interface Landing {
  land: number;
  water: number;
}

/** Casilla de tierra cerca de (cx,cy) junto a una de agua del mar indicado que cumple `accept`. */
export function findLanding(world: World, sea: number, cx: number, cy: number, radius: number, accept: (land: number) => boolean): Landing | null {
  let found: Landing | null = null;
  forEachRing(Math.floor(cx), Math.floor(cy), radius, (x, y) => {
    if (!world.inBounds(x, y)) return false;
    const i = world.idx(x, y);
    if (!isWalkableTerrain(world.terrain[i]) || world.lava[i] !== 0 || world.buildingAt[i] !== 0 || !accept(i)) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (world.seaAt(x + dx, y + dy) !== sea) continue;
      found = { land: i, water: world.idx(x + dx, y + dy) };
      return true;
    }
    return false;
  });
  return found;
}

/** ¿Puede la aldea llegar por mar a la isla de `target`? */
export function navalReach(civ: CivSystem, world: World, v: Village, target: Village): boolean {
  const dock = activeDock(civ, world, v);
  if (!dock) return false;
  const sea = world.sea[dockWaterTile(world, dock)];
  const region = world.regionAt(target.cx, target.cy);
  return findLanding(world, sea, target.cx, target.cy, RAID_LANDING_SEARCH, (i) => world.region[i] === region) !== null;
}

// ---------- Zarpar ----------

function canLaunch(civ: CivSystem, v: Village): boolean {
  if (v.resources[Resource.WOOD] < BOAT_WOOD) return false;
  let active = 0;
  for (const b of civ.boats) {
    if (!b.alive) continue;
    if (b.village === v.id) return false;
    active++;
  }
  return active < MAX_ACTIVE_BOATS;
}

/** Convierte a un aldeano en colono (deja su aldea pero recuerda su reino). */
export function enlistSettler(civ: CivSystem, u: UnitStore, i: number, kingdom: number): void {
  civ.leaveVillage(i);
  u.stateTicks[i] = 0;
  u.homeKingdom[i] = kingdom;
  u.job[i] = Job.SETTLER;
}

function createBoat(civ: CivSystem, ctx: AiContext, v: Village, kind: number, dock: Building, home: number, landing: Landing, route: number[], target: number, passengers: readonly number[]): Boat {
  const w = ctx.world.width;
  const u = ctx.units;
  v.resources[Resource.WOOD] -= BOAT_WOOD;
  const x = (home % w) + 0.5;
  const y = Math.floor(home / w) + 0.5;
  const boat: Boat = {
    id: civ.boats.length,
    kind,
    village: v.id,
    kingdom: v.kingdom,
    dock: dock.id,
    home,
    landing: landing.land,
    target,
    x,
    y,
    px: x,
    py: y,
    dir: 1,
    state: BoatState.BOARDING,
    timer: 0,
    route,
    routeIdx: 0,
    passengers: passengers.map((i) => u.handleOf(i)),
    wrecked: false,
    alive: true,
  };
  civ.boats.push(boat);
  for (const i of passengers) {
    civ.releaseWork(i);
    u.state[i] = UnitState.BOARD;
    u.target[i] = -1;
    u.stateTicks[i] = 0;
    u.tx[i] = dock.x + dock.w / 2;
    u.ty[i] = dock.y + dock.h / 2;
    clearPath(ctx, i);
  }
  return boat;
}

/** Colonos por mar cuando no queda sitio en la propia isla. Devuelve true si zarpó un barco. */
export function launchSettlers(civ: CivSystem, v: Village, group: readonly number[], ctx: AiContext): boolean {
  const world = ctx.world;
  if (group.length < MIN_PASSENGERS || !canLaunch(civ, v)) return false;
  const dock = activeDock(civ, world, v);
  if (!dock) return false;
  const home = dockWaterTile(world, dock);
  const sea = world.sea[home];
  const homeRegion = world.regionAt(v.cx, v.cy);
  let routeTries = 0;
  for (let a = 0; a < VOYAGE_ATTEMPTS && routeTries < MAX_ROUTE_TRIES; a++) {
    const dx = ctx.rng.range(-VOYAGE_MAX, VOYAGE_MAX);
    const dy = ctx.rng.range(-VOYAGE_MAX, VOYAGE_MAX);
    const d2 = dx * dx + dy * dy;
    if (d2 < VOYAGE_MIN * VOYAGE_MIN || d2 > VOYAGE_MAX * VOYAGE_MAX) continue;
    const landing = findLanding(world, sea, dock.x + dx, dock.y + dy, LANDING_SEARCH, (i) => {
      const x = i % world.width;
      return world.region[i] !== homeRegion && isFertileTerrain(world.terrain[i]) && civ.isFreeSite(x, (i - x) / world.width);
    });
    if (!landing) continue;
    routeTries++;
    const route = findSeaRoute(world, home, landing.water);
    if (!route) continue;
    for (const i of group) enlistSettler(civ, ctx.units, i, v.kingdom);
    createBoat(civ, ctx, v, BoatKind.SETTLERS, dock, home, landing, route, -1, group);
    civ.addEvent('voyage', v.id, `Colonos de ${v.name} zarpan hacia otra isla`);
    return true;
  }
  return false;
}

/** Flota de guerra hacia una aldea enemiga de otra isla. Devuelve true si zarpó. */
export function launchWarFleet(civ: CivSystem, v: Village, ctx: AiContext): boolean {
  const world = ctx.world;
  const raid = v.armyTarget >= 0 ? civ.villages[v.armyTarget] : null;
  if (!raid || !raid.alive || !canLaunch(civ, v)) return false;
  const homeRegion = world.regionAt(v.cx, v.cy);
  const raidRegion = world.regionAt(raid.cx, raid.cy);
  if (raidRegion === homeRegion) return false;
  const dock = activeDock(civ, world, v);
  if (!dock) return false;
  const home = dockWaterTile(world, dock);
  const landing = findLanding(world, world.sea[home], raid.cx, raid.cy, RAID_LANDING_SEARCH, (i) => world.region[i] === raidRegion);
  if (!landing) return false;
  const u = ctx.units;
  const crew: number[] = [];
  for (let i = 0; i < u.highWater && crew.length < WAR_CAPACITY; i++) {
    if (u.alive[i] === 0 || u.village[i] !== v.id || u.job[i] !== Job.WARRIOR || (u.status[i] & ABOARD_FLAG) !== 0) continue;
    const s = u.state[i];
    if (s === UnitState.FIGHT || s === UnitState.EAT_GO || s === UnitState.BOARD) continue;
    if (u.age[i] < SPECIES[u.species[i]].adultTicks || world.regionAt(u.x[i], u.y[i]) !== homeRegion) continue;
    crew.push(i);
  }
  if (crew.length < MIN_PASSENGERS) return false;
  const route = findSeaRoute(world, home, landing.water);
  if (!route) return false;
  createBoat(civ, ctx, v, BoatKind.WAR, dock, home, landing, route, raid.id, crew);
  civ.addEvent('voyage', v.id, `Una flota de ${v.name} zarpa contra ${raid.name}`);
  return true;
}

// ---------- Cada tick ----------

export function updateBoats(civ: CivSystem, ctx: AiContext): void {
  for (const boat of civ.boats) {
    if (!boat.alive) continue;
    boat.px = boat.x;
    boat.py = boat.y;
    if (boat.wrecked) {
      sink(civ, boat, ctx);
      continue;
    }
    const tile = ctx.world.idx(Math.floor(boat.x), Math.floor(boat.y));
    if (!ctx.world.isWaterIdx(tile)) {
      runAground(civ, boat, ctx);
      continue;
    }
    if (boat.state === BoatState.BOARDING) board(civ, boat, ctx);
    else sail(civ, boat, ctx);
  }
}

function board(civ: CivSystem, boat: Boat, ctx: AiContext): void {
  const u = ctx.units;
  boat.timer++;
  let aboard = 0;
  let waiting = 0;
  const keep: number[] = [];
  for (const h of boat.passengers) {
    const i = u.resolve(h);
    if (i < 0) continue;
    if ((u.status[i] & ABOARD_FLAG) !== 0) {
      aboard++;
      keep.push(h);
      continue;
    }
    // Cambió de planes (combate, hambre...): ya no embarca.
    if (u.state[i] !== UnitState.BOARD) continue;
    const dx = u.x[i] - boat.x;
    const dy = u.y[i] - boat.y;
    if (dx * dx + dy * dy <= BOARD_RANGE * BOARD_RANGE) {
      u.status[i] |= ABOARD_FLAG;
      placeUnit(u, i, boat.x, boat.y);
      aboard++;
    } else {
      waiting++;
    }
    keep.push(h);
  }
  boat.passengers = keep;
  const dockAlive = civ.building(boat.dock) !== null;
  if (dockAlive && waiting > 0 && boat.timer <= BOARD_TIMEOUT) return;
  if (dockAlive && aboard >= MIN_PASSENGERS) {
    // Zarpa con quien haya subido; los rezagados se quedan.
    boat.passengers = keep.filter((h) => {
      const i = u.resolve(h);
      if ((u.status[i] & ABOARD_FLAG) !== 0) return true;
      release(civ, ctx, i);
      return false;
    });
    boat.state = BoatState.SAILING;
    boat.routeIdx = 0;
    return;
  }
  // No sale: todos a tierra junto al muelle.
  const dock = civ.buildings[boat.dock];
  disembarkAll(civ, boat, ctx, dock.x + dock.w / 2, dock.y + dock.h / 2, false);
  boat.alive = false;
}

function sail(civ: CivSystem, boat: Boat, ctx: AiContext): void {
  const w = ctx.world.width;
  const target = boat.route[boat.routeIdx];
  const tx = (target % w) + 0.5;
  const ty = Math.floor(target / w) + 0.5;
  const dx = tx - boat.x;
  const dy = ty - boat.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(dx) > 0.01) boat.dir = dx > 0 ? 1 : -1;
  if (d <= BOAT_SPEED) {
    boat.x = tx;
    boat.y = ty;
    boat.routeIdx++;
  } else {
    boat.x += (dx / d) * BOAT_SPEED;
    boat.y += (dy / d) * BOAT_SPEED;
  }
  const u = ctx.units;
  for (const h of boat.passengers) {
    const i = u.resolve(h);
    if (i >= 0) placeUnit(u, i, boat.x, boat.y);
  }
  if (boat.routeIdx < boat.route.length) return;
  if (boat.state === BoatState.RETURNING) {
    // De vuelta en puerto: el barco se desarma (su madera ya se gastó en el viaje).
    boat.alive = false;
    return;
  }
  const lx = (boat.landing % w) + 0.5;
  const ly = Math.floor(boat.landing / w) + 0.5;
  disembarkAll(civ, boat, ctx, lx, ly, true);
  boat.route = [...boat.route.slice(0, -1).reverse(), boat.home];
  boat.routeIdx = 0;
  boat.state = BoatState.RETURNING;
}

function placeUnit(u: UnitStore, i: number, x: number, y: number): void {
  u.x[i] = u.px[i] = u.tx[i] = x;
  u.y[i] = u.py[i] = u.ty[i] = y;
  u.pathLen[i] = 0;
}

/** Baja a tierra a todo el pasaje. `arrived`: llegaron a destino (los colonos van a fundar). */
function disembarkAll(civ: CivSystem, boat: Boat, ctx: AiContext, x: number, y: number, arrived: boolean): void {
  const u = ctx.units;
  for (const h of boat.passengers) {
    const i = u.resolve(h);
    if (i < 0) continue;
    if ((u.status[i] & ABOARD_FLAG) === 0) {
      release(civ, ctx, i);
      continue;
    }
    u.status[i] &= ~ABOARD_FLAG;
    placeUnit(u, i, x, y);
    u.stateTicks[i] = 0;
    if (arrived && boat.kind === BoatKind.SETTLERS) {
      u.state[i] = UnitState.SETTLE;
      u.job[i] = Job.SETTLER;
    } else {
      release(civ, ctx, i);
    }
    u.think[i] = 1;
  }
  boat.passengers = [];
}

/** Libera a quien iba a embarcar: los colonos quedan sin aldea; los guerreros, en reposo. */
function release(civ: CivSystem, ctx: AiContext, i: number): void {
  const u = ctx.units;
  if (u.job[i] === Job.SETTLER) {
    u.job[i] = Job.NONE;
    u.state[i] = UnitState.IDLE;
    u.stateTicks[i] = 0;
    return;
  }
  civ.resetTask(i);
  giveUp(u, i);
}

/** Un desastre lo hunde: quien va a bordo se ahoga. */
function sink(civ: CivSystem, boat: Boat, ctx: AiContext): void {
  const u = ctx.units;
  const crewed = boat.passengers.some((h) => u.resolve(h) >= 0);
  for (const h of boat.passengers) {
    const i = u.resolve(h);
    if (i < 0) continue;
    if ((u.status[i] & ABOARD_FLAG) !== 0) {
      u.status[i] &= ~ABOARD_FLAG;
      killUnit(ctx, i, DeathCause.DROWNED);
    } else {
      release(civ, ctx, i);
    }
  }
  boat.passengers = [];
  boat.alive = false;
  const v = civ.villages[boat.village];
  if (!crewed && boat.state === BoatState.RETURNING) return;
  civ.addEvent('shipwreck', v.id, `Un ${BOAT_KIND_NAMES[boat.kind].toLowerCase()} de ${v.name} naufragó`);
}

/** El agua bajo el barco se volvió tierra: el pasaje baja donde pueda. */
function runAground(civ: CivSystem, boat: Boat, ctx: AiContext): void {
  const w = ctx.world;
  let spot = -1;
  forEachRing(Math.floor(boat.x), Math.floor(boat.y), BEACH_SEARCH, (x, y) => {
    if (!w.isWalkableAt(x + 0.5, y + 0.5)) return false;
    spot = w.idx(x, y);
    return true;
  });
  if (spot < 0) {
    sink(civ, boat, ctx);
    return;
  }
  disembarkAll(civ, boat, ctx, (spot % w.width) + 0.5, Math.floor(spot / w.width) + 0.5, false);
  boat.alive = false;
}

/** Desastres: hunde los barcos del radio (con `chance` < 1, sólo a algunos). */
export function wreckBoatsIn(civ: CivSystem, x: number, y: number, r: number, chance: number, rng: Rng | null): void {
  for (const b of civ.boats) {
    if (!b.alive || b.wrecked) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
    if (chance >= 1 || (rng !== null && rng.chance(chance))) b.wrecked = true;
  }
}

export function boatsHash(boats: readonly Boat[]): number {
  let h = 0xb0a7;
  for (const b of boats) {
    h = hashMix(h, b.alive ? 1 + b.state : 0);
    h = hashMix(h, Math.round(b.x * 100));
    h = hashMix(h, Math.round(b.y * 100));
    h = hashMix(h, b.routeIdx);
    h = hashMix(h, b.timer);
    h = hashMix(h, b.passengers.length);
  }
  return h;
}
