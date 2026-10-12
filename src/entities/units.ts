import { hashViews } from '../core/hash';
import { SPECIES, type SpeciesId } from './species';
import { Trait, addTrait } from './traits';

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
  /** Va al muelle a subir a un barco. */
  BOARD: 14,
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
  'Embarcando',
];

export const Sex = { FEMALE: 0, MALE: 1 } as const;

export const NO_UNIT = -1;
export const MAX_CAPACITY = 0x10000;
/** Sin aldea. */
export const NO_VILLAGE = -1;
/** Bit de `status`: criatura sujeta por el imán divino (fuera del mundo). */
export const HELD_FLAG = 8;
/** Bit de `status`: viaja a bordo de un barco (fuera del mundo). */
export const ABOARD_FLAG = 16;
/** Criaturas fuera del mundo: no se actualizan, no ocupan sitio ni reciben daño. */
export const OFFMAP_FLAGS = HELD_FLAG | ABOARD_FLAG;
/** Waypoints máximos guardados por criatura (ruta de A*). */
export const PATH_MAX = 24;
/** Bajas necesarias para ganarse el rasgo «Veterano». */
export const VETERAN_KILLS = 5;

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
  /** Máscara de rasgos (ver entities/traits.ts). */
  traits?: number;
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
  /** Estados permanentes (bendición, maldición, inmunidad, sujeta por el imán): ver powers/status.ts. */
  readonly status: Uint8Array;
  /** Ticks de plaga y de locura que quedan. */
  readonly plague: Uint16Array;
  readonly mad: Uint16Array;
  /** Máscara de rasgos (bit = id del rasgo). */
  readonly traits: Uint32Array;
  /** Crías que ha tenido. */
  readonly children: Uint16Array;
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
    this.status = new Uint8Array(capacity);
    this.plague = new Uint16Array(capacity);
    this.mad = new Uint16Array(capacity);
    this.traits = new Uint32Array(capacity);
    this.children = new Uint16Array(capacity);
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
    this.status[i] = 0;
    this.plague[i] = 0;
    this.mad[i] = 0;
    this.traits[i] = opts.traits ?? 0;
    this.children[i] = 0;
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

  /** Suma una baja; con suficientes, la criatura se vuelve veterana. */
  addKill(i: number): void {
    if (this.kills[i] < 0xffff) this.kills[i]++;
    if (this.kills[i] === VETERAN_KILLS) this.traits[i] = addTrait(this.traits[i], Trait.VETERAN);
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

  /** Todos los datos por criatura en orden fijo (para guardar partidas). */
  dataViews(): ArrayBufferView[] {
    return [
      this.alive, this.gen, this.species, this.sex, this.state, this.think, this.attackCd,
      this.x, this.y, this.px, this.py, this.tx, this.ty, this.hp, this.hunger, this.age,
      this.cooldown, this.target, this.generation, this.kills, this.stateTicks, this.village,
      this.job, this.carry, this.carryAmount, this.work, this.workTimer, this.nameSeed, this.gear,
      this.homeKingdom, this.status, this.plague, this.mad, this.traits, this.children,
      this.pathLen, this.pathIdx, this.path, this.free,
    ];
  }

  getCounters(): { highWater: number; freeTop: number } {
    return { highWater: this.highWater, freeTop: this.freeTop };
  }

  /** Restaura los contadores tras cargar `dataViews` y recalcula los recuentos. */
  setCounters(c: { highWater: number; freeTop: number }): void {
    if (c.highWater < 0 || c.highWater > this.capacity || c.freeTop < 0 || c.freeTop > this.capacity) throw new Error('Contadores de criaturas no válidos');
    this.highWater = c.highWater;
    this.freeTop = c.freeTop;
    // Los huecos libres deben ser criaturas muertas ya usadas (si no, spawn pisaría a una viva).
    const seen = new Uint8Array(this.highWater);
    for (let k = 0; k < this.freeTop; k++) {
      const i = this.free[k];
      if (i < 0 || i >= this.highWater || this.alive[i] !== 0 || seen[i]) throw new Error('Lista de huecos de criaturas no válida');
      seen[i] = 1;
    }
    this.count = 0;
    this.speciesCount.fill(0);
    for (let i = 0; i < this.highWater; i++) {
      if (this.alive[i] === 0) continue;
      if (this.species[i] >= SPECIES.length) throw new Error('Especie desconocida en la partida');
      this.count++;
      this.speciesCount[this.species[i]]++;
    }
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
      this.status,
      this.plague,
      this.mad,
      this.traits,
      this.children,
    ]);
  }
}
