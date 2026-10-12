import { BUILDING_DEFS, JOB_COUNT, RESOURCE_COUNT, VILLAGE_COLORS } from '../civ/model';
import { PERSONALITY_NAMES } from '../civ/kingdoms';
import { SPECIES } from '../entities/species';
import { UnitState } from '../entities/units';
import type { Simulation } from '../sim/simulation';
import { BIOME_INFO, FLORA_NAMES, TERRAIN_INFO } from '../world/terrain';

/**
 * Comprobaciones de una partida recién cargada: un archivo importado puede venir dañado
 * o manipulado, y una referencia fuera de rango haría fallar la simulación en cada frame.
 */
const STATE_COUNT = Object.keys(UnitState).length;
const EFFECT_KINDS: readonly string[] = ['earthquake', 'tornado', 'acid-rain', 'volcano'];
const MAX_EFFECTS = 24;
const MAX_HELD = 30;
const MAX_LEVEL = 8;
/** Recurso que se lleva + 1 (0 = nada). */
const MAX_CARRY = RESOURCE_COUNT + 1;

export function checkSave(ok: boolean, what: string): asserts ok {
  if (!ok) throw new Error(`Partida no válida: ${what}`);
}

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Entero en [lo, hi). */
const inRange = (v: unknown, lo: number, hi: number): boolean => isInt(v) && v >= lo && v < hi;
const intList = (v: unknown, lo: number, hi: number): boolean => Array.isArray(v) && v.every((x) => inRange(x, lo, hi));
const numRecord = (v: unknown, keys: number): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, x]) => inRange(Number(k), 0, keys) && isNum(x));

function validateVillages(sim: Simulation): void {
  const civ = sim.civ;
  const nV = civ.villages.length;
  const nB = civ.buildings.length;
  const nK = civ.kingdoms.kingdoms.length;
  for (const v of civ.villages) {
    checkSave(typeof v.name === 'string' && inRange(v.race, 0, SPECIES.length) && inRange(v.colorIndex, 0, VILLAGE_COLORS.length) && typeof v.alive === 'boolean', 'aldea');
    checkSave([v.cx, v.cy, v.founded, v.loyalty, v.capturedTick, v.captureProgress, v.leader, v.lastSettlers].every(isNum), 'datos de aldea');
    checkSave(inRange(v.hallId, -1, nB) && inRange(v.kingdom, -1, nK) && inRange(v.armyTarget, -1, nV) && inRange(v.captureBy, -1, nK), 'referencias de aldea');
    checkSave(intList(v.buildingIds, 0, nB), 'edificios de aldea');
    checkSave(Array.isArray(v.resources) && v.resources.length === RESOURCE_COUNT && v.resources.every(isNum), 'recursos de aldea');
    checkSave(Array.isArray(v.jobCounts) && v.jobCounts.length === JOB_COUNT && v.jobCounts.every(isInt), 'oficios de aldea');
    checkSave([v.zones, v.population, v.adults, v.housing, v.storageCap, v.sites, v.houses, v.storages, v.farms].every(isNum), 'censo de aldea');
  }
}

function validateBuildings(sim: Simulation): void {
  const w = sim.world;
  for (const b of sim.civ.buildings) {
    checkSave(inRange(b.type, 0, BUILDING_DEFS.length) && inRange(b.village, 0, sim.civ.villages.length), 'edificio');
    checkSave(inRange(b.x, 0, w.width) && inRange(b.y, 0, w.height) && inRange(b.w, 1, 9) && inRange(b.h, 1, 9) && b.x + b.w <= w.width && b.y + b.h <= w.height, 'posición de edificio');
    checkSave(inRange(b.level, 0, MAX_LEVEL) && typeof b.underConstruction === 'boolean' && typeof b.alive === 'boolean', 'estado de edificio');
    checkSave([b.progress, b.growth, b.burn].every(isNum), 'datos de edificio');
  }
}

function validateKingdoms(sim: Simulation): void {
  const ks = sim.civ.kingdoms;
  const nK = ks.kingdoms.length;
  for (const k of ks.kingdoms) {
    checkSave(typeof k.name === 'string' && inRange(k.race, 0, SPECIES.length) && inRange(k.colorIndex, 0, VILLAGE_COLORS.length) && typeof k.alive === 'boolean', 'reino');
    checkSave(inRange(k.capital, -1, sim.civ.villages.length) && inRange(k.personality, 0, PERSONALITY_NAMES.length) && isInt(k.king), 'referencias de reino');
    checkSave(intList(k.allies, 0, nK) && numRecord(k.grievances, nK) && numRecord(k.truce, nK), 'relaciones de reino');
    checkSave([k.founded, k.lastRebellion].every(isNum) && typeof k.hadKing === 'boolean', 'datos de reino');
  }
  for (const war of ks.wars) {
    checkSave(intList(war.attackers, 0, nK) && intList(war.defenders, 0, nK) && typeof war.active === 'boolean' && isNum(war.start), 'guerra');
    checkSave(Array.isArray(war.losses) && war.losses.length === 2 && war.losses.every(isInt), 'bajas de guerra');
  }
}

function validateMap(sim: Simulation): void {
  const w = sim.world;
  const nB = sim.civ.buildings.length;
  const nV = sim.civ.villages.length;
  for (let i = 0; i < w.size; i++) {
    if (w.terrain[i] >= TERRAIN_INFO.length || w.biome[i] >= BIOME_INFO.length || w.flora[i] >= FLORA_NAMES.length || w.buildingAt[i] < 0 || w.buildingAt[i] > nB) {
      checkSave(false, 'casillas del mapa');
    }
  }
  for (let z = 0; z < w.zoneOwner.length; z++) checkSave(w.zoneOwner[z] <= nV, 'territorios');
}

function validateUnits(sim: Simulation): void {
  const u = sim.units;
  const nV = sim.civ.villages.length;
  const nK = sim.civ.kingdoms.kingdoms.length;
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0) continue;
    const ok =
      u.state[i] < STATE_COUNT &&
      u.village[i] >= -1 && u.village[i] < nV &&
      u.homeKingdom[i] >= -1 && u.homeKingdom[i] < nK &&
      u.job[i] < JOB_COUNT &&
      u.carry[i] < MAX_CARRY &&
      Number.isFinite(u.x[i]) && Number.isFinite(u.y[i]) &&
      u.x[i] >= 0 && u.y[i] >= 0 && u.x[i] <= sim.world.width && u.y[i] <= sim.world.height &&
      u.work[i] >= -1 && u.work[i] < sim.world.size + sim.civ.buildings.length;
    checkSave(ok, 'criaturas');
  }
}

function validatePowers(sim: Simulation): void {
  const p = sim.powers;
  checkSave(p.effects.length <= MAX_EFFECTS && p.held.length <= MAX_HELD, 'efectos activos');
  for (const e of p.effects) checkSave(EFFECT_KINDS.includes(e.kind) && [e.x, e.y, e.r, e.ttl, e.dx, e.dy].every(isNum), 'efecto');
  checkSave(p.held.every(isInt), 'criaturas sujetas');
}

/** Comprueba todas las referencias cruzadas de una partida cargada. */
export function validateLoaded(sim: Simulation): void {
  validateVillages(sim);
  validateBuildings(sim);
  validateKingdoms(sim);
  validateMap(sim);
  validateUnits(sim);
  validatePowers(sim);
}
