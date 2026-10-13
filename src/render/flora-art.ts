import { Season } from '../world/climate';
import { Biome, Flora } from '../world/terrain';
import { Pix, mix, shade } from './pixel';

/**
 * Pixel art original de la vegetación y los minerales: un árbol propio por bioma
 * (frondoso, conífera, cactus, sauce, palmera, acacia, árbol mágico, árbol muerto) que
 * cambia con la estación, arbustos, bayas, rocas y vetas de hierro y oro.
 */
export const FLORA_W = 14;
export const FLORA_H = 18;
const VARIANTS = 2;
const SEASONS = 4;

type Drawer = (p: Pix, season: number, variant: number) => void;

const TRUNK = '#6b4a2a';
const TRUNK_DARK = '#4a3220';
const SNOW = '#eef3f6';
const BLOSSOM = '#f4b6c8';

/** Árbol de copa redonda: verde, con flores en primavera, ocre en otoño y desnudo en invierno. */
function deciduous(leaf: string): Drawer {
  return (p, season, v) => {
    const cx = 6.5 + (v ? 0.5 : 0);
    p.rect(6, 11, 2, 6, TRUNK);
    p.set(6, 16, TRUNK_DARK);
    if (season === Season.WINTER) {
      // Ramas desnudas con algo de nieve.
      p.set(5, 10, TRUNK);
      p.set(4, 9, TRUNK);
      p.set(8, 9, TRUNK);
      p.set(9, 8, TRUNK);
      p.set(7, 8, TRUNK);
      p.set(7, 7, TRUNK);
      p.set(4, 8, SNOW);
      p.set(9, 7, SNOW);
      p.set(7, 6, SNOW);
      return;
    }
    const base = season === Season.AUTUMN ? (v ? '#c8742a' : '#d89a34') : season === Season.SPRING ? shade(leaf, 1.12) : leaf;
    const r = v ? 5 : 4.6;
    p.ellipse(cx, 6.5, r, 4.6, shade(base, 0.72));
    p.ellipse(cx - 0.4, 5.8, r - 0.8, 3.8, base);
    p.ellipse(cx + 1.2, 4.2, 1.6, 1.2, shade(base, 1.22));
    if (season === Season.SPRING) for (const [x, y] of [[4, 5], [8, 3], [9, 7], [5, 8]]) p.set(x + v, y, BLOSSOM);
  };
}

/** Conífera de la tundra: pisos de ramas, con nieve en invierno. */
const conifer: Drawer = (p, season, v) => {
  const green = '#2c5446';
  const light = '#3c7060';
  p.rect(6, 14, 2, 3, TRUNK);
  const tiers = v ? [[1, 3], [4, 4], [8, 5]] : [[2, 3], [5, 4], [9, 5]];
  for (const [y, half] of tiers) {
    for (let k = 0; k < 4; k++) {
      const w = Math.max(1, Math.round((half * (k + 1)) / 4));
      p.rect(7 - w, y + k, w * 2, 1, k === 3 ? shade(green, 0.8) : green);
    }
    p.set(6, y + 1, light);
    if (season === Season.WINTER) {
      p.rect(6, y, 2, 1, SNOW);
      p.set(7 - half + 1, y + 3, SNOW);
      p.set(6 + half - 1, y + 3, SNOW);
    }
  }
};

const cactus: Drawer = (p, _s, v) => {
  const g = '#5f8f3a';
  const gl = '#7aaa4a';
  p.rect(6, 5, 3, 12, g);
  p.rect(7, 5, 1, 12, gl);
  const armY = v ? 8 : 10;
  p.rect(3, armY, 3, 2, g);
  p.rect(3, armY - 3, 2, 3, g);
  p.rect(9, armY + 1, 2, 2, g);
  p.rect(10, armY - 2, 2, 3, g);
  if (v) p.set(7, 4, '#e86a8a');
};

const willow: Drawer = (p, season) => {
  const leaf = season === Season.AUTUMN ? '#9a9a3a' : season === Season.WINTER ? '#6a7a5a' : '#6a8a3a';
  p.rect(6, 9, 2, 8, TRUNK_DARK);
  p.ellipse(7, 5, 5.5, 3.6, shade(leaf, 0.85));
  p.ellipse(7, 4.5, 4.2, 2.6, leaf);
  // Ramas que cuelgan.
  for (const x of [2, 4, 9, 11]) p.rect(x, 7, 1, 5 + (x % 3), shade(leaf, 0.75));
  if (season === Season.WINTER) p.rect(4, 1, 6, 1, SNOW);
};

