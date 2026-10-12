import { TICKS_PER_YEAR } from '../core/time';

export const Species = { SHEEP: 0, RABBIT: 1, WOLF: 2, HUMAN: 3, SILVAN: 4, PETRINO: 5, TUSKER: 6 } as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

/** 'civilized' = razas que forman aldeas. */
export type Diet = 'herbivore' | 'carnivore' | 'civilized';

/** Multiplicadores de trabajo de cada raza (1 = normal). */
export interface RaceTraits {
  chop: number;
  mine: number;
  gather: number;
  build: number;
  farm: number;
  /** Descripción corta para el inspector. */
  trait: string;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  plural: string;
  diet: Diet;
  maxHp: number;
  damage: number;
  /** Casillas por tick al pasear. */
  speed: number;
  /** Multiplicador de velocidad al huir o cazar. */
  sprint: number;
  /** Radio de percepción en casillas. */
  sight: number;
  lifespanTicks: number;
  adultTicks: number;
  maxHunger: number;
  /** Hambre perdida por tick. */
  hungerRate: number;
  litterMax: number;
  breedCooldownTicks: number;
  /** Hambre que recupera un depredador al comerse uno. */
  meatValue: number;
  /** Color representativo (puntos con zoom alejado e iconos). */
  color: string;
  /** Sólo en razas civilizadas. */
  race?: RaceTraits;
}

const year = TICKS_PER_YEAR;

export const SPECIES: readonly SpeciesDef[] = [
  {
    id: Species.SHEEP,
    name: 'Oveja',
    plural: 'Ovejas',
    diet: 'herbivore',
    maxHp: 30,
    damage: 1,
    speed: 0.07,
    sprint: 1.5,
    sight: 7,
    lifespanTicks: 12 * year,
    adultTicks: 1 * year,
    maxHunger: 1000,
    hungerRate: 1,
    litterMax: 1,
    breedCooldownTicks: Math.round(0.9 * year),
    meatValue: 700,
    color: '#efe9da',
  },
  {
    id: Species.RABBIT,
    name: 'Conejo',
    plural: 'Conejos',
    diet: 'herbivore',
    maxHp: 12,
    damage: 0,
    speed: 0.1,
    sprint: 1.6,
    sight: 6,
    lifespanTicks: 6 * year,
    adultTicks: Math.round(0.5 * year),
    maxHunger: 600,
    hungerRate: 1,
    litterMax: 2,
    breedCooldownTicks: Math.round(0.8 * year),
    meatValue: 350,
    color: '#b8956a',
  },
  {
    id: Species.WOLF,
    name: 'Lobo',
    plural: 'Lobos',
    diet: 'carnivore',
    maxHp: 45,
    damage: 12,
    speed: 0.1,
    sprint: 1.9,
    sight: 11,
    lifespanTicks: 14 * year,
    adultTicks: Math.round(1.5 * year),
    maxHunger: 1500,
    hungerRate: 1,
    litterMax: 3,
    breedCooldownTicks: Math.round(1.2 * year),
    meatValue: 0,
    color: '#7d8590',
  },
  civilized(Species.HUMAN, 'Humano', 'Humanos', { maxHp: 40, damage: 4, speed: 0.085, lifeYears: 70, adultYears: 16, breedYears: 2, color: '#e0b48a' }, { chop: 1, mine: 1, gather: 1.1, build: 1.1, farm: 1.2, trait: 'Se expanden rápido' }),
  civilized(Species.SILVAN, 'Silvano', 'Silvanos', { maxHp: 34, damage: 4, speed: 0.1, lifeYears: 140, adultYears: 24, breedYears: 4, color: '#9ccf6a' }, { chop: 1.3, mine: 0.7, gather: 1.4, build: 0.9, farm: 1, trait: 'Longevos y hábiles en el bosque' }),
  civilized(Species.PETRINO, 'Petrino', 'Petrinos', { maxHp: 56, damage: 5, speed: 0.072, lifeYears: 110, adultYears: 20, breedYears: 3, color: '#b9a48a' }, { chop: 0.9, mine: 1.6, gather: 0.8, build: 1.3, farm: 0.9, trait: 'Mineros y constructores' }),
  civilized(Species.TUSKER, 'Colmilludo', 'Colmilludos', { maxHp: 52, damage: 7, speed: 0.088, lifeYears: 55, adultYears: 14, breedYears: 2, color: '#7fa25a' }, { chop: 1.1, mine: 1.1, gather: 0.9, build: 0.9, farm: 0.8, trait: 'Fuertes y prolíficos' }),
];

interface CivBase {
  maxHp: number;
  damage: number;
  speed: number;
  lifeYears: number;
  adultYears: number;
  breedYears: number;
  color: string;
}

function civilized(id: SpeciesId, name: string, plural: string, b: CivBase, race: RaceTraits): SpeciesDef {
  return {
    id,
    name,
    plural,
    diet: 'civilized',
    maxHp: b.maxHp,
    damage: b.damage,
    speed: b.speed,
    sprint: 1.6,
    sight: 12,
    lifespanTicks: b.lifeYears * year,
    adultTicks: b.adultYears * year,
    maxHunger: 1200,
    hungerRate: 1,
    litterMax: 1,
    breedCooldownTicks: b.breedYears * year,
    meatValue: 0,
    color: b.color,
    race,
  };
}

export const RACE_IDS: readonly SpeciesId[] = [Species.HUMAN, Species.SILVAN, Species.PETRINO, Species.TUSKER];

export function isCivilized(id: number): boolean {
  return SPECIES[id].diet === 'civilized';
}

export function speciesDef(id: number): SpeciesDef {
  return SPECIES[id];
}
