import { buildFloraAtlas, FLORA_H, FLORA_W, type FloraAtlas } from '../render/flora-art';
import { Pix, shade } from '../render/pixel';
import { Season } from '../world/climate';
import { Biome, Flora, Terrain } from '../world/terrain';

/**
 * Iconos de 16×16 del menú de herramientas: bloques de terreno con textura, biomas con su
 * árbol (el mismo que se ve en el mapa) y desastres y poderes dibujados con sombreado.
 */
export const TOOL_ICON_SIZE = 16;
const SCALE = 2;

const TERRAIN_LOOK: Readonly<Record<number, { top: string; side: string; detail?: string }>> = {
  [Terrain.DEEP]: { top: '#1f3a6a', side: '#122448', detail: '#2c5290' },
  [Terrain.OCEAN]: { top: '#2a5ea8', side: '#1a3e78', detail: '#4a80c8' },
  [Terrain.SHALLOW]: { top: '#4a8ad0', side: '#2e66a8', detail: '#8ac0f0' },
  [Terrain.SAND]: { top: '#e4cf8c', side: '#b89e5a', detail: '#f4e4b0' },
  [Terrain.SOIL_LOW]: { top: '#62ab3b', side: '#7b5d38', detail: '#7cc84a' },
  [Terrain.HILLS]: { top: '#8a8a5a', side: '#6a5a3a', detail: '#a8a070' },
  [Terrain.MOUNTAIN]: { top: '#8a847a', side: '#5a554e', detail: '#eef1f3' },
};

const BIOME_GROUND: Readonly<Record<number, string>> = {
  [Biome.GRASS]: '#62ab3b',
  [Biome.FOREST]: '#3e7f2d',
  [Biome.DESERT]: '#d8b56c',
  [Biome.SNOW]: '#dfe8ea',
  [Biome.SWAMP]: '#56703c',
  [Biome.JUNGLE]: '#2e9a3c',
  [Biome.SAVANNA]: '#b9aa4c',
  [Biome.GROVE]: '#4fc7a6',
  [Biome.BLIGHT]: '#5e3f63',
};

/** Bloque de terreno (cara superior con textura y frente más oscuro). */
function block(p: Pix, top: string, side: string, detail?: string): void {
  p.rect(1, 7, 14, 6, top);
  p.rect(1, 13, 14, 2, side);
  p.rect(1, 7, 14, 1, shade(top, 1.12));
  if (!detail) return;
  for (const [x, y] of [[3, 9], [7, 11], [11, 8], [5, 12], [12, 11], [9, 9]]) p.set(x, y, detail);
}

function arrow(p: Pix, up: boolean): void {
  const c = '#f2c14e';
  p.rect(7, up ? 3 : 1, 2, 4, c);
  for (let k = 0; k < 3; k++) {
    const y = up ? 1 + k : 6 - k;
    p.rect(7 - k, y, 2 + k * 2, 1, c);
  }
}

