import type { SpeciesId } from '../entities/species';

/** Recursos de una aldea. */
export const Resource = { FOOD: 0, WOOD: 1, STONE: 2, IRON: 3, GOLD: 4 } as const;
export type ResourceId = (typeof Resource)[keyof typeof Resource];
export const RESOURCE_COUNT = 5;
export const RESOURCE_NAMES: readonly string[] = ['Comida', 'Madera', 'Piedra', 'Hierro', 'Oro'];
export const RESOURCE_COLORS: readonly string[] = ['#d2405e', '#8a5a2a', '#a9a39a', '#b86b45', '#f0c43a'];

export type Resources = number[];

export function emptyResources(): Resources {
  return [0, 0, 0, 0, 0];
}

/** Oficios de los aldeanos. */
export const Job = { NONE: 0, GATHERER: 1, WOODCUTTER: 2, MINER: 3, FARMER: 4, BUILDER: 5, HUNTER: 6, SETTLER: 7 } as const;
export type JobId = (typeof Job)[keyof typeof Job];
export const JOB_COUNT = 8;
export const JOB_NAMES: readonly string[] = ['Sin oficio', 'Recolector', 'Leñador', 'Minero', 'Granjero', 'Constructor', 'Cazador', 'Colono'];

export const BuildingType = { HALL: 0, HOUSE: 1, STORAGE: 2, FARM: 3 } as const;
export type BuildingTypeId = (typeof BuildingType)[keyof typeof BuildingType];

export interface BuildingDef {
  /** Nombre por nivel (índice 0 = nivel 1). */
  names: readonly string[];
  w: number;
  h: number;
  /** Coste por nivel: [comida, madera, piedra, hierro, oro]. */
  cost: readonly Resources[];
  /** Puntos de trabajo para construir cada nivel. */
  work: readonly number[];
  /** Plazas de vivienda por nivel. */
  housing: readonly number[];
  /** Capacidad de almacén extra por nivel. */
  storage: readonly number[];
  /** Nivel de ayuntamiento necesario para cada nivel. */
  hallLevel: readonly number[];
  /** Población mínima de la aldea para cada nivel. */
  minPop: readonly number[];
}

export const BUILDING_DEFS: readonly BuildingDef[] = [
  {
    names: ['Hoguera', 'Ayuntamiento', 'Fortaleza'],
    w: 3,
    h: 3,
    cost: [emptyResources(), [0, 25, 12, 0, 0], [0, 45, 35, 10, 5]],
    work: [0, 240, 420],
    housing: [4, 6, 10],
    storage: [120, 220, 360],
    hallLevel: [0, 1, 2],
    minPop: [0, 10, 24],
  },
  {
    names: ['Choza', 'Casa', 'Casona'],
    w: 2,
    h: 2,
    cost: [[0, 6, 0, 0, 0], [0, 6, 5, 0, 0], [0, 8, 8, 2, 0]],
    work: [60, 90, 130],
    housing: [3, 5, 7],
    storage: [0, 0, 0],
    hallLevel: [1, 2, 3],
    minPop: [0, 0, 0],
  },
  {
    names: ['Almacén'],
    w: 2,
    h: 2,
    cost: [[0, 12, 4, 0, 0]],
    work: [100],
    housing: [0],
    storage: [150],
    hallLevel: [2],
    minPop: [8],
  },
  {
    names: ['Granja'],
    w: 3,
    h: 3,
    cost: [[0, 5, 0, 0, 0]],
    work: [50],
    housing: [0],
    storage: [0],
    hallLevel: [1],
    minPop: [5],
  },
];

/** Crecimiento de una granja hasta la cosecha. */
export const FARM_RIPE = 100;
export const FARM_HARVEST_FOOD = 14;

export interface Building {
  readonly id: number;
  readonly type: BuildingTypeId;
  readonly village: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Nivel terminado (0 = obra nueva sin terminar). */
  level: number;
  /** true mientras se construye o mejora. */
  underConstruction: boolean;
  progress: number;
  /** Crecimiento del cultivo (sólo granjas). */
  growth: number;
  alive: boolean;
}

export interface Village {
  readonly id: number;
  readonly name: string;
  readonly race: SpeciesId;
  readonly colorIndex: number;
  readonly cx: number;
  readonly cy: number;
  readonly founded: number;
  hallId: number;
  /** Edificios vivos de la aldea (ids). */
  buildingIds: number[];
  resources: Resources;
  zones: number;
  alive: boolean;
  lastSettlers: number;
  // Censo (se recalcula periódicamente).
  population: number;
  adults: number;
  housing: number;
  storageCap: number;
  jobCounts: number[];
  sites: number;
  houses: number;
  storages: number;
  farms: number;
}

/** Colores de aldea (territorio y banderas). */
export const VILLAGE_COLORS: readonly string[] = [
  '#e8a33d',
  '#3d8be8',
  '#d2405e',
  '#5cc46a',
  '#a35ce8',
  '#e8e03d',
  '#3de0d0',
  '#e8743d',
  '#8a8ae8',
  '#e85cb0',
  '#9ae83d',
  '#f2f2f2',
];

export function hallLevelName(level: number): string {
  return BUILDING_DEFS[BuildingType.HALL].names[Math.max(0, level - 1)];
}

export function canAfford(res: Resources, cost: Resources): boolean {
  for (let r = 0; r < RESOURCE_COUNT; r++) if (res[r] < cost[r]) return false;
  return true;
}

export function pay(res: Resources, cost: Resources): void {
  for (let r = 0; r < RESOURCE_COUNT; r++) res[r] -= cost[r];
}

export function totalStored(res: Resources): number {
  let t = 0;
  for (let r = 0; r < RESOURCE_COUNT; r++) t += res[r];
  return t;
}
