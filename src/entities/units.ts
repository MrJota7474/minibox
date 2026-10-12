import { hashViews } from '../core/hash';
import { SPECIES, type SpeciesId } from './species';

/** Estados de comportamiento. */
export const UnitState = {
  IDLE: 0,
  WANDER: 1,
  SEEK_FOOD: 2,
  EAT: 3,
  FLEE: 4,
  HUNT: 5,
  MATE: 6,
  /** Aldeanos: ir al trabajo, trabajar, llevar la carga, ir a comer y emigrar. */
  WORK_GO: 7,
  WORK: 8,
  DELIVER: 9,
  EAT_GO: 10,
  SETTLE: 11,
  /** Guerreros: marchar hacia una aldea enemiga y combatir. */
  MARCH: 12,
  FIGHT: 13,
} as const;
export type UnitStateId = (typeof UnitState)[keyof typeof UnitState];

export const STATE_LABELS: readonly string[] = [
  'Descansando',
  'Paseando',
  'Buscando comida',
  'Comiendo',
  'Huyendo',
  'Cazando',
  'Buscando pareja',
  'Yendo a trabajar',
  'Trabajando',
  'Llevando recursos',
  'Yendo a comer',
  'Emigrando',
  'En marcha',
  'Combatiendo',
];

export const Sex = { FEMALE: 0, MALE: 1 } as const;

export const NO_UNIT = -1;
export const MAX_CAPACITY = 0x10000;
/** Sin aldea. */
export const NO_VILLAGE = -1;
/** Waypoints máximos guardados por criatura (ruta de A*). */
export const PATH_MAX = 24;

/** Datos de nacimiento de una criatura. */
export interface SpawnOptions {
  sex: number;
  ageTicks: number;
  generation: number;
  thinkOffset: number;
  /** Semilla del nombre (sólo razas civilizadas). */
  nameSeed?: number;
  /** Aldea a la que pertenece al nacer. */
  village?: number;
}

/**
 * Almacén de criaturas en formato SoA (Structure of Arrays) con capacidad fija.
 * Los huecos se reutilizan con una pila LIFO determinista; `gen` evita referencias colgantes.
 */
export class UnitStore {
  readonly capacity: number;
  /** Máximo índice usado + 1 (límite de iteración). */
  highWater = 0;
  count = 0;
  readonly speciesCount: Uint32Array;

  readonly alive: Uint8Array;
  readonly gen: Uint16Array;
  readonly species: Uint8Array;
  readonly sex: Uint8Array;
  readonly state: Uint8Array;
  readonly think: Uint8Array;
  readonly attackCd: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly hp: Int16Array;
  readonly hunger: Int16Array;
  readonly age: Uint32Array;
  readonly cooldown: Uint16Array;
  readonly target: Int32Array;
  readonly generation: Uint16Array;
  readonly kills: Uint16Array;
  /** Ticks seguidos en el estado actual (para abandonar persecuciones imposibles). */
  readonly stateTicks: Uint16Array;

  // --- Datos de aldeano (Fase B) ---
  readonly village: Int16Array;
  readonly job: Uint8Array;
  /** Recurso que lleva + 1 (0 = nada). */
  readonly carry: Uint8Array;
  readonly carryAmount: Uint8Array;
  /** Casilla o edificio objetivo del trabajo (-1 = ninguno). */
  readonly work: Int32Array;
  readonly workTimer: Uint16Array;
  readonly nameSeed: Uint32Array;
  /** Equipo: 0 = nada, 1 = armas de hierro. */
  readonly gear: Uint8Array;
  /** Reino de origen de los colonos (para que la aldea nueva sea suya). */
  readonly homeKingdom: Int16Array;
  readonly pathLen: Uint8Array;
  readonly pathIdx: Uint8Array;
  /** Waypoints (x, y) de la ruta: PATH_MAX pares por criatura. */
  readonly path: Int16Array;

  private readonly free: Int32Array;
  private freeTop = 0;

