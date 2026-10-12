import type { AiContext } from '../ai/context';
import { hashMix } from '../core/hash';
import type { Rng } from '../core/rng';
import { SPECIES, isCivilized, type SpeciesId } from '../entities/species';
import { NO_VILLAGE, OFFMAP_FLAGS, UnitState, type UnitStore } from '../entities/units';
import { isWalkableTerrain } from '../world/terrain';
import { ZONE_SIZE, type World } from '../world/world';
import {
  BUILDING_DEFS,
  BuildingType,
  FISH_MAX,
  JOB_COUNT,
  Job,
  RESOURCE_COUNT,
  hallLevelName,
  type Building,
  type BuildingTypeId,
  type Village,
} from './model';
import { KingdomSystem } from './kingdoms';
import { boatsHash, updateBoats, wreckBoatsIn, type Boat } from './boats';
import { villageName } from './names';
import { canPlace, clearFootprint, findBuildSpot } from './placement';
import { planVillage } from './planner';

export type CivEventType = 'founded' | 'abandoned' | 'upgraded' | 'war' | 'peace' | 'alliance' | 'conquest' | 'rebellion' | 'king' | 'fallen' | 'voyage' | 'shipwreck';

export interface ChronicleEntry {
  readonly tick: number;
  readonly type: CivEventType;
  readonly text: string;
}

export interface CivEvent {
  readonly type: CivEventType;
  readonly village: number;
  readonly text: string;
}

const CENSUS_INTERVAL = 30;
const UNAFFILIATED_INTERVAL = 20;
const FARM_GROWTH_INTERVAL = 10;
/** Distancia mínima entre centros de aldea. */
export const MIN_VILLAGE_DIST = 22;
const JOIN_RADIUS = 30;
const FOUND_GROUP_RADIUS = 6;
const FOUND_MIN_GROUP = 3;
const HALL_SEARCH_RADIUS = 6;
const MAX_EVENTS = 50;
const MAX_CHRONICLE = 200;
/** Ticks de fuego que aguanta un edificio. */
const BURN_LIMIT = 40;
const STARTING_RESOURCES: readonly number[] = [12, 8, 0, 0, 0];
const BOAT_FRAGILITY = 10;
const SAME_KINGDOM_PULL = 0.25;
const FISH_REGEN = 2;

/**
 * Estado y reglas de las civilizaciones: aldeas, edificios, territorio y censo.
 * Los datos son objetos planos (serializables); su mutación es parte del estado
 * de la simulación (excepción documentada a la inmutabilidad, por rendimiento).
 */
export class CivSystem {
  readonly villages: Village[] = [];
  readonly buildings: Building[] = [];
  /** Avisos para la interfaz (no forman parte del estado determinista). */
  readonly events: CivEvent[] = [];
  /** Crónica del mundo: los últimos acontecimientos con su fecha. */
  readonly chronicle: ChronicleEntry[] = [];
  readonly kingdoms: KingdomSystem;
  /** Barcos (los hundidos o desarmados quedan con alive = false). */
  readonly boats: Boat[] = [];
  tick = 0;

  constructor(
    private readonly world: World,
    private readonly units: UnitStore,
  ) {
    this.kingdoms = new KingdomSystem(this, units);
  }

  update(ctx: AiContext): void {
    const t = ctx.tick;
    this.tick = t;
    updateBoats(this, ctx);
    if (t % FARM_GROWTH_INTERVAL === 0) this.growFarms();
    if (t % CENSUS_INTERVAL === 0) {
      this.checkIntegrity();
      this.census();
      for (const v of this.villages) {
        if (!v.alive) continue;
        if (v.population === 0) this.abandonVillage(v);
        else planVillage(this, v, ctx);
      }
    }
    if (t % UNAFFILIATED_INTERVAL === 5) this.handleUnaffiliated(ctx);
    this.kingdoms.update(ctx);
  }

  villageOf(i: number): Village | null {
    const id = this.units.village[i];
    if (id < 0) return null;
    const v = this.villages[id];
    return v && v.alive ? v : null;
  }

  building(id: number): Building | null {
    const b = this.buildings[id];
    return b && b.alive ? b : null;
  }

