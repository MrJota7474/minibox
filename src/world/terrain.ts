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

/** Biomas: cubierta sobre la tierra. Los dos últimos son mágicos (sólo los crea el jugador). */
export const Biome = { GRASS: 0, FOREST: 1, DESERT: 2, SNOW: 3, SWAMP: 4, JUNGLE: 5, SAVANNA: 6, GROVE: 7, BLIGHT: 8 } as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

export interface BiomeInfo {
  name: string;
  /** Qué supone para quien vive en él (para el inspector). */
  description: string;
  /** Hierba máxima por casilla (alimento de herbívoros). */
  grassMax: number;
  /** Hierba que recupera cada casilla en cada pasada de vegetación. */
  grassRegrow: number;
  /** Probabilidad por pasada de que un árbol siembre un retoño vecino. */
  treeSpread: number;
  /** Densidad de árboles y de arbustos con bayas al generar el mundo. */
  treeDensity: number;
  bushDensity: number;
  /** Multiplicadores para quien camina por él, el hambre y el crecimiento de los cultivos. */
  speed: number;
  hunger: number;
  farm: number;
  /** Vida que gana (+) o pierde (−) en cada pasada de curación, en fracción de la vida máxima. */
  vitality: number;
  /** Probabilidad por pasada de vegetación de extenderse a una casilla vecina (biomas mágicos). */
  spread: number;
}

export const BIOME_INFO: readonly BiomeInfo[] = [
  { name: 'Pradera', description: 'Hierba abundante para el ganado', grassMax: 200, grassRegrow: 14, treeSpread: 0.004, treeDensity: 0.03, bushDensity: 0.02, speed: 1, hunger: 1, farm: 1, vitality: 0, spread: 0 },
  { name: 'Bosque', description: 'Mucha madera', grassMax: 130, grassRegrow: 10, treeSpread: 0.03, treeDensity: 0.35, bushDensity: 0.025, speed: 0.92, hunger: 1, farm: 0.9, vitality: 0, spread: 0 },
  { name: 'Desierto', description: 'Sin hierba: se pasa más hambre y los cultivos rinden poco', grassMax: 0, grassRegrow: 0, treeSpread: 0, treeDensity: 0.004, bushDensity: 0, speed: 1, hunger: 1.15, farm: 0.5, vitality: 0, spread: 0 },
  { name: 'Tundra nevada', description: 'Frío: más hambre, se camina despacio y los cultivos crecen la mitad', grassMax: 70, grassRegrow: 6, treeSpread: 0.006, treeDensity: 0.08, bushDensity: 0.005, speed: 0.85, hunger: 1.25, farm: 0.5, vitality: 0, spread: 0 },
  { name: 'Pantano', description: 'Se camina despacio, pero abundan las bayas', grassMax: 170, grassRegrow: 12, treeSpread: 0.01, treeDensity: 0.08, bushDensity: 0.08, speed: 0.7, hunger: 1, farm: 0.8, vitality: 0, spread: 0 },
  { name: 'Selva', description: 'Árboles y bayas por todas partes; cosechas generosas', grassMax: 180, grassRegrow: 16, treeSpread: 0.05, treeDensity: 0.45, bushDensity: 0.06, speed: 0.85, hunger: 1, farm: 1.2, vitality: 0, spread: 0 },
  { name: 'Sabana', description: 'Hierba seca y árboles dispersos', grassMax: 150, grassRegrow: 10, treeSpread: 0.003, treeDensity: 0.015, bushDensity: 0.01, speed: 1.05, hunger: 1.05, farm: 0.9, vitality: 0, spread: 0 },
  { name: 'Arboleda mágica', description: 'Cura a quien la pisa, da cosechas enormes y se extiende poco a poco', grassMax: 220, grassRegrow: 18, treeSpread: 0.02, treeDensity: 0.15, bushDensity: 0.05, speed: 1, hunger: 0.8, farm: 1.3, vitality: 0.08, spread: 0.02 },
  { name: 'Yermo maldito', description: 'Hiere a quien lo pisa, marchita las plantas y se extiende', grassMax: 20, grassRegrow: 2, treeSpread: 0, treeDensity: 0, bushDensity: 0, speed: 0.9, hunger: 1.2, farm: 0.3, vitality: -0.06, spread: 0.02 },
];

/** Biomas mágicos: se extienden solos sobre los vecinos. */
export function isMagicBiome(b: number): boolean {
  return (BIOME_INFO[b]?.spread ?? 0) > 0;
}

/** Objetos del suelo: vegetación y depósitos minerales. */
export const Flora = { NONE: 0, SAPLING: 1, TREE: 2, BUSH: 3, BERRY_BUSH: 4, ROCK: 5, IRON: 6, GOLD: 7 } as const;
export type FloraId = (typeof Flora)[keyof typeof Flora];

export const FLORA_NAMES: readonly string[] = ['Nada', 'Retoño', 'Árbol', 'Arbusto', 'Arbusto con bayas', 'Roca', 'Veta de hierro', 'Veta de oro'];

export function isPlant(f: number): boolean {
  return f >= Flora.SAPLING && f <= Flora.BERRY_BUSH;
}

export function isDeposit(f: number): boolean {
  return f >= Flora.ROCK && f <= Flora.GOLD;
}