const POWER_DRAW: Readonly<Record<string, (p: Pix) => void>> = {
  lightning: (p) => {
    p.ellipse(8, 3, 6, 2.2, '#8a8e98');
    p.ellipse(6, 3, 3, 1.6, '#a8acb4');
    const bolt = [[9, 5], [8, 6], [7, 7], [8, 8], [9, 8], [8, 9], [7, 10], [6, 11], [6, 12], [5, 13], [5, 14]];
    for (const [x, y] of bolt) {
      p.set(x, y, '#ffd04a');
      p.set(x + 1, y, '#fff6c0');
    }
  },
  meteor: (p) => {
    for (let k = 0; k < 8; k++) p.rect(7 + k, 7 - k, 2, 2, k < 3 ? '#ffd04a' : k < 6 ? '#ff8a2a' : '#e84a1a');
    p.ellipse(5, 11, 3.6, 3.4, '#8a5a3a');
    p.ellipse(4.5, 10.5, 2.4, 2.2, '#b0784a');
    p.set(3, 10, '#d8a070');
    p.set(6, 12, '#5a3a22');
  },
  bomb: (p) => {
    p.ellipse(7, 10, 5, 4.6, '#2a2630');
    p.ellipse(6, 9, 3, 2.6, '#3e3a46');
    p.set(5, 7, '#8a8698');
    p.rect(10, 4, 2, 2, '#5a5a62');
    p.set(12, 3, '#8a5a2a');
    p.set(13, 2, '#8a5a2a');
    p.set(14, 1, '#ffd04a');
    p.set(13, 1, '#ff8a2a');
    p.set(14, 2, '#ff8a2a');
  },
  earthquake: (p) => {
    block(p, '#62ab3b', '#7b5d38');
    for (const [x, y] of [[7, 7], [8, 8], [7, 9], [8, 10], [9, 11], [8, 12], [8, 13], [9, 14]]) p.set(x, y, '#2a1d14');
    p.rect(2, 4, 2, 2, '#8a6a4a');
    p.rect(12, 3, 2, 2, '#8a6a4a');
    p.set(6, 2, '#8a6a4a');
  },
  tornado: (p) => {
    const rows = [[2, 13], [3, 11], [4, 9], [5, 7], [6, 5], [6, 4], [7, 3], [7, 2]];
    rows.forEach(([x, w], k) => p.rect(x, 2 + Math.round(k * 1.6), w, 2, k % 2 ? '#8a8e98' : '#b8bcc4'));
    p.rect(6, 14, 4, 1, '#6a5a4a');
  },
  'acid-rain': (p) => {
    p.ellipse(8, 4, 7, 3, '#4a5a3e');
    p.ellipse(6, 3, 4, 2, '#5e7050');
    for (const [x, y] of [[3, 9], [7, 10], [11, 9], [5, 13], [9, 14], [13, 12]]) {
      p.set(x, y, '#9be04a');
      p.set(x, y + 1, '#6aa82a');
    }
  },
  volcano: (p) => {
    for (let k = 0; k < 9; k++) p.rect(Math.round(1 + k * 0.8), 14 - k, Math.round(14 - k * 1.6), 1, k % 2 ? '#6a5a4a' : '#5a4a3e');
    p.rect(6, 6, 4, 2, '#ff8a2a');
    p.rect(7, 5, 2, 1, '#ffd04a');
    p.rect(7, 8, 1, 4, '#e84a1a');
    p.rect(9, 9, 1, 3, '#e84a1a');
    p.ellipse(8, 2, 3, 1.5, '#8a8a8a');
  },
  fire: (p) => {
    p.ellipse(8, 10, 5, 4.6, '#e84a1a');
    p.rect(6, 4, 4, 5, '#e84a1a');
    p.rect(7, 2, 2, 2, '#e84a1a');
    p.ellipse(8, 11, 3.4, 3, '#ff8a2a');
    p.rect(7, 6, 2, 3, '#ff8a2a');
    p.ellipse(8, 12, 1.8, 1.8, '#ffd04a');
    p.set(4, 5, '#ff8a2a');
    p.set(12, 6, '#ff8a2a');
  },
  lava: (p) => {
    block(p, '#e84a1a', '#7a2a12');
    p.ellipse(6, 9, 2.4, 1.4, '#ff9a2a');
    p.ellipse(11, 11, 2, 1.2, '#ffd04a');
    p.set(9, 8, '#ffd04a');
    p.set(4, 4, '#ff8a2a');
    p.set(11, 5, '#ffd04a');
  },
  plague: (p) => {
    p.ellipse(8, 7, 5, 4.6, '#8be04a');
    p.rect(5, 11, 6, 3, '#8be04a');
    p.rect(5, 6, 2, 3, '#2a3a1a');
    p.rect(9, 6, 2, 3, '#2a3a1a');
    p.set(8, 9, '#2a3a1a');
    p.rect(6, 12, 1, 2, '#5aa82a');
    p.rect(9, 12, 1, 2, '#5aa82a');
    p.set(2, 3, '#c8f08a');
    p.set(13, 2, '#c8f08a');
  },
  bless: (p) => {
    p.rect(4, 2, 8, 1, '#ffd04a');
    p.set(3, 3, '#ffd04a');
    p.set(12, 3, '#ffd04a');
    for (const [x, y] of [[8, 5], [8, 6], [8, 7], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [8, 9], [8, 10], [8, 11], [8, 12]]) p.set(x, y, '#fff2a0');
    p.set(4, 12, '#ffd04a');
    p.set(12, 11, '#ffd04a');
    p.set(3, 6, '#fff6c0');
  },
  curse: (p) => {
    p.ellipse(8, 7, 5, 4.6, '#a35ce8');
    p.rect(5, 11, 6, 3, '#a35ce8');
    p.rect(5, 6, 2, 2, '#1a1410');
    p.rect(9, 6, 2, 2, '#1a1410');
    p.rect(6, 12, 1, 2, '#6a2aa8');
    p.rect(9, 12, 1, 2, '#6a2aa8');
    p.set(2, 2, '#d090ff');
    p.set(13, 4, '#d090ff');
  },
  madness: (p) => {
    const spiral = [[8, 8], [9, 8], [9, 7], [8, 6], [7, 6], [6, 7], [6, 8], [6, 9], [7, 10], [8, 10], [9, 10], [10, 9], [11, 8], [11, 7], [11, 6], [10, 5], [9, 4], [8, 4], [7, 4], [6, 4], [5, 5], [4, 6], [4, 7], [4, 8], [4, 9], [5, 11], [6, 12], [7, 12]];
    for (const [x, y] of spiral) p.set(x, y, '#ff3a3a');
    p.set(13, 12, '#ff8a8a');
    p.set(2, 2, '#ff8a8a');
  },
  heal: (p) => {
    p.rect(6, 3, 4, 10, '#ffffff');
    p.rect(3, 6, 10, 4, '#ffffff');
    p.rect(7, 4, 2, 8, '#9be38a');
    p.rect(4, 7, 8, 2, '#9be38a');
    p.set(2, 2, '#c8f0ff');
    p.set(13, 13, '#c8f0ff');
  },
};