const palm: Drawer = (p, _s, v) => {
  const frond = '#2e9a3c';
  const dark = '#1f6a2a';
  for (let y = 6; y < 17; y++) p.set(6 + (y < 10 ? (v ? 1 : 0) : 0), y, y % 2 ? TRUNK : TRUNK_DARK);
  p.rect(2, 4, 10, 2, frond);
  p.rect(1, 6, 3, 1, dark);
  p.rect(10, 6, 3, 1, dark);
  p.rect(4, 2, 6, 2, frond);
  p.rect(5, 1, 2, 1, dark);
  p.set(6, 6, '#8a5a2a');
  p.set(8, 6, '#8a5a2a');
};

const acacia: Drawer = (p, season) => {
  const leaf = season === Season.AUTUMN || season === Season.WINTER ? '#a89a3a' : '#7d8a35';
  p.rect(6, 8, 2, 9, TRUNK);
  p.set(5, 8, TRUNK);
  p.set(8, 7, TRUNK);
  p.rect(1, 5, 12, 2, shade(leaf, 0.8));
  p.rect(2, 4, 10, 1, leaf);
  p.rect(4, 3, 6, 1, shade(leaf, 1.15));
};

/** Árbol de la arboleda mágica: copa turquesa con luces. */
const groveTree: Drawer = (p, _s, v) => {
  const leaf = '#2f8d99';
  p.rect(6, 11, 2, 6, '#5a4a6a');
  p.ellipse(7, 6, 5, 4.6, shade(leaf, 0.75));
  p.ellipse(6.6, 5.4, 4, 3.6, leaf);
  for (const [x, y] of v ? [[4, 4], [9, 6], [6, 8], [8, 2]] : [[5, 3], [9, 4], [4, 7], [8, 8]]) p.set(x, y, '#f6f2a0');
};

/** Árbol muerto del yermo maldito. */
const deadTree: Drawer = (p, _s, v) => {
  const wood = '#4a3a4a';
  p.rect(6, 7, 2, 10, wood);
  p.set(5, 6, wood);
  p.set(4, 5, wood);
  p.set(3, 4 + v, wood);
  p.set(8, 6, wood);
  p.set(9, 5, wood);
  p.set(10, 4, wood);
  p.set(10, 3 - v, wood);
  p.set(7, 5, wood);
  p.set(7, 4, wood);
};

const sapling: Drawer = (p, season) => {
  const leaf = season === Season.AUTUMN ? '#c8942a' : '#79c74f';
  p.rect(7, 13, 1, 4, '#4f7a2a');
  p.set(6, 12, leaf);
  p.set(5, 12, leaf);
  p.set(8, 11, leaf);
  p.set(9, 11, leaf);
  p.set(7, 12, leaf);
};

function bush(berries: boolean): Drawer {
  return (p, season, v) => {
    const leaf = season === Season.AUTUMN ? '#8a8a3a' : '#4c8a34';
    p.ellipse(7, 13.5, 4.5 + v * 0.5, 3, shade(leaf, 0.8));
    p.ellipse(6.6, 13, 3.6, 2.2, leaf);
    if (berries) for (const [x, y] of [[5, 12], [8, 13], [6, 15], [9, 11], [4, 14]]) p.set(x + v, y, '#d2405e');
    if (season === Season.WINTER) p.rect(4, 11, 6, 1, SNOW);
  };
}

function rock(vein: string | null, sparkle: string | null): Drawer {
  return (p, season, v) => {
    const g = '#8a8680';
    p.ellipse(7, 13.5, 5 - v * 0.5, 3.2, shade(g, 0.78));
    p.ellipse(6.4, 12.8, 3.8 - v * 0.5, 2.4, g);
    p.rect(5, 11, 3, 1, shade(g, 1.2));
    if (vein) for (const [x, y] of [[4, 13], [5, 14], [8, 12], [9, 14], [7, 15]]) p.set(x, y, vein);
    if (sparkle) for (const [x, y] of [[5, 12], [9, 13], [7, 14]]) p.set(x, y, sparkle);
    if (season === Season.WINTER) p.rect(5, 10, 4, 1, SNOW);
  };
}

/** Decoración del suelo (no es una planta de la simulación: sólo adorna el mapa). */
export const Decor = { TUFT: 100, FLOWERS: 101, PEBBLES: 102, REEDS: 103 } as const;

