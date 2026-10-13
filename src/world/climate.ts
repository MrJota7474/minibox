import { hashMix } from '../core/hash';
import { TICKS_PER_YEAR } from '../core/time';

/** Estaciones del año: tres meses cada una. */
export const Season = { SPRING: 0, SUMMER: 1, AUTUMN: 2, WINTER: 3 } as const;
export type SeasonId = (typeof Season)[keyof typeof Season];
export const SEASON_TICKS = TICKS_PER_YEAR / 4;

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
  { name: 'Otoño', grass: 0.7, tree: 0.6, farm: 0.8, hunger: 1.05 },
  { name: 'Invierno', grass: 0.25, tree: 0.2, farm: 0, hunger: 1.15 },
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

  constructor(private readonly seed: number) {}

  seasonAt(tick: number, seasons: boolean): SeasonId {
    if (!seasons) return Season.SUMMER;
    const s = Math.floor((tick % TICKS_PER_YEAR) / SEASON_TICKS) as SeasonId;
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

  mods(tick: number, seasons: boolean): ClimateMods {
    const season = this.seasonAt(tick, seasons);
    const s = SEASON_INFO[season];
    const e = ERA_INFO[this.era];
    return { season, grass: s.grass * e.grass, tree: s.tree, farm: s.farm * e.farm, hunger: s.hunger * e.hunger, magic: e.magic, war: e.war };
  }

  stateHash(): number {
    return hashMix(this.era, this.eraIndex);
  }
}