const BRUSH_DRAW: Readonly<Record<string, (p: Pix) => void>> = {
  raise: (p) => {
    block(p, '#62ab3b', '#7b5d38', '#7cc84a');
    arrow(p, true);
  },
  lower: (p) => {
    block(p, '#4a8ad0', '#2e66a8', '#8ac0f0');
    arrow(p, false);
  },
  sponge: (p) => {
    p.rect(2, 4, 12, 9, '#e8c34a');
    p.rect(2, 11, 12, 2, '#b8932a');
    for (const [x, y] of [[4, 6], [8, 5], [11, 7], [6, 9], [10, 10], [4, 10]]) p.set(x, y, '#a8832a');
    p.set(13, 2, '#8ac0f0');
    p.set(14, 3, '#8ac0f0');
  },
  road: (p) => {
    block(p, '#62ab3b', '#7b5d38', '#7cc84a');
    // Calzada que cruza el bloque en diagonal.
    for (let k = 0; k < 6; k++) p.rect(2 + k * 2, 12 - k, 3, 1, k % 2 ? '#b0a898' : '#989080');
    p.set(5, 10, '#6e675c');
    p.set(10, 8, '#6e675c');
  },
  bridge: (p) => {
    block(p, '#4a8ad0', '#2e66a8', '#8ac0f0');
    // Tablones sobre el agua, con sus pilotes.
    p.rect(1, 8, 14, 3, '#a8784a');
    for (let x = 2; x < 15; x += 3) p.rect(x, 8, 1, 3, '#7a5430');
    p.rect(1, 7, 14, 1, '#c89a64');
    p.rect(3, 11, 1, 3, '#5a3e22');
    p.rect(12, 11, 1, 3, '#5a3e22');
  },
  'clear-flora': (p) => {
    for (let k = 0; k < 10; k++) p.set(4 + k, 4 + k, '#8a5a2a');
    for (let k = 0; k < 10; k++) p.set(5 + k, 4 + k, '#6a4422');
    p.rect(2, 2, 5, 3, '#a9b1b9');
    p.rect(2, 5, 3, 2, '#a9b1b9');
    p.set(3, 3, '#e2e8ee');
  },
};