const tuft: Drawer = (p, season, v) => {
  const g = season === Season.AUTUMN ? '#9a8a3a' : season === Season.WINTER ? '#c8d4cc' : '#4f9a35';
  const light = shade(g, 1.2);
  const x = 5 + v * 2;
  p.set(x, 15, g);
  p.set(x + 1, 14, light);
  p.set(x + 2, 15, g);
  p.set(x + 1, 16, g);
  p.set(x + 3, 16, g);
};

const flowers: Drawer = (p, season, v) => {
  if (season === Season.WINTER) return;
  const petal = season === Season.AUTUMN ? '#e8a33d' : v ? '#f4b6c8' : '#f2e27a';
  for (const [x, y] of v ? [[4, 14], [8, 15], [6, 16]] : [[5, 15], [9, 14], [7, 16]]) {
    p.set(x, y, petal);
    p.set(x, y + 1, '#4f8a2a');
  }
};

const pebbles: Drawer = (p, _s, v) => {
  p.set(5 + v, 15, '#a8a090');
  p.set(6 + v, 15, '#8a8478');
  p.set(9 - v, 16, '#a8a090');
};

const reeds: Drawer = (p, season) => {
  const g = season === Season.AUTUMN || season === Season.WINTER ? '#9a8a4a' : '#5a7a3a';
  for (const x of [5, 7, 9]) p.rect(x, 12 + (x % 3), 1, 5 - (x % 3), g);
  p.rect(7, 11, 1, 2, '#6a4a2a');
};

/** Árbol de cada bioma (índice = Biome). */
const TREES: readonly Drawer[] = [
  deciduous('#3f8a32'),
  deciduous('#2f6f2a'),
  cactus,
  conifer,
  willow,
  palm,
  acacia,
  groveTree,
  deadTree,
];
const OTHER: Readonly<Record<number, Drawer>> = {
  [Flora.SAPLING]: sapling,
  [Flora.BUSH]: bush(false),
  [Flora.BERRY_BUSH]: bush(true),
  [Flora.ROCK]: rock(null, null),
  [Flora.IRON]: rock('#b8642e', null),
  [Flora.GOLD]: rock(null, '#ffd54a'),
  [Decor.TUFT]: tuft,
  [Decor.FLOWERS]: flowers,
  [Decor.PEBBLES]: pebbles,
  [Decor.REEDS]: reeds,
};
const OTHER_ROWS: readonly number[] = [Flora.SAPLING, Flora.BUSH, Flora.BERRY_BUSH, Flora.ROCK, Flora.IRON, Flora.GOLD, Decor.TUFT, Decor.FLOWERS, Decor.PEBBLES, Decor.REEDS];

function paintFlat(ctx: CanvasRenderingContext2D, p: Pix, ox: number, oy: number): void {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = p.get(x, y);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

export interface FloraAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Celda del dibujo de una planta o mineral (null si no tiene). */
  cell(flora: number, biome: number, season: number, variant: number): { sx: number; sy: number } | null;
}

export function buildFloraAtlas(): FloraAtlas {
  const rows = TREES.length + OTHER_ROWS.length;
  const canvas = document.createElement('canvas');
  canvas.width = FLORA_W * SEASONS * VARIANTS;
  canvas.height = FLORA_H * rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  const drawers = [...TREES, ...OTHER_ROWS.map((f) => OTHER[f])];
  drawers.forEach((draw, row) => {
    for (let season = 0; season < SEASONS; season++) {
      for (let v = 0; v < VARIANTS; v++) {
        const p = new Pix(FLORA_W, FLORA_H);
        draw(p, season, v);
        // La decoración del suelo va sin contorno (es un detalle, no un objeto).
        if (row >= TREES.length + 6) paintFlat(ctx, p, (season * VARIANTS + v) * FLORA_W, row * FLORA_H);
        else p.paint(ctx, (season * VARIANTS + v) * FLORA_W, row * FLORA_H, false, mix('#1a1410', '#2a2418', 0.3));
      }
    }
  });
  return {
    canvas,
    cell(flora, biome, season, variant) {
      let row: number;
      if (flora === Flora.TREE) row = biome < TREES.length ? biome : Biome.GRASS;
      else {
        const k = OTHER_ROWS.indexOf(flora);
        if (k < 0) return null;
        row = TREES.length + k;
      }
      return { sx: (season * VARIANTS + (variant & 1)) * FLORA_W, sy: row * FLORA_H };
    },
  };
}
