import { Season } from '../world/climate';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../world/terrain';
import type { World } from '../world/world';

/** Paleta propia de MiniBox (tonos cálidos y saturados). */
export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const TERRAIN_RGB: readonly Rgb[] = [
  '#16294f', // océano profundo
  '#1f4a86', // océano
  '#3678bd', // aguas someras
  '#e4cf8c', // arena
  '#8b6b3f', // tierra baja (sin hierba)
  '#7b5d38', // tierra alta (sin hierba)
  '#7a6e4c', // colinas
  '#857b70', // montaña
  '#eef1f3', // cumbre
].map(hexToRgb);

/** Hierba plena por bioma (en el orden de Biome). */
const GRASS_RGB: readonly Rgb[] = ['#62ab3b', '#3e7f2d', '#d8b56c', '#b9c9c0', '#56703c', '#2e9a3c', '#b9aa4c', '#4fc7a6', '#5e3f63'].map(hexToRgb);
const DESERT_GROUND: Rgb = hexToRgb('#d2ad69');
/** Suelo propio de algunos biomas (el resto usa el color de la capa de terreno). */
const BIOME_GROUND: Readonly<Partial<Record<number, Rgb>>> = {
  [Biome.SNOW]: hexToRgb('#e6ecef'),
  [Biome.SWAMP]: hexToRgb('#4c4a33'),
  [Biome.BLIGHT]: hexToRgb('#3e3040'),
};
/** Biomas cálidos: no nieva en invierno. Biomas de coníferas: no amarillean en otoño. */
const WARM = new Set<number>([Biome.DESERT, Biome.JUNGLE, Biome.SAVANNA]);
const EVERGREEN = new Set<number>([Biome.SNOW, Biome.JUNGLE, Biome.GROVE, Biome.BLIGHT]);
const SNOW_RGB: Rgb = hexToRgb('#eef2f4');
const AUTUMN_GRASS: Rgb = hexToRgb('#b8873a');
const AUTUMN_TREE: Rgb = hexToRgb('#b5652a');
const SPRING_GRASS: Rgb = hexToRgb('#7cc84a');

const FLORA_RGB: Readonly<Record<number, Rgb>> = {
  [Flora.SAPLING]: hexToRgb('#79c74f'),
  [Flora.BUSH]: hexToRgb('#4c8a34'),
  [Flora.BERRY_BUSH]: hexToRgb('#b4415a'),
  [Flora.ROCK]: hexToRgb('#5d5953'),
  [Flora.IRON]: hexToRgb('#9a5b3c'),
  [Flora.GOLD]: hexToRgb('#f0c43a'),
};
const TREE_RGB: readonly Rgb[] = ['#2d6a26', '#1f4d1d', '#6f7d2c', '#2c5446', '#3a5530', '#14612a', '#7d8a35', '#2f8d99', '#3b2a40'].map(hexToRgb);

export const BACKGROUND = '#0b1428';

function lerp(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function tileJitter(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h & 15) - 7.5) * 0.9;
}

