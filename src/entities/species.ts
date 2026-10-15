import { TICKS_PER_YEAR } from '../core/time';
import { Biome, Terrain } from '../world/terrain';

/** Los números son los que se guardan en las partidas: las especies nuevas van siempre al final. */
export const Species = {
  SHEEP: 0,
  RABBIT: 1,
  WOLF: 2,
  HUMAN: 3,
  SILVAN: 4,
  PETRINO: 5,
  TUSKER: 6,
  PENANTE: 7,
  ESCORIO: 8,
  CENAGOSO: 9,
  DEER: 10,
  GOAT: 11,
  CAMEL: 12,
  FOX: 13,
  BEAR: 14,
} as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

/** 'civilized' = razas que forman aldeas; 'monster' = no come ni cría y ataca a los vivos. */
export type Diet = 'herbivore' | 'carnivore' | 'civilized' | 'monster';

/** Naturaleza de cada monstruo (ver ai/monster-ai.ts y ai/monster-spawn.ts). */
export interface MonsterTraits {
  /** No-muerto: el yermo maldito lo cura, la arboleda mágica y la luz divina lo hieren. */
  undead: boolean;
  /** Ardiente: inmune al fuego y a la lava, prende lo que golpea y al morir deja una roca. */
  fiery: boolean;
  /** Daño a un edificio por golpe (aguantan lo mismo que con el fuego). */
  raze: number;
  /** Distancia (casillas) a la que busca una aldea que asaltar. */
  raidRadius: number;
  /** Ticks de calma tras matar (0 = no se sacia nunca). */
  restTicks: number;
  /** Descripción corta para el inspector. */
  trait: string;
}

/** Dónde vive un animal y cuánto sitio necesita (ver ai/habitat.ts). */
export interface Habitat {
  /** Biomas en los que está a gusto (sobre tierra firme). */
  readonly biomes: readonly number[];
  /** Capas de terreno en las que también está a gusto, sea cual sea el bioma (cabras en las alturas). */
  readonly terrains?: readonly number[];
  /** Casillas de hábitat por cada animal: por encima de ese cupo ya no cría. */
  readonly tilesPer: number;
}

/** Naturaleza de los animales salvajes. */
export interface AnimalTraits {
  /** Tamaño como presa (1 conejo … 4 dromedario). */
  readonly bodySize: number;
  /** Presa más grande que caza (0 = herbívoro). */
  readonly preyMax: number;
  /** Depredador que, si no encuentra presa, come bayas (zorro y oso). */
  readonly omnivore?: boolean;
  readonly habitat: Habitat;
}

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
  /** Sólo en monstruos. */
  monster?: MonsterTraits;
  /** Sólo en animales (herbívoros y depredadores). */
  animal?: AnimalTraits;
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
    animal: { bodySize: 2, preyMax: 0, habitat: { biomes: [Biome.GRASS, Biome.SAVANNA], tilesPer: 380 } },
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
    animal: { bodySize: 1, preyMax: 0, habitat: { biomes: [Biome.GRASS, Biome.FOREST, Biome.DESERT], tilesPer: 340 } },
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
    animal: { bodySize: 3, preyMax: 3, habitat: { biomes: [Biome.GRASS, Biome.FOREST, Biome.SNOW], tilesPer: 1500 } },
  },
  civilized(Species.HUMAN, 'Humano', 'Humanos', { maxHp: 40, damage: 4, speed: 0.085, lifeYears: 70, adultYears: 16, breedYears: 2, color: '#e0b48a' }, { chop: 1, mine: 1, gather: 1.1, build: 1.1, farm: 1.2, trait: 'Se expanden rápido' }),
  civilized(Species.SILVAN, 'Silvano', 'Silvanos', { maxHp: 34, damage: 4, speed: 0.1, lifeYears: 140, adultYears: 24, breedYears: 4, color: '#9ccf6a' }, { chop: 1.3, mine: 0.7, gather: 1.4, build: 0.9, farm: 1, trait: 'Longevos y hábiles en el bosque' }),
  civilized(Species.PETRINO, 'Petrino', 'Petrinos', { maxHp: 56, damage: 5, speed: 0.072, lifeYears: 110, adultYears: 20, breedYears: 3, color: '#b9a48a' }, { chop: 0.9, mine: 1.6, gather: 0.8, build: 1.3, farm: 0.9, trait: 'Mineros y constructores' }),
  civilized(Species.TUSKER, 'Colmilludo', 'Colmilludos', { maxHp: 52, damage: 7, speed: 0.088, lifeYears: 55, adultYears: 14, breedYears: 2, color: '#7fa25a' }, { chop: 1.1, mine: 1.1, gather: 0.9, build: 0.9, farm: 0.8, trait: 'Fuertes y prolíficos' }),
  monster(Species.PENANTE, 'Penante', 'Penantes', { maxHp: 34, damage: 6, speed: 0.06, sprint: 1.35, sight: 9, lifeYears: 7, color: '#b9a6e0' }, { undead: true, fiery: false, raze: 1, raidRadius: 48, restTicks: 0, trait: 'Alma en pena: el yermo la cura; la arboleda y la luz divina la deshacen' }),
  monster(Species.ESCORIO, 'Escorio', 'Escorios', { maxHp: 320, damage: 14, speed: 0.055, sprint: 1.25, sight: 10, lifeYears: 4, color: '#ff7a2a' }, { undead: false, fiery: true, raze: 4, raidRadius: 40, restTicks: 0, trait: 'Nacido de la lava: prende lo que golpea y al enfriarse queda en roca' }),
  monster(Species.CENAGOSO, 'Cenagoso', 'Cenagosos', { maxHp: 180, damage: 12, speed: 0.075, sprint: 1.5, sight: 11, lifeYears: 30, color: '#5a7a3a' }, { undead: false, fiery: false, raze: 3, raidRadius: 36, restTicks: Math.round(1.5 * year), trait: 'Bestia de los pantanos: asalta las aldeas y después se calma un tiempo' }),
  wild(Species.DEER, 'Ciervo', 'Ciervos', 'herbivore', { maxHp: 26, damage: 1, speed: 0.11, sprint: 1.8, sight: 9, lifeYears: 10, adultYears: 1, maxHunger: 900, litterMax: 1, breedYears: 1, meatValue: 650, color: '#a0663a' }, { bodySize: 3, preyMax: 0, habitat: { biomes: [Biome.FOREST, Biome.JUNGLE, Biome.GROVE], tilesPer: 360 } }),
  wild(Species.GOAT, 'Cabra montés', 'Cabras monteses', 'herbivore', { maxHp: 28, damage: 3, speed: 0.08, sprint: 1.6, sight: 8, lifeYears: 11, adultYears: 1, maxHunger: 900, litterMax: 2, breedYears: 1, meatValue: 550, color: '#d8cfc0' }, { bodySize: 2, preyMax: 0, habitat: { biomes: [Biome.SNOW], terrains: [Terrain.HILLS, Terrain.MOUNTAIN, Terrain.SUMMIT], tilesPer: 520 } }),
  wild(Species.CAMEL, 'Dromedario', 'Dromedarios', 'herbivore', { maxHp: 50, damage: 2, speed: 0.075, sprint: 1.4, sight: 8, lifeYears: 25, adultYears: 2, maxHunger: 2400, litterMax: 1, breedYears: 1.8, meatValue: 1100, color: '#c99a5a' }, { bodySize: 4, preyMax: 0, habitat: { biomes: [Biome.DESERT, Biome.SAVANNA], tilesPer: 420 } }),
  wild(Species.FOX, 'Zorro', 'Zorros', 'carnivore', { maxHp: 22, damage: 7, speed: 0.11, sprint: 1.8, sight: 9, lifeYears: 8, adultYears: 1, maxHunger: 1500, litterMax: 2, breedYears: 1, meatValue: 0, color: '#d8743a' }, { bodySize: 1, preyMax: 2, omnivore: true, habitat: { biomes: [Biome.GRASS, Biome.FOREST, Biome.SAVANNA], tilesPer: 1200 } }),
  wild(Species.BEAR, 'Oso', 'Osos', 'carnivore', { maxHp: 120, damage: 22, speed: 0.085, sprint: 2.1, sight: 10, lifeYears: 25, adultYears: 3, maxHunger: 3500, litterMax: 1, breedYears: 2.5, meatValue: 0, color: '#6a4a32' }, { bodySize: 4, preyMax: 4, omnivore: true, habitat: { biomes: [Biome.FOREST, Biome.SNOW], tilesPer: 2400 } }),
];