let flora: FloraAtlas | null = null;

/** Árbol, arbusto o roca de la vegetación del mapa sobre un bloque. */
function floraOnBlock(ctx: CanvasRenderingContext2D, ground: string, kind: number, biome: number): void {
  const p = new Pix(TOOL_ICON_SIZE, TOOL_ICON_SIZE);
  block(p, ground, shade(ground, 0.65));
  p.paint(ctx, 0, 0);
  flora ??= buildFloraAtlas();
  const cell = flora.cell(kind, biome, Season.SUMMER, 0);
  // La copa entera a la vista; el pie del tronco queda sobre el bloque.
  if (cell) ctx.drawImage(flora.canvas, cell.sx, cell.sy, FLORA_W, FLORA_H, 1, -2, FLORA_W, FLORA_H);
}

function render(paint: (ctx: CanvasRenderingContext2D) => void): string {
  const small = document.createElement('canvas');
  small.width = TOOL_ICON_SIZE;
  small.height = TOOL_ICON_SIZE;
  const big = document.createElement('canvas');
  big.width = TOOL_ICON_SIZE * SCALE;
  big.height = TOOL_ICON_SIZE * SCALE;
  const sctx = small.getContext('2d');
  const bctx = big.getContext('2d');
  if (!sctx || !bctx) return '';
  paint(sctx);
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, big.width, big.height);
  return big.toDataURL();
}

const cache = new Map<string, string>();

function cached(key: string, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = render(paint);
  cache.set(key, url);
  return url;
}

function pixIcon(draw: (p: Pix) => void): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    const p = new Pix(TOOL_ICON_SIZE, TOOL_ICON_SIZE);
    draw(p);
    p.paint(ctx, 0, 0);
  };
}

/** Icono de un poder o desastre, o null si no hay dibujo propio. */
export function powerIcon(power: string): string | null {
  const draw = POWER_DRAW[power];
  return draw ? cached(`power-${power}`, pixIcon(draw)) : null;
}

export function terrainIcon(terrain: number): string | null {
  const look = TERRAIN_LOOK[terrain];
  if (!look) return null;
  return cached(
    `terrain-${terrain}`,
    pixIcon((p) => {
      block(p, look.top, look.side, look.detail);
      if (terrain === Terrain.MOUNTAIN) {
        for (let k = 0; k < 6; k++) p.rect(3 + k, 7 - k, 10 - k * 2, 1, k > 3 ? '#eef1f3' : '#8a847a');
      } else if (terrain === Terrain.HILLS) {
        p.ellipse(8, 7, 6, 3, '#8a8a5a');
        p.ellipse(7, 6.5, 4, 2, '#a8a070');
      }
    }),
  );
}

export function biomeIcon(biome: number): string | null {
  const ground = BIOME_GROUND[biome];
  if (!ground) return null;
  return cached(`biome-${biome}`, (ctx) => floraOnBlock(ctx, ground, Flora.TREE, biome));
}

export function brushIcon(brush: string): string | null {
  if (brush === 'tree') return cached('brush-tree', (ctx) => floraOnBlock(ctx, BIOME_GROUND[Biome.GRASS], Flora.TREE, Biome.GRASS));
  if (brush === 'bush') return cached('brush-bush', (ctx) => floraOnBlock(ctx, BIOME_GROUND[Biome.GRASS], Flora.BERRY_BUSH, Biome.GRASS));
  const draw = BRUSH_DRAW[brush];
  return draw ? cached(`brush-${brush}`, pixIcon(draw)) : null;
}
