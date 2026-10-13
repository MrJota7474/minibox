import { hashMix } from '../core/hash';
import { TICKS_PER_YEAR } from '../core/time';

/** Estaciones: primavera, verano, otoño e invierno, cada una de la duración elegida. */
export const Season = { SPRING: 0, SUMMER: 1, AUTUMN: 2, WINTER: 3 } as const;
export type SeasonId = (typeof Season)[keyof typeof Season];
/** Duraciones de cada estación que puede elegir el jugador (en ticks). */
export const SEASON_LENGTHS: readonly { ticks: number; label: string }[] = [
  { ticks: TICKS_PER_YEAR / 4, label: '3 meses' },
  { ticks: TICKS_PER_YEAR, label: '1 año' },
  { ticks: 5 * TICKS_PER_YEAR, label: '5 años' },
  { ticks: 10 * TICKS_PER_YEAR, label: '10 años' },
];
/** Por defecto, cada estación dura 5 años: así no pasan volando al acelerar el tiempo. */
export const DEFAULT_SEASON_TICKS = 5 * TICKS_PER_YEAR;
export const SEASON_TICKS = DEFAULT_SEASON_TICKS;

export function isSeasonLength(ticks: number): boolean {
  return SEASON_LENGTHS.some((s) => s.ticks === ticks);
}

/** Multiplicadores del clima del momento (estación × era). */
export interface ClimateMods {
  season: SeasonId;
  grass: number;
  /** Expansión de los árboles y crecimiento de los retoños. */
  tree: number;
  farm: number;
  hunger: number;
  /** Velocidad a la que se extienden los biomas mágicos. */
  magic: number;
  /** Desplazamiento de la opinión mínima para declarar una guerra (+ = más guerras). */
  war: number;
}

interface SeasonInfo {
  name: string;
  grass: number;
  tree: number;
  farm: number;
  hunger: number;
}

export const SEASON_INFO: readonly SeasonInfo[] = [
  { name: 'Primavera', grass: 1.3, tree: 1.5, farm: 1.2, hunger: 1 },
  { name: 'Verano', grass: 1, tree: 1, farm: 1, hunger: 1 },
  { name: 'Otoño', grass: 0.75, tree: 0.6, farm: 0.8, hunger: 1.05 },
  // Los inviernos pueden durar años: las cosechas crecen poco, pero no se paran del todo.
  { name: 'Invierno', grass: 0.4, tree: 0.3, farm: 0.25, hunger: 1.1 },
];

/** Eras: épocas de unos 40 años que tiñen todo el mundo. */
export const Era = { TEMPERATE: 0, PLENTY: 1, FROST: 2, IRON: 3, CONCORD: 4, ARCANE: 5 } as const;
export type EraId = (typeof Era)[keyof typeof Era];
export const ERA_YEARS = 40;
export const ERA_TICKS = ERA_YEARS * TICKS_PER_YEAR;

interface EraInfo {
  name: string;
  description: string;
  grass: number;
  farm: number;
  hunger: number;
  magic: number;
  war: number;
}

export const ERA_INFO: readonly EraInfo[] = [
  { name: 'Era templada', description: 'Nada fuera de lo común', grass: 1, farm: 1, hunger: 1, magic: 1, war: 0 },
  { name: 'Era de la abundancia', description: 'Hierba y cosechas abundantes', grass: 1.4, farm: 1.4, hunger: 0.9, magic: 1, war: 0 },
  { name: 'Era glacial', description: 'Inviernos largos: menos hierba y cosechas, más hambre', grass: 0.6, farm: 0.6, hunger: 1.2, magic: 1, war: 0 },
  { name: 'Era de hierro', description: 'Los reinos se declaran la guerra con facilidad', grass: 1, farm: 1, hunger: 1, magic: 1, war: 15 },
  { name: 'Era de la concordia', description: 'Las guerras son raras', grass: 1, farm: 1, hunger: 1, magic: 1, war: -20 },
  { name: 'Era arcana', description: 'Los biomas mágicos se extienden muy deprisa', grass: 1, farm: 1, hunger: 1, magic: 4, war: 0 },
];

/** Era natural número `index` del mundo `seed` (la primera siempre es templada; nunca se repite seguida). */
export function eraAt(seed: number, index: number): EraId {
  let era: number = Era.TEMPERATE;
  for (let k = 1; k <= index; k++) {
    const pick = (hashMix(seed >>> 0, k) >>> 0) % ERA_INFO.length;
    era = pick === era ? (pick + 1) % ERA_INFO.length : pick;
  }
  return era as EraId;
}

/** Clima neutro (para pruebas y para cuando no hay estaciones). */
export function neutralClimate(): ClimateMods {
  return { season: Season.SUMMER, grass: 1, tree: 1, farm: 1, hunger: 1, magic: 1, war: 0 };
}

/**
 * Reloj del clima: la estación se deduce del tick; la era avanza cada ERA_TICKS
 * (o la cambia el jugador, hasta que empiece la siguiente).
 */
export class Climate {
  era: EraId = Era.TEMPERATE;
  eraIndex = 0;
  /** Duración de cada estación (ticks). */
  seasonTicks = DEFAULT_SEASON_TICKS;
  /** Desfase para que, al cambiar la duración, la estación en curso empiece de nuevo (no salte). */
  seasonOffset = 0;

  constructor(private readonly seed: number) {}

  seasonAt(tick: number, seasons: boolean): SeasonId {
    if (!seasons) return Season.SUMMER;
    const s = (Math.floor((tick + this.seasonOffset) / this.seasonTicks) % 4) as SeasonId;
    // En la era glacial el otoño ya es invierno.
    return this.era === Era.FROST && s === Season.AUTUMN ? Season.WINTER : s;
  }

  /** Avanza las eras; devuelve true si acaba de empezar una nueva. */
  update(tick: number): boolean {
    const index = Math.floor(tick / ERA_TICKS);
    if (index === this.eraIndex) return false;
    this.eraIndex = index;
    this.era = eraAt(this.seed, index);
    return true;
  }

  /** El jugador impone una era (dura hasta que empiece la siguiente). */
  setEra(era: number): boolean {
    if (!Number.isInteger(era) || era < 0 || era >= ERA_INFO.length || era === this.era) return false;
    this.era = era as EraId;
    return true;
  }

  /** El jugador cambia la duración de las estaciones. */
  setSeasonTicks(ticks: number, now: number): boolean {
    if (!isSeasonLength(ticks) || ticks === this.seasonTicks) return false;
    const current = Math.floor((now + this.seasonOffset) / this.seasonTicks) % 4;
    const cycle = 4 * ticks;
    this.seasonTicks = ticks;
    // La estación en curso vuelve a empezar con la nueva duración.
    this.seasonOffset = (((current * ticks - now) % cycle) + cycle) % cycle;
    return true;
  }

  mods(tick: number, seasons: boolean): ClimateMods {
    const season = this.seasonAt(tick, seasons);
    const s = SEASON_INFO[season];
    const e = ERA_INFO[this.era];
    return { season, grass: s.grass * e.grass, tree: s.tree, farm: s.farm * e.farm, hunger: s.hunger * e.hunger, magic: e.magic, war: e.war };
  }

  stateHash(): number {
    return hashMix(hashMix(hashMix(this.era, this.eraIndex), this.seasonTicks), this.seasonOffset);
  }
}