interface WildBase {
  maxHp: number;
  damage: number;
  speed: number;
  sprint: number;
  sight: number;
  lifeYears: number;
  adultYears: number;
  maxHunger: number;
  litterMax: number;
  breedYears: number;
  meatValue: number;
  color: string;
}

/** Animal salvaje: herbívoro o depredador, con su hábitat. */
function wild(id: SpeciesId, name: string, plural: string, diet: 'herbivore' | 'carnivore', b: WildBase, animal: AnimalTraits): SpeciesDef {
  return {
    id,
    name,
    plural,
    diet,
    maxHp: b.maxHp,
    damage: b.damage,
    speed: b.speed,
    sprint: b.sprint,
    sight: b.sight,
    lifespanTicks: b.lifeYears * year,
    adultTicks: Math.round(b.adultYears * year),
    maxHunger: b.maxHunger,
    hungerRate: 1,
    litterMax: b.litterMax,
    breedCooldownTicks: Math.round(b.breedYears * year),
    meatValue: b.meatValue,
    color: b.color,
    animal,
  };
}

interface MonsterBase {
  maxHp: number;
  damage: number;
  speed: number;
  sprint: number;
  sight: number;
  lifeYears: number;
  color: string;
}

/** Los monstruos aparecen ya crecidos, no pasan hambre y no crían. */
function monster(id: SpeciesId, name: string, plural: string, b: MonsterBase, traits: MonsterTraits): SpeciesDef {
  return {
    id,
    name,
    plural,
    diet: 'monster',
    maxHp: b.maxHp,
    damage: b.damage,
    speed: b.speed,
    sprint: b.sprint,
    sight: b.sight,
    lifespanTicks: b.lifeYears * year,
    adultTicks: 0,
    maxHunger: 1000,
    hungerRate: 0,
    litterMax: 0,
    breedCooldownTicks: 0,
    meatValue: 0,
    color: b.color,
    monster: traits,
  };
}

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

export const MONSTER_IDS: readonly SpeciesId[] = [Species.PENANTE, Species.ESCORIO, Species.CENAGOSO];

/** Animales salvajes, en el orden de las especies. */
export const ANIMAL_IDS: readonly SpeciesId[] = SPECIES.filter((s) => s.animal !== undefined).map((s) => s.id);

export function isCivilized(id: number): boolean {
  return SPECIES[id].diet === 'civilized';
}

const IS_MONSTER: readonly boolean[] = SPECIES.map((s) => s.diet === 'monster');

export function isMonster(id: number): boolean {
  return IS_MONSTER[id] === true;
}

export function speciesDef(id: number): SpeciesDef {
  return SPECIES[id];
}
