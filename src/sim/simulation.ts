import { DEATH_CAUSE_COUNT, type AiContext, type SimStats } from '../ai/context';
import { Pathfinder } from '../ai/pathfinder';
import { updateUnits } from '../ai/update';
import { CivSystem } from '../civ/civ-system';
import { hashMix } from '../core/hash';
import { Rng, hashString } from '../core/rng';
import { Species, type SpeciesId } from '../entities/species';
import { SpatialHash } from '../entities/spatial';
import { UnitStore } from '../entities/units';
import { applyBrush, spawnInBrush } from '../powers/brush';
import { generateWorld } from '../world/generator';
import { isFertileTerrain } from '../world/terrain';
import { VegetationSystem } from '../world/vegetation';
import type { World } from '../world/world';
import type { Command, CommandResult, LoggedCommand } from './commands';

export interface SimulationOptions {
  seedText: string;
  size: number;
  /** Capacidad máxima de criaturas (según el dispositivo). */
  capacity: number;
  /** Poblar el mundo con animales al crearlo. */
  populate: boolean;
}

/** Grupos iniciales por cada 10 000 casillas de mapa. */
const INITIAL_GROUPS: readonly { species: SpeciesId; perTenThousand: number; size: number }[] = [
  { species: Species.SHEEP, perTenThousand: 1.2, size: 9 },
  { species: Species.RABBIT, perTenThousand: 1.0, size: 9 },
  { species: Species.WOLF, perTenThousand: 0.4, size: 9 },
];
/** Tope del registro de comandos (evita que crezca sin límite en sesiones largas). */
const MAX_LOGGED_COMMANDS = 200_000;
const PLACEMENT_ATTEMPTS = 40;
/** Cada cuántos ticks se recalculan las islas si el terreno cambió. */
const REGION_RECOMPUTE_TICKS = 10;

/**
 * Núcleo de la simulación: une mundo, criaturas e IA.
 * No depende de render/input/ui, así que se puede probar en Node.
 */
export class Simulation {
  readonly options: SimulationOptions;
  readonly seed: number;
  readonly world: World;
  readonly units: UnitStore;
  readonly spatial: SpatialHash;
  readonly vegetation: VegetationSystem;
  readonly civ: CivSystem;
  readonly pathfinder: Pathfinder;
  readonly stats: SimStats = { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) };
  readonly commandLog: LoggedCommand[] = [];
  /** true si el registro superó su tamaño máximo (la repetición ya no sería exacta). */
  logTruncated = false;
  tick = 0;
  /** Límite efectivo (puede bajar si el dispositivo va lento). */
  unitLimit: number;

  private readonly rngAi: Rng;
  private readonly rngVeg: Rng;
  private readonly rngCmd: Rng;
  private readonly ctx: AiContext;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.seed = hashString(options.seedText);
    this.world = generateWorld(this.seed, options.size, options.size);
    this.units = new UnitStore(options.capacity);
    this.spatial = new SpatialHash(options.size, options.size, options.capacity);
    this.vegetation = new VegetationSystem(this.world);
    this.civ = new CivSystem(this.world, this.units);
    this.pathfinder = new Pathfinder(this.world);
    this.unitLimit = options.capacity;
    const root = new Rng(this.seed);
    this.rngAi = root.fork(1);
    this.rngVeg = root.fork(2);
    this.rngCmd = root.fork(3);
    this.ctx = {
      world: this.world,
      units: this.units,
      spatial: this.spatial,
      rng: this.rngAi,
      tick: 0,
      unitLimit: this.unitLimit,
      stats: this.stats,
      pathfinder: this.pathfinder,
      civ: this.civ,
    };
    if (options.populate) this.populate(root.fork(4));
  }

  /** Ejecuta un comando del jugador (se registra con el tick actual para poder reproducirlo). */
  apply(command: Command): CommandResult {
    if (this.commandLog.length < MAX_LOGGED_COMMANDS) this.commandLog.push({ tick: this.tick, command });
    else this.logTruncated = true;
    if (command.type === 'brush') {
      applyBrush(this.world, this.rngCmd, command.tool, command.x, command.y, command.size);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'limit') {
      this.unitLimit = Math.max(1, Math.min(this.units.capacity, Math.floor(command.value)));
      return { spawned: 0, limited: false };
    }
    return spawnInBrush(this.world, this.units, this.rngCmd, command.species, command.x, command.y, command.size, this.unitLimit);
  }

  step(): void {
    this.ctx.tick = this.tick;
    this.ctx.unitLimit = Math.min(this.unitLimit, this.units.capacity);
    this.vegetation.step(this.rngVeg);
    if (this.world.regionsDirty && this.tick % REGION_RECOMPUTE_TICKS === 0) this.world.computeRegions();
    this.pathfinder.resetBudget();
    this.spatial.rebuild(this.units);
    this.civ.update(this.ctx);
    updateUnits(this.ctx);
    this.tick++;
  }

  stateHash(): number {
    let h = hashMix(this.world.stateHash(), this.units.stateHash());
    h = hashMix(h, this.civ.stateHash());
    h = hashMix(h, this.tick);
    h = hashMix(h, this.vegetation.getCursor());
    h = hashMix(h, this.unitLimit);
    for (const rng of [this.rngAi, this.rngVeg, this.rngCmd]) {
      for (const v of rng.getState()) h = hashMix(h, v);
    }
    return h;
  }

  private populate(rng: Rng): void {
    const area = this.world.size / 10000;
    // La población inicial depende sólo de la semilla y el tamaño, no del dispositivo.
    const limit = this.units.capacity;
    for (const group of INITIAL_GROUPS) {
      const groups = Math.max(1, Math.round(area * group.perTenThousand));
      for (let g = 0; g < groups; g++) {
        const spot = this.findFertileSpot(rng);
        if (spot < 0) continue;
        const x = spot % this.world.width;
        const y = Math.floor(spot / this.world.width);
        spawnInBrush(this.world, this.units, rng, group.species, x, y, group.size, limit);
      }
    }
  }

  private findFertileSpot(rng: Rng): number {
    for (let a = 0; a < PLACEMENT_ATTEMPTS; a++) {
      const i = rng.int(this.world.size);
      if (isFertileTerrain(this.world.terrain[i])) return i;
    }
    return -1;
  }
}
