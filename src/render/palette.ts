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

/** Hierba plena por bioma (pradera, bosque, desierto). */
const GRASS_RGB: readonly Rgb[] = ['#62ab3b', '#3e7f2d', '#d8b56c'].map(hexToRgb);
const DESERT_GROUND: Rgb = hexToRgb('#d2ad69');

const FLORA_RGB: Readonly<Record<number, Rgb>> = {
  [Flora.SAPLING]: hexToRgb('#79c74f'),
  [Flora.BUSH]: hexToRgb('#4c8a34'),
  [Flora.BERRY_BUSH]: hexToRgb('#b4415a'),
};
const TREE_RGB: readonly Rgb[] = ['#2d6a26', '#1f4d1d', '#6f7d2c'].map(hexToRgb);

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
      const level = (world.grass[i] >> 6) / 3;
      const cover = t === Terrain.HILLS ? level * 0.6 : level;
      c = lerp(c, GRASS_RGB[biome], cover);
    }
  }
  // Agua más oscura cuanto más profunda; tierra más clara cuanto más alta.
  const shade = info.water ? 0.82 + rel * 0.28 : 0.92 + rel * 0.14;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

/** Color final empaquetado de una casilla. */
export function tileColor(world: World, i: number): number {
  const f = world.flora[i];
  let c: [number, number, number];
  if (f === Flora.TREE) {
    const tree = TREE_RGB[world.biome[i]];
    c = [tree[0], tree[1], tree[2]];
  } else if (f !== Flora.NONE) {
    const fl = FLORA_RGB[f];
    c = [fl[0], fl[1], fl[2]];
  } else {
    c = baseColor(world, i);
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
