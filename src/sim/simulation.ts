import { DEATH_CAUSE_COUNT, type AiContext, type SimStats } from '../ai/context';
import { inHabitat } from '../ai/habitat';
import { stepMigrations } from '../ai/migration';
import { Pathfinder } from '../ai/pathfinder';
import { stepMonsterSpawns } from '../ai/monster-spawn';
import { updateUnits } from '../ai/update';
import { CivSystem } from '../civ/civ-system';
import { PowerSystem } from '../powers/disasters';
import { HazardSystem } from '../powers/hazards';
import { defaultLaws, lawsHash, type WorldLaws } from './laws';
import { hashMix } from '../core/hash';
import { Rng, hashString } from '../core/rng';
import { SPECIES, Species, type SpeciesId } from '../entities/species';
import { SpatialHash } from '../entities/spatial';
import { UnitStore } from '../entities/units';
import { applyBrush, spawnInBrush } from '../powers/brush';
import { generateWorld } from '../world/generator';
import { VegetationSystem } from '../world/vegetation';
import { Climate, ERA_INFO, neutralClimate } from '../world/climate';
import { World } from '../world/world';
import type { Command, CommandResult, LoggedCommand } from './commands';

export interface SimulationOptions {
  seedText: string;
  size: number;
  /** Capacidad máxima de criaturas (según el dispositivo). */
  capacity: number;
  /** Poblar el mundo con animales al crearlo. */
  populate: boolean;
  /** Mundo vacío sin generar (para cargar una partida guardada encima). */
  blank?: boolean;
}

/**
 * Grupos iniciales por cada 10 000 casillas de mapa, cada uno en el hábitat de su especie.
 * `size` es el pincel con el que se crean (7 → unos 4 animales; 5 → 2).
 */
