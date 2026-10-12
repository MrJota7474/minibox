import type { CivSystem } from '../civ/civ-system';
import type { Rng } from '../core/rng';
import type { SpatialHash } from '../entities/spatial';
import { NO_UNIT, UnitState, type UnitStore } from '../entities/units';
import type { World } from '../world/world';
import type { WorldLaws } from '../sim/laws';
import type { Pathfinder } from './pathfinder';

export const DeathCause = { AGE: 0, HUNGER: 1, KILLED: 2, DROWNED: 3, DIVINE: 4, PLAGUE: 5, DISASTER: 6 } as const;
export type DeathCauseId = (typeof DeathCause)[keyof typeof DeathCause];
export const DEATH_CAUSE_COUNT = 7;

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
}

/** Cada cuántos ticks «piensa» una criatura (escalonado por índice). */
export const THINK_INTERVAL = 5;
/** Tras 30 s (x1) en el mismo estado activo sin terminarlo, se abandona. */
export const STATE_TIMEOUT_TICKS = 300;

export function killUnit(ctx: AiContext, i: number, cause: DeathCauseId): void {
  ctx.civ.onUnitDeath(i);
  ctx.units.kill(i);
  ctx.stats.deaths[cause]++;
}

/** Vuelve a reposo y suelta el objetivo (persecución imposible, pareja perdida...). */
export function giveUp(u: UnitStore, i: number): void {
  u.state[i] = UnitState.IDLE;
  u.target[i] = NO_UNIT;
  u.stateTicks[i] = 0;
  u.pathLen[i] = 0;
}