  /** Edificio en el que se descarga y se come: el ayuntamiento o el almacén más cercano. */
  storageFor(v: Village, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const id of v.buildingIds) {
      const b = this.buildings[id];
      if (!b.alive || b.level < 1) continue;
      if (b.type !== BuildingType.HALL && b.type !== BuildingType.STORAGE) continue;
      const dx = b.x + b.w / 2 - x;
      const dy = b.y + b.h / 2 - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Libera la casilla reservada por un aldeano (al morir o cambiar de tarea). */
  onUnitDeath(i: number): void {
    this.releaseWork(i);
  }

  releaseWork(i: number): void {
    const w = this.units.work[i];
    if (w >= 0 && w < this.world.size) this.world.reserved[w] = 0;
    this.units.work[i] = -1;
  }

  addEvent(type: CivEventType, village: number, text: string): void {
    this.events.push({ type, village, text });
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.chronicle.push({ tick: this.tick, type, text });
    if (this.chronicle.length > MAX_CHRONICLE) this.chronicle.shift();
  }

  // ---------- Aldeas ----------

  /** Funda una aldea con la hoguera cerca de (x,y). Devuelve null si el sitio no vale. */
  foundVillage(race: SpeciesId, x: number, y: number, members: readonly number[], ctx: AiContext, kingdom = -1): Village | null {
    if (!this.isFreeSite(x, y)) return null;
    const spot = findBuildSpot(this.world, Math.floor(x), Math.floor(y), 3, 3, -1, HALL_SEARCH_RADIUS);
    if (!spot) return null;
    const id = this.villages.length;
    const v: Village = {
      id,
      name: villageName(race, ctx.rng.nextU32()),
      race,
      colorIndex: id % 12,
      cx: spot.x + 1,
      cy: spot.y + 1,
      founded: ctx.tick,
      hallId: -1,
      kingdom: -1,
      loyalty: 100,
      capturedTick: -1,
      captureBy: -1,
      captureProgress: 0,
      armyTarget: -1,
      leader: -1,
      buildingIds: [],
      resources: [...STARTING_RESOURCES],
      zones: 0,
      alive: true,
      lastSettlers: ctx.tick,
      population: members.length,
      adults: members.length,
      housing: 4,
      storageCap: 120,
      jobCounts: new Array<number>(JOB_COUNT).fill(0),
      sites: 0,
      houses: 0,
      storages: 0,
      farms: 0,
    };
    this.villages.push(v);
    const hall = this.placeBuilding(v, BuildingType.HALL, spot.x, spot.y);
    hall.level = 1;
    hall.underConstruction = false;
    v.hallId = hall.id;
    this.claimInitialZones(v);
    // Las aldeas de colonos pertenecen al reino de origen; las demás fundan un reino propio.
    if (kingdom >= 0 && this.kingdoms.kingdoms[kingdom]?.alive) {
      v.kingdom = kingdom;
      v.loyalty = 70;
    } else {
      this.kingdoms.create(v);
    }
    for (const m of members) this.joinVillage(m, v);
    this.addEvent('founded', id, `Se fundó ${v.name} (${SPECIES[race].plural})`);
    return v;
  }

  /** ¿Está (x,y) lejos de otras aldeas y en tierra libre? */
  isFreeSite(x: number, y: number): boolean {
    if (this.world.ownerAt(Math.floor(x), Math.floor(y)) !== -1) return false;
    for (const v of this.villages) {
      if (!v.alive) continue;
      const dx = v.cx - x;
      const dy = v.cy - y;
      if (dx * dx + dy * dy < MIN_VILLAGE_DIST * MIN_VILLAGE_DIST) return false;
    }
    return true;
  }

  joinVillage(i: number, v: Village): void {
    const u = this.units;
    this.resetTask(i);
    u.village[i] = v.id;
    u.job[i] = Job.NONE;
    u.homeKingdom[i] = -1;
    v.population++;
  }

  /** Deja al aldeano en reposo, sin objetivo ni ruta y con el contador de estado a cero. */
  resetTask(i: number): void {
    const u = this.units;
    this.releaseWork(i);
    u.state[i] = UnitState.IDLE;
    u.target[i] = -1;
    u.stateTicks[i] = 0;
    u.pathLen[i] = 0;
    u.workTimer[i] = 0;
  }

  leaveVillage(i: number): void {
    const u = this.units;
    this.resetTask(i);
    u.village[i] = NO_VILLAGE;
    u.job[i] = Job.NONE;
    u.carry[i] = 0;
    u.carryAmount[i] = 0;
  }

  abandonVillage(v: Village): void {
    v.alive = false;
    this.kingdoms.onVillageAbandoned(v);
    for (const id of [...v.buildingIds]) this.destroyBuilding(this.buildings[id]);
    for (let z = 0; z < this.world.zoneOwner.length; z++) if (this.world.zoneOwner[z] === v.id + 1) this.world.zoneOwner[z] = 0;
    v.zones = 0;
    const u = this.units;
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] === 1 && u.village[i] === v.id) this.leaveVillage(i);
    this.addEvent('abandoned', v.id, `${v.name} quedó abandonada`);
  }

  // ---------- Edificios ----------

  placeBuilding(v: Village, type: BuildingTypeId, x: number, y: number): Building {
    const def = BUILDING_DEFS[type];
    const b: Building = { id: this.buildings.length, type, village: v.id, x, y, w: def.w, h: def.h, level: 0, underConstruction: true, progress: 0, growth: 0, burn: 0, alive: true };
    this.buildings.push(b);
    v.buildingIds.push(b.id);
    clearFootprint(this.world, x, y, def.w, def.h);
    for (let ty = y; ty < y + def.h; ty++) for (let tx = x; tx < x + def.w; tx++) this.world.buildingAt[this.world.idx(tx, ty)] = b.id + 1;
    return b;
  }

  /** Suma trabajo a una obra; si se completa, sube de nivel. */
  addWork(b: Building, amount: number): void {
    if (!b.alive || !b.underConstruction) return;
    b.progress += amount;
    const needed = BUILDING_DEFS[b.type].work[b.level];
    if (b.progress < needed) return;
    b.level++;
    b.underConstruction = false;
    b.progress = 0;
    if (b.type === BuildingType.HALL) {
      const v = this.villages[b.village];
      this.addEvent('upgraded', v.id, `${v.name} ya tiene ${hallLevelName(b.level).toLowerCase()}`);
    }
  }

  // ---------- Daños por desastres (ver powers/hazards.ts y disasters.ts) ----------

  burnBuildingAt(tile: number, amount = 1): void {
    const b = this.building(this.world.buildingAt[tile] - 1);
    if (!b) return;
    b.burn += amount;
    if (b.burn >= BURN_LIMIT) this.ruin(b);
  }

  destroyBuildingsIn(x: number, y: number, r: number): void {
    for (const b of this.buildingsInCircle(x, y, r)) this.ruin(b);
    wreckBoatsIn(this, x, y, r, 1, null);
  }

  damageBuildingsIn(x: number, y: number, r: number, chance: number, rng: Rng): void {
    for (const b of this.buildingsInCircle(x, y, r)) if (rng.chance(chance)) this.ruin(b);
    // Los barcos son más frágiles que los edificios.
    wreckBoatsIn(this, x, y, r, Math.min(1, chance * BOAT_FRAGILITY), rng);
  }

  wreckBoatsIn(x: number, y: number, r: number, chance: number, rng: Rng): void {
    wreckBoatsIn(this, x, y, r, chance, rng);
  }

  private buildingsInCircle(x: number, y: number, r: number): Building[] {
    const out: Building[] = [];
    for (const v of this.villages) {
      if (!v.alive) continue;
      for (const id of v.buildingIds) {
        const b = this.buildings[id];
        const nx = Math.max(b.x, Math.min(x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(y, b.y + b.h));
        if ((nx - x) * (nx - x) + (ny - y) * (ny - y) <= r * r) out.push(b);
      }
    }
    return out;
  }

  /** Un edificio destruido; si era el ayuntamiento, la aldea queda abandonada. */
  private ruin(b: Building): void {
    if (!b.alive) return;
    this.destroyBuilding(b);
    const v = this.villages[b.village];
    if (v.alive && b.id === v.hallId) this.abandonVillage(v);
  }

  destroyBuilding(b: Building): void {
    b.alive = false;
    const v = this.villages[b.village];
    const k = v.buildingIds.indexOf(b.id);
    if (k >= 0) v.buildingIds.splice(k, 1);
    for (let ty = b.y; ty < b.y + b.h; ty++) for (let tx = b.x; tx < b.x + b.w; tx++) this.world.buildingAt[this.world.idx(tx, ty)] = 0;
  }

  /** Edificios sobre casillas que dejaron de ser pisables (agua, cumbres) se derrumban. */
  private checkIntegrity(): void {
    for (const v of this.villages) {
      if (!v.alive) continue;
      for (const id of [...v.buildingIds]) this.checkBuilding(this.buildings[id]);
    }
  }

  private checkBuilding(b: Building): void {
    if (!b.alive || this.footprintOk(b)) return;
    this.destroyBuilding(b);
    const v = this.villages[b.village];
    if (v.alive && b.id === v.hallId) this.abandonVillage(v);
  }

  private footprintOk(b: Building): boolean {
    for (let ty = b.y; ty < b.y + b.h; ty++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) if (!isWalkableTerrain(this.world.terrain[this.world.idx(tx, ty)])) return false;
    }
    return true;
  }

  /** Crecen los cultivos y vuelven los peces a los muelles. */
  private growFarms(): void {
    for (const b of this.buildings) {
      if (!b.alive || b.level < 1) continue;
      if (b.type === BuildingType.FARM && b.growth < 100) b.growth++;
      else if (b.type === BuildingType.DOCK) b.growth = Math.min(FISH_MAX, b.growth + FISH_REGEN);
    }
  }

  /** ¿Se puede colocar este edificio en el territorio de la aldea? (para el planificador) */
  findSpotFor(v: Village, type: BuildingTypeId, radius: number): { x: number; y: number } | null {
    const def = BUILDING_DEFS[type];
    const spot = findBuildSpot(this.world, v.cx, v.cy, def.w, def.h, v.id, radius);
    if (!spot) return null;
    // Todo el edificio debe quedar dentro del territorio propio.
    for (let ty = spot.y; ty < spot.y + def.h; ty++) for (let tx = spot.x; tx < spot.x + def.w; tx++) if (this.world.ownerAt(tx, ty) !== v.id) return null;
    return canPlace(this.world, spot.x, spot.y, def.w, def.h, v.id) ? spot : null;
  }

  // ---------- Territorio ----------

  private claimInitialZones(v: Village): void {
    const zx = Math.floor(v.cx / ZONE_SIZE);
    const zy = Math.floor(v.cy / ZONE_SIZE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.claimZoneAt(v, zx + dx, zy + dy);
  }

  private claimZoneAt(v: Village, zx: number, zy: number): boolean {
    const w = this.world;
    if (zx < 0 || zy < 0 || zx >= w.zonesX || zy >= w.zonesY) return false;
    const z = zy * w.zonesX + zx;
    if (w.zoneOwner[z] !== 0) return false;
    w.zoneOwner[z] = v.id + 1;
    v.zones++;
    return true;
  }

  /** Reclama la zona libre vecina con más tierra pisable. */
  claimZone(v: Village): boolean {
    const w = this.world;
    let best = -1;
    let bestScore = 0;
    for (let z = 0; z < w.zoneOwner.length; z++) {
      if (w.zoneOwner[z] !== 0 || !this.touchesOwn(z, v.id + 1)) continue;
      const score = this.walkableInZone(z);
      if (score > bestScore) {
        bestScore = score;
        best = z;
      }
    }
    if (best < 0 || bestScore < (ZONE_SIZE * ZONE_SIZE) / 3) return false;
    return this.claimZoneAt(v, best % w.zonesX, Math.floor(best / w.zonesX));
  }

  private touchesOwn(z: number, owner: number): boolean {
    const w = this.world;
    const zx = z % w.zonesX;
    const zy = Math.floor(z / w.zonesX);
    return (
      (zx > 0 && w.zoneOwner[z - 1] === owner) ||
      (zx < w.zonesX - 1 && w.zoneOwner[z + 1] === owner) ||
      (zy > 0 && w.zoneOwner[z - w.zonesX] === owner) ||
      (zy < w.zonesY - 1 && w.zoneOwner[z + w.zonesX] === owner)
    );
  }

  private walkableInZone(z: number): number {
    const w = this.world;
    const x0 = (z % w.zonesX) * ZONE_SIZE;
    const y0 = Math.floor(z / w.zonesX) * ZONE_SIZE;
    let n = 0;
    for (let y = y0; y < Math.min(y0 + ZONE_SIZE, w.height); y++) {
      for (let x = x0; x < Math.min(x0 + ZONE_SIZE, w.width); x++) if (isWalkableTerrain(w.terrain[y * w.width + x])) n++;
    }
    return n;
  }

  // ---------- Censo y aldeanos sin aldea ----------

  private census(): void {
    for (const v of this.villages) {
      if (!v.alive) continue;
      v.population = 0;
      v.adults = 0;
      v.housing = 0;
      v.storageCap = 0;
      v.sites = 0;
      v.houses = 0;
      v.storages = 0;
      v.farms = 0;
      v.jobCounts.fill(0);
      v.leader = -1;
    }
    for (const v of this.villages) {
      if (v.alive) for (const id of v.buildingIds) this.countBuilding(v, this.buildings[id]);
    }
    this.countUnits();
  }

  private countBuilding(v: Village, b: Building): void {
    const def = BUILDING_DEFS[b.type];
    if (b.underConstruction) v.sites++;
    if (b.level < 1) return;
    v.housing += def.housing[b.level - 1];
    v.storageCap += def.storage[b.level - 1];
    if (b.type === BuildingType.HOUSE) v.houses++;
    if (b.type === BuildingType.STORAGE) v.storages++;
    if (b.type === BuildingType.FARM) v.farms++;
  }

  private countUnits(): void {
    const u = this.units;
    const leaderAge = new Float64Array(this.villages.length).fill(-1);
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || u.village[i] < 0) continue;
      const v = this.villages[u.village[i]];
      if (!v.alive) {
        this.leaveVillage(i);
        continue;
      }
      v.population++;
      if (u.age[i] >= SPECIES[u.species[i]].adultTicks) {
        v.adults++;
        // El líder es el adulto de más edad.
        if (u.age[i] > leaderAge[v.id]) {
          leaderAge[v.id] = u.age[i];
          v.leader = u.handleOf(i);
        }
      }
      v.jobCounts[u.job[i]]++;
    }
    for (const v of this.villages) {
      if (!v.alive) continue;
      for (let r = 0; r < RESOURCE_COUNT; r++) if (v.resources[r] > v.storageCap) v.resources[r] = v.storageCap;
    }
  }

  /** Aldeanos sin aldea: se unen a una cercana de su raza o fundan una nueva si son un grupo. */
  private handleUnaffiliated(ctx: AiContext): void {
    const u = this.units;
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || u.village[i] !== NO_VILLAGE || !isCivilized(u.species[i])) continue;
      if (u.state[i] === UnitState.SETTLE || u.state[i] === UnitState.BOARD || (u.status[i] & OFFMAP_FLAGS) !== 0) continue;
      if (u.age[i] < SPECIES[u.species[i]].adultTicks) continue;
      const near = this.nearestJoinable(i);
      if (near) {
        this.joinVillage(i, near);
        continue;
      }
      const group = this.groupAround(i, ctx);
      // Los colonos o soldados que se quedaron lejos de casa fundan para su reino de origen.
      if (group.length >= FOUND_MIN_GROUP) this.foundVillage(u.species[i] as SpeciesId, u.x[i], u.y[i], group, ctx, u.homeKingdom[i]);
    }
  }

  private nearestJoinable(i: number): Village | null {
    const u = this.units;
    const region = this.world.regionAt(u.x[i], u.y[i]);
    const origin = u.homeKingdom[i];
    let best: Village | null = null;
    let bestD = JOIN_RADIUS * JOIN_RADIUS;
    for (const v of this.villages) {
      if (!v.alive || v.race !== u.species[i] || v.population >= v.housing) continue;
      if (this.world.regionAt(v.cx, v.cy) !== region) continue;
      // Nadie se pasa al enemigo de su reino de origen.
      if (origin >= 0 && this.kingdoms.areHostile(origin, v.kingdom)) continue;
      const dx = v.cx - u.x[i];
      const dy = v.cy - u.y[i];
      // Las aldeas del propio reino cuentan como si estuvieran más cerca.
      const d = (dx * dx + dy * dy) * (origin >= 0 && v.kingdom === origin ? SAME_KINGDOM_PULL : 1);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private groupAround(i: number, ctx: AiContext): number[] {
    const u = this.units;
    const group: number[] = [];
    ctx.spatial.forEachInRadius(u, u.x[i], u.y[i], FOUND_GROUP_RADIUS, (j) => {
      if (u.species[j] === u.species[i] && u.village[j] === NO_VILLAGE && u.state[j] !== UnitState.SETTLE && u.state[j] !== UnitState.BOARD) group.push(j);
    });
    return group;
  }

  /** Hash del estado de civilizaciones (para pruebas de determinismo). */
  stateHash(): number {
    let h = 0x2545f491;
    for (const v of this.villages) {
      h = hashMix(h, v.alive ? 1 : 0);
      h = hashMix(h, v.zones);
      h = hashMix(h, v.kingdom);
      h = hashMix(h, v.loyalty);
      for (const r of v.resources) h = hashMix(h, r);
    }
    for (const b of this.buildings) {
      h = hashMix(h, b.alive ? b.level + 1 : 0);
      h = hashMix(h, b.progress);
      h = hashMix(h, b.growth);
    }
    h = hashMix(h, boatsHash(this.boats));
    return hashMix(h, this.kingdoms.stateHash());
  }
}

