/** Capas de terreno, derivadas siempre de la altura (0-255). */
export const Terrain = {
  DEEP: 0,
  OCEAN: 1,
  SHALLOW: 2,
  SAND: 3,
  SOIL_LOW: 4,
  SOIL_HIGH: 5,
  HILLS: 6,
  MOUNTAIN: 7,
  SUMMIT: 8,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainInfo {
  name: string;
  /** Altura mínima (incluida) de esta capa. */
  minHeight: number;
  /** Altura que se usa al pintar esta capa. */
  paintHeight: number;
  walkable: boolean;
  water: boolean;
  /** La hierba y los biomas sólo crecen en terreno fértil. */
  fertile: boolean;
}

export const TERRAIN_INFO: readonly TerrainInfo[] = [
  { name: 'Océano profundo', minHeight: 0, paintHeight: 40, walkable: false, water: true, fertile: false },
  { name: 'Océano', minHeight: 60, paintHeight: 75, walkable: false, water: true, fertile: false },
  { name: 'Aguas someras', minHeight: 90, paintHeight: 98, walkable: false, water: true, fertile: false },
  { name: 'Arena', minHeight: 105, paintHeight: 108, walkable: true, water: false, fertile: false },
  { name: 'Tierra baja', minHeight: 112, paintHeight: 130, walkable: true, water: false, fertile: true },
  { name: 'Tierra alta', minHeight: 150, paintHeight: 165, walkable: true, water: false, fertile: true },
  { name: 'Colinas', minHeight: 180, paintHeight: 192, walkable: true, water: false, fertile: true },
  { name: 'Montaña', minHeight: 205, paintHeight: 220, walkable: true, water: false, fertile: false },
  { name: 'Cumbre', minHeight: 235, paintHeight: 245, walkable: false, water: false, fertile: false },
];

/** Altura del nivel del mar: por debajo es agua. */
export const SEA_LEVEL = TERRAIN_INFO[Terrain.SAND].minHeight;

const HEIGHT_TO_TERRAIN = buildHeightLookup();

function buildHeightLookup(): Uint8Array {
  const table = new Uint8Array(256);
  for (let h = 0; h < 256; h++) {
    let id = 0;
    for (let t = 0; t < TERRAIN_INFO.length; t++) {
      if (h >= TERRAIN_INFO[t].minHeight) id = t;
    }
    table[h] = id;
  }
  return table;
}

export function terrainFromHeight(height: number): TerrainId {
  return HEIGHT_TO_TERRAIN[height & 255] as TerrainId;
}

const WALKABLE = TERRAIN_INFO.map((t) => t.walkable);
const WATER = TERRAIN_INFO.map((t) => t.water);
const FERTILE = TERRAIN_INFO.map((t) => t.fertile);

export function isWalkableTerrain(t: number): boolean {
  return WALKABLE[t] === true;
}
export function isWaterTerrain(t: number): boolean {
  return WATER[t] === true;
}
export function isFertileTerrain(t: number): boolean {
  return FERTILE[t] === true;
}

/** Biomas: cubierta sobre la tierra. */
export const Biome = { GRASS: 0, FOREST: 1, DESERT: 2 } as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

export interface BiomeInfo {
  name: string;
  /** Hierba máxima por casilla (alimento de herbívoros). */
  grassMax: number;
  /** Hierba que recupera cada casilla en cada pasada de vegetación. */
  grassRegrow: number;
  /** Probabilidad por pasada de que un árbol siembre un retoño vecino. */
  treeSpread: number;
}

export const BIOME_INFO: readonly BiomeInfo[] = [
  { name: 'Pradera', grassMax: 200, grassRegrow: 14, treeSpread: 0.004 },
  { name: 'Bosque', grassMax: 130, grassRegrow: 10, treeSpread: 0.03 },
  { name: 'Desierto', grassMax: 0, grassRegrow: 0, treeSpread: 0 },
];

/** Vegetación por casilla. */
export const Flora = { NONE: 0, SAPLING: 1, TREE: 2, BUSH: 3, BERRY_BUSH: 4 } as const;
export type FloraId = (typeof Flora)[keyof typeof Flora];

export const FLORA_NAMES: readonly string[] = ['Nada', 'Retoño', 'Árbol', 'Arbusto', 'Arbusto con bayas'];