function pack(r: number, g: number, b: number): number {
  const cr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const cg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const cb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  // ImageData en memoria little-endian: ABGR.
  return ((255 << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
}

function baseColor(world: World, i: number): [number, number, number] {
  const t = world.terrain[i];
  const info = TERRAIN_INFO[t];
  const next = TERRAIN_INFO[t + 1];
  const span = (next ? next.minHeight : 256) - info.minHeight;
  const rel = (world.heightMap[i] - info.minHeight) / span;
  let c: [number, number, number] = [...TERRAIN_RGB[t]];

  if (t === Terrain.SOIL_LOW || t === Terrain.SOIL_HIGH || t === Terrain.HILLS) {
    const biome = world.biome[i];
    if (biome === Biome.DESERT) {
      c = lerp(c, DESERT_GROUND, 0.85);
    } else {
      const ground = BIOME_GROUND[biome];
      if (ground) c = lerp(c, ground, 0.7);
      const level = (world.grass[i] >> 6) / 3;
      const cover = t === Terrain.HILLS ? level * 0.6 : level;
      c = lerp(c, GRASS_RGB[biome], Math.max(cover, ground ? 0.35 : 0));
    }
  }
  // Agua más oscura cuanto más profunda; tierra más clara cuanto más alta.
  const shade = info.water ? 0.82 + rel * 0.28 : 0.92 + rel * 0.14;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

/** Relieve: la luz llega del noroeste, así que las laderas que miran al sureste quedan en sombra. */
const RELIEF_STRENGTH = 0.012;
const RELIEF_MAX = 0.22;
const FOAM_RGB: Rgb = hexToRgb('#cfe8f4');

function reliefShade(world: World, i: number): number {
  const w = world.width;
  const x = i % w;
  const y = (i - x) / w;
  if (x === 0 || y === 0 || x === w - 1 || y === world.height - 1) return 1;
  const dh = world.heightMap[i - w - 1] - world.heightMap[i + w + 1];
  return 1 - Math.max(-RELIEF_MAX, Math.min(RELIEF_MAX, dh * RELIEF_STRENGTH));
}

/** ¿Toca la casilla agua (o tierra, si es agua) por alguno de sus 4 lados? */
function touchesOther(world: World, i: number, water: boolean): boolean {
  const w = world.width;
  const x = i % w;
  const other = (j: number): boolean => j >= 0 && j < world.size && world.isWaterIdx(j) !== water;
  return (x > 0 && other(i - 1)) || (x < w - 1 && other(i + 1)) || other(i - w) || other(i + w);
}

/** Color final empaquetado de una casilla. */
const LAVA_RGB: Rgb = hexToRgb('#f05a1a');
const FIRE_RGB: Rgb = hexToRgb('#7a2a12');

/** Tinte de la estación sobre la tierra (nieve en invierno, ocres en otoño, verde vivo en primavera). */
function seasonTint(c: [number, number, number], world: World, i: number, season: number, tree: boolean): [number, number, number] {
  const t = world.terrain[i];
  if (season === Season.SUMMER || TERRAIN_INFO[t].water || t === Terrain.SUMMIT) return c;
  const biome = world.biome[i];
  if (season === Season.WINTER) {
    if (WARM.has(biome)) return c;
    const amount = biome === Biome.SNOW ? 0.8 : tree ? 0.3 : t === Terrain.SAND ? 0.25 : 0.55;
    return lerp(c, SNOW_RGB, amount);
  }
  if (season === Season.AUTUMN) {
    if (EVERGREEN.has(biome) || t === Terrain.SAND || t === Terrain.MOUNTAIN) return c;
    return lerp(c, tree ? AUTUMN_TREE : AUTUMN_GRASS, tree ? 0.45 : 0.3);
  }
  if (tree || !TERRAIN_INFO[t].fertile || WARM.has(biome) || EVERGREEN.has(biome)) return c;
  return lerp(c, SPRING_GRASS, 0.15);
}

export function tileColor(world: World, i: number, season: number = Season.SUMMER): number {
  const f = world.flora[i];
  let c: [number, number, number];
  if (world.lava[i] > 0) {
    const t = Math.min(1, world.lava[i] / 60);
    return pack(120 + LAVA_RGB[0] * t * 0.5, 40 + LAVA_RGB[1] * t, 20 + LAVA_RGB[2] * t * 0.3);
  }
  if (world.fire[i] > 0) return pack(FIRE_RGB[0], FIRE_RGB[1], FIRE_RGB[2]);
  if (f === Flora.TREE) {
    const tree = TREE_RGB[world.biome[i]];
    c = seasonTint(lerp(baseColor(world, i), tree, 0.75), world, i, season, true);
  } else if (f !== Flora.NONE) {
    c = lerp(seasonTint(baseColor(world, i), world, i, season, false), FLORA_RGB[f], 0.55);
  } else {
    c = seasonTint(baseColor(world, i), world, i, season, false);
  }
  const t = world.terrain[i];
  if (TERRAIN_INFO[t].water) {
    // Espuma en la orilla.
    if (t === Terrain.SHALLOW && touchesOther(world, i, true)) c = lerp(c, FOAM_RGB, 0.38);
  } else {
    const r = reliefShade(world, i);
    c = [c[0] * r, c[1] * r, c[2] * r];
    // Arena mojada junto al agua.
    if (t === Terrain.SAND && touchesOther(world, i, false)) c = [c[0] * 0.88, c[1] * 0.88, c[2] * 0.9];
  }
  const j = tileJitter(i);
  return pack(c[0] + j, c[1] + j, c[2] + j);
}

/** Color CSS de muestra para iconos de terreno y bioma. */
export function terrainSwatch(terrain: number): Rgb {
  return TERRAIN_RGB[terrain];
}

export function biomeSwatch(biome: number): Rgb {
  return biome === Biome.DESERT ? DESERT_GROUND : GRASS_RGB[biome];
}

