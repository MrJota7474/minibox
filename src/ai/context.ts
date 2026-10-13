import type { CivSystem } from '../civ/civ-system';
import type { Rng } from '../core/rng';
import type { SpatialHash } from '../entities/spatial';
import { SPECIES, isCivilized } from '../entities/species';
import { CURSED_FLAG, NO_UNIT, OFFMAP_FLAGS, UnitState, type UnitStore } from '../entities/units';
import type { HazardSystem } from '../powers/hazards';
import type { World } from '../world/world';
import type { WorldLaws } from '../sim/laws';
import type { ClimateMods } from '../world/climate';
import { afterDeath } from './monster-spawn';
import type { Pathfinder } from './pathfinder';

export const DeathCause = { AGE: 0, HUNGER: 1, KILLED: 2, DROWNED: 3, DIVINE: 4, PLAGUE: 5, DISASTER: 6 } as const;
export type DeathCauseId = (typeof DeathCause)[keyof typeof DeathCause];
export const DEATH_CAUSE_COUNT = 7;

/** Probabilidad de que un aldeano muerto se levante como penante según cómo murió. */
const RISE_PLAGUE = 0.15;
const RISE_KILLED = 0.05;
const RISE_BY_UNDEAD = 0.4;

export interface SimStats {
  births: number;
  readonly deaths: Uint32Array;
}

/** Todo lo que necesita la IA de una criatura en un tick. */
export interface AiContext {
  world: World;
  units: UnitStore;
  spatial: SpatialHash;
  rng: Rng;
  tick: number;
  /** Límite efectivo de criaturas (puede ser menor que la capacidad). */
  unitLimit: number;
  stats: SimStats;
  pathfinder: Pathfinder;
  civ: CivSystem;
  laws: WorldLaws;
  /** Estación y era: multiplicadores del momento. */
  climate: ClimateMods;
  /** Fuego y lava (los monstruos ardientes prenden lo que golpean). */
  hazards: HazardSystem;
}

/** Cada cuántos ticks «piensa» una criatura (escalonado por índice). */
export const THINK_INTERVAL = 5;
/** Tras 30 s (x1) en el mismo estado activo sin terminarlo, se abandona. */
export const STATE_TIMEOUT_TICKS = 300;

/** Mata a una criatura; `killer` (si se conoce) decide si la víctima puede levantarse como penante. */
export function killUnit(ctx: AiContext, i: number, cause: DeathCauseId, killer: number = NO_UNIT): void {
  const u = ctx.units;
  const species = u.species[i];
  const x = u.x[i];
  const y = u.y[i];
  const rise = riseChance(ctx, i, cause, killer);
  ctx.civ.onUnitDeath(i);
  u.kill(i);
  ctx.stats.deaths[cause]++;
  afterDeath(ctx, species, x, y, rise);
}

/** Los malditos siempre se levantan; los muertos de plaga o en combate, a veces. */
function riseChance(ctx: AiContext, i: number, cause: DeathCauseId, killer: number): number {
  const u = ctx.units;
  if (!ctx.laws.monsters || !isCivilized(u.species[i]) || (u.status[i] & OFFMAP_FLAGS) !== 0) return 0;
  if ((u.status[i] & CURSED_FLAG) !== 0) return 1;
  if (cause === DeathCause.PLAGUE) return RISE_PLAGUE;
  if (cause !== DeathCause.KILLED) return 0;
  return killer !== NO_UNIT && SPECIES[u.species[killer]].monster?.undead ? RISE_BY_UNDEAD : RISE_KILLED;
}

/** Vuelve a reposo y suelta el objetivo (persecución imposible, pareja perdida...). */
export function giveUp(u: UnitStore, i: number): void {
  u.state[i] = UnitState.IDLE;
  u.target[i] = NO_UNIT;
  u.stateTicks[i] = 0;
  u.pathLen[i] = 0;
}