const INITIAL_GROUPS: readonly { species: SpeciesId; perTenThousand: number; size: number }[] = [
  { species: Species.SHEEP, perTenThousand: 1.0, size: 7 },
  { species: Species.RABBIT, perTenThousand: 1.0, size: 7 },
  { species: Species.DEER, perTenThousand: 0.8, size: 7 },
  { species: Species.GOAT, perTenThousand: 0.6, size: 7 },
  { species: Species.CAMEL, perTenThousand: 0.5, size: 7 },
  // Los depredadores, en grupos de unos cuatro para que haya parejas.
  { species: Species.WOLF, perTenThousand: 0.3, size: 7 },
  { species: Species.FOX, perTenThousand: 0.3, size: 7 },
  { species: Species.BEAR, perTenThousand: 0.15, size: 7 },
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
  readonly hazards: HazardSystem;
  readonly powers: PowerSystem;
  readonly laws: WorldLaws = defaultLaws();
  readonly climate: Climate;
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
  private readonly rngPower: Rng;
  private readonly rngMonster: Rng;
  private readonly ctx: AiContext;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.seed = hashString(options.seedText);
    this.world = options.blank ? new World(options.size, options.size) : generateWorld(this.seed, options.size, options.size);
    this.units = new UnitStore(options.capacity);
    this.spatial = new SpatialHash(options.size, options.size, options.capacity);
    this.vegetation = new VegetationSystem(this.world);
    this.civ = new CivSystem(this.world, this.units);
    this.pathfinder = new Pathfinder(this.world);
    this.hazards = new HazardSystem(this.world);
    this.powers = new PowerSystem(this.world, this.units, this.hazards);
    this.unitLimit = options.capacity;
    this.climate = new Climate(this.seed);
    const root = new Rng(this.seed);
    this.rngAi = root.fork(1);
    this.rngVeg = root.fork(2);
    this.rngCmd = root.fork(3);
    this.rngPower = root.fork(5);
    this.rngMonster = root.fork(6);
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
      laws: this.laws,
      climate: neutralClimate(),
      hazards: this.hazards,
    };
    if (options.populate && !options.blank) this.populate(root.fork(4));
  }

  /** Ejecuta un comando del jugador (se registra con el tick actual para poder reproducirlo). */
  apply(command: Command): CommandResult {
    if (this.commandLog.length < MAX_LOGGED_COMMANDS) this.commandLog.push({ tick: this.tick, command });
    else this.logTruncated = true;
    // Los comandos también matan y hacen aparecer criaturas: el contexto debe estar al día.
    this.ctx.tick = this.tick;
    this.ctx.unitLimit = Math.min(this.unitLimit, this.units.capacity);
    if (command.type === 'brush') {
      applyBrush(this.world, this.rngCmd, command.tool, command.x, command.y, command.size);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'power') {
      // El spatial hash puede estar desfasado si se aplica en pausa: se reconstruye.
      this.spatial.rebuild(this.units);
      this.ctx.tick = this.tick;
      this.powers.apply(command.power, command.x, command.y, command.size, this.ctx, this.rngCmd, this.civ);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'grab') {
      this.spatial.rebuild(this.units);
      this.powers.grab(command.x, command.y, command.size, this.ctx);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'drop') {
      this.powers.drop(command.x, command.y);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'era') {
      if (this.climate.setEra(command.era)) this.civ.addEvent('era', -1, `Por voluntad divina comienza la ${ERA_INFO[this.climate.era].name}`);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'seasonLength') {
      this.climate.setSeasonTicks(command.ticks, this.tick);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'law') {
      this.laws[command.law] = command.value;
      return { spawned: 0, limited: false };
    }
    if (command.type === 'diplomacy') {
      this.civ.kingdoms.applyGodAction(command.action, command.a, command.b);
      return { spawned: 0, limited: false };
    }
    if (command.type === 'limit') {
      this.unitLimit = Math.max(1, Math.min(this.units.capacity, Math.floor(command.value)));
      this.ctx.unitLimit = this.unitLimit;
      return { spawned: 0, limited: false };
    }
    return spawnInBrush(this.world, this.units, this.rngCmd, command.species, command.x, command.y, command.size, this.unitLimit);
  }

  step(): void {
    this.ctx.tick = this.tick;
    this.ctx.unitLimit = Math.min(this.unitLimit, this.units.capacity);
    if (this.climate.update(this.tick)) this.civ.addEvent('era', -1, `Comienza la ${ERA_INFO[this.climate.era].name}`);
    this.ctx.climate = this.climate.mods(this.tick, this.laws.seasons);
    if (this.laws.vegetation) this.vegetation.step(this.rngVeg, this.ctx.climate, this.laws.magicSpread);
    if (this.world.regionsDirty && this.tick % REGION_RECOMPUTE_TICKS === 0) this.world.computeRegions();
    this.pathfinder.resetBudget();
    this.spatial.rebuild(this.units);
    this.hazards.step(this.ctx, this.rngPower, this.laws.fireSpread, this.civ);
    this.powers.step(this.ctx, this.rngPower, this.civ);
    stepMonsterSpawns(this.ctx, this.rngMonster);
    stepMigrations(this.ctx, this.rngAi);
    this.civ.update(this.ctx);
    updateUnits(this.ctx);
    this.tick++;
  }

  stateHash(): number {
    let h = hashMix(this.world.stateHash(), this.units.stateHash());
    h = hashMix(h, this.civ.stateHash());
    h = hashMix(h, this.powers.stateHash());
    h = hashMix(h, lawsHash(this.laws));
    h = hashMix(h, this.climate.stateHash());
    h = hashMix(h, this.tick);
    h = hashMix(h, this.vegetation.getCursor());
    h = hashMix(h, this.unitLimit);
    for (const rng of this.rngs()) {
      for (const v of rng.getState()) h = hashMix(h, v);
    }
    return h;
  }

  /** Flujos de azar en su orden de guardado (los nuevos se añaden siempre al final). */
  private rngs(): Rng[] {
    return [this.rngAi, this.rngVeg, this.rngCmd, this.rngPower, this.rngMonster];
  }

  /** Estado de los generadores aleatorios (para guardar partidas). */
  getRngStates(): number[][] {
    return this.rngs().map((r) => [...r.getState()]);
  }

  setRngStates(states: readonly (readonly number[])[]): void {
    const rngs = this.rngs();
    if (states.length !== rngs.length || states.some((s) => s.length !== 4 || s.some((v) => !Number.isInteger(v)))) throw new Error('Estado aleatorio no válido');
    rngs.forEach((r, k) => r.setState([states[k][0], states[k][1], states[k][2], states[k][3]]));
  }

  private populate(rng: Rng): void {
    const area = this.world.size / 10000;
    // La población inicial depende sólo de la semilla y el tamaño, no del dispositivo.
    const limit = this.units.capacity;
    for (const group of INITIAL_GROUPS) {
      const groups = Math.max(1, Math.round(area * group.perTenThousand));
      for (let g = 0; g < groups; g++) {
        const spot = this.findHabitatSpot(rng, group.species);
        if (spot < 0) continue;
        const x = spot % this.world.width;
        const y = Math.floor(spot / this.world.width);
        spawnInBrush(this.world, this.units, rng, group.species, x, y, group.size, limit);
      }
    }
  }

  /** Una casilla pisable del hábitat de la especie (o -1 si no la encuentra). */
  private findHabitatSpot(rng: Rng, species: SpeciesId): number {
    const def = SPECIES[species];
    for (let a = 0; a < PLACEMENT_ATTEMPTS; a++) {
      const i = rng.int(this.world.size);
      if (this.world.canWalk(i) && inHabitat(def, this.world, i)) return i;
    }
    return -1;
  }
}
