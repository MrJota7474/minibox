import { TICKS_PER_YEAR } from '../core/time';

export const Species = { SHEEP: 0, RABBIT: 1, WOLF: 2 } as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

export type Diet = 'herbivore' | 'carnivore';

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
];

export function speciesDef(id: number): SpeciesDef {
  return SPECIES[id];
}