  constructor(capacity: number) {
    if (capacity > MAX_CAPACITY) throw new Error(`Capacidad máxima de criaturas: ${MAX_CAPACITY}`);
    this.capacity = capacity;
    this.speciesCount = new Uint32Array(SPECIES.length);
    this.alive = new Uint8Array(capacity);
    this.gen = new Uint16Array(capacity);
    this.species = new Uint8Array(capacity);
    this.sex = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.think = new Uint8Array(capacity);
    this.attackCd = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.tx = new Float32Array(capacity);
    this.ty = new Float32Array(capacity);
    this.hp = new Int16Array(capacity);
    this.hunger = new Int16Array(capacity);
    this.age = new Uint32Array(capacity);
    this.cooldown = new Uint16Array(capacity);
    this.target = new Int32Array(capacity).fill(NO_UNIT);
    this.generation = new Uint16Array(capacity);
    this.kills = new Uint16Array(capacity);
    this.stateTicks = new Uint16Array(capacity);
    this.village = new Int16Array(capacity).fill(NO_VILLAGE);
    this.job = new Uint8Array(capacity);
    this.carry = new Uint8Array(capacity);
    this.carryAmount = new Uint8Array(capacity);
    this.work = new Int32Array(capacity).fill(-1);
    this.workTimer = new Uint16Array(capacity);
    this.nameSeed = new Uint32Array(capacity);
    this.gear = new Uint8Array(capacity);
    this.homeKingdom = new Int16Array(capacity).fill(-1);
    this.pathLen = new Uint8Array(capacity);
    this.pathIdx = new Uint8Array(capacity);
    this.path = new Int16Array(capacity * PATH_MAX * 2);
    this.free = new Int32Array(capacity);
  }

  isFull(): boolean {
    return this.count >= this.capacity;
  }

  /** Crea una criatura; devuelve su índice o NO_UNIT si no hay espacio. */
  spawn(species: SpeciesId, x: number, y: number, opts: SpawnOptions): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.highWater < this.capacity) i = this.highWater++;
    else return NO_UNIT;

    const def = SPECIES[species];
    this.alive[i] = 1;
    this.species[i] = species;
    this.sex[i] = opts.sex;
    this.state[i] = UnitState.IDLE;
    this.think[i] = 1 + (opts.thinkOffset % 5);
    this.attackCd[i] = 0;
    this.x[i] = this.px[i] = this.tx[i] = x;
    this.y[i] = this.py[i] = this.ty[i] = y;
    this.hp[i] = def.maxHp;
    this.hunger[i] = Math.floor(def.maxHunger * 0.8);
    this.age[i] = opts.ageTicks;
    this.cooldown[i] = 0;
    this.target[i] = NO_UNIT;
    this.generation[i] = opts.generation;
    this.kills[i] = 0;
    this.stateTicks[i] = 0;
    this.village[i] = opts.village ?? NO_VILLAGE;
    this.job[i] = 0;
    this.carry[i] = 0;
    this.carryAmount[i] = 0;
    this.work[i] = -1;
    this.workTimer[i] = 0;
    this.nameSeed[i] = opts.nameSeed ?? 0;
    this.gear[i] = 0;
    this.homeKingdom[i] = -1;
    this.pathLen[i] = 0;
    this.pathIdx[i] = 0;
    this.count++;
    this.speciesCount[species]++;
    return i;
  }

  kill(i: number): void {
    if (this.alive[i] === 0) return;
    this.alive[i] = 0;
    // 15 bits de generación: el handle (gen·65536 + índice) cabe en un Int32.
    this.gen[i] = (this.gen[i] + 1) & 0x7fff;
    this.target[i] = NO_UNIT;
    this.count--;
    this.speciesCount[this.species[i]]--;
    this.free[this.freeTop++] = i;
  }

  isAlive(i: number): boolean {
    return i >= 0 && i < this.highWater && this.alive[i] === 1;
  }

  /** Referencia estable (índice + generación) para la UI. */
  handleOf(i: number): number {
    return this.gen[i] * 0x10000 + i;
  }

  /** Resuelve una referencia; NO_UNIT si la criatura ya murió. */
  resolve(handle: number): number {
    if (handle < 0) return NO_UNIT;
    const i = handle % 0x10000;
    const g = Math.floor(handle / 0x10000);
    return this.isAlive(i) && this.gen[i] === g ? i : NO_UNIT;
  }

  stateHash(): number {
    return hashViews([
      this.alive,
      this.gen,
      this.species,
      this.sex,
      this.state,
      this.think,
      this.attackCd,
      this.x,
      this.y,
      this.tx,
      this.ty,
      this.hp,
      this.hunger,
      this.age,
      this.cooldown,
      this.target,
      this.generation,
      this.kills,
      this.stateTicks,
      this.village,
      this.job,
      this.carry,
      this.carryAmount,
      this.work,
      this.workTimer,
      this.nameSeed,
      this.gear,
      this.homeKingdom,
    ]);
  }
}
