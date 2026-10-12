import { Species } from '../entities/species';

/**
 * Sprites originales de MiniBox definidos como cuadrículas de texto.
 * Se generan por código al arrancar, con un contorno oscuro de 1 px.
 */
type Template = readonly string[];

interface SpriteDef {
  frames: readonly [Template, Template];
  colors: Readonly<Record<string, string>>;
}

const OUTLINE = '#1a1410';

const SPRITES: Readonly<Record<number, SpriteDef>> = {
  [Species.SHEEP]: {
    frames: [
      ['.wwwww..', 'wwwwwwkk', 'wwwwwwke', 'wwwwww..', '.k...k..'],
      ['.wwwww..', 'wwwwwwkk', 'wwwwwwke', 'wwwwww..', '..k.k...'],
    ],
    colors: { w: '#f4f0e4', k: '#3b3231', e: '#f4f0e4' },
  },
  [Species.RABBIT]: {
    frames: [
      ['...b.b', '...bbb', '.bbbbe', 'bbbbb.', '.b..b.'],
      ['...b.b', '...bbb', '.bbbbe', 'bbbbb.', 'b...b.'],
    ],
    colors: { b: '#b8956a', e: '#2a1d14' },
  },
  [Species.WOLF]: {
    frames: [
      ['g.....g.g', '.gggggggg', '.ggggggge', '.gggggg..', '.g.g..g.g'],
      ['g.....g.g', '.gggggggg', '.ggggggge', '.gggggg..', '..g.g.g..'],
    ],
    colors: { g: '#8a929c', e: '#f2d14b' },
  },
};

export interface SpriteAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Tamaño de cada celda (incluye el contorno). */
  readonly cellW: number;
  readonly cellH: number;
  /** Tamaño real del sprite de cada especie (con contorno). */
  readonly sizes: readonly { w: number; h: number }[];
}

const SPECIES_COUNT = 3;
const FRAMES = 2;

/** Atlas: filas = especies; columnas = cuadro (0,1) × orientación (derecha, izquierda). */
export function buildSpriteAtlas(): SpriteAtlas {
  const sizes = Array.from({ length: SPECIES_COUNT }, (_, s) => {
    const t = SPRITES[s].frames[0];
    return { w: t[0].length + 2, h: t.length + 2 };
  });
  const cellW = Math.max(...sizes.map((s) => s.w));
  const cellH = Math.max(...sizes.map((s) => s.h));
  const canvas = document.createElement('canvas');
  canvas.width = cellW * FRAMES * 2;
  canvas.height = cellH * SPECIES_COUNT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  for (let s = 0; s < SPECIES_COUNT; s++) {
    for (let f = 0; f < FRAMES; f++) {
      for (let flip = 0; flip < 2; flip++) {
        drawTemplate(ctx, SPRITES[s], f, flip === 1, (f * 2 + flip) * cellW, s * cellH);
      }
    }
  }
  return { canvas, cellW, cellH, sizes };
}

function drawTemplate(ctx: CanvasRenderingContext2D, def: SpriteDef, frame: number, flip: boolean, ox: number, oy: number): void {
  const t = def.frames[frame];
  const h = t.length;
  const w = t[0].length;
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && t[y][x] !== '.';
  const px = (x: number): number => ox + 1 + (flip ? w - 1 - x : x);

  ctx.fillStyle = OUTLINE;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (filled(x, y)) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) {
        ctx.fillRect(px(x), oy + 1 + y, 1, 1);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = t[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = def.colors[ch] ?? OUTLINE;
      ctx.fillRect(px(x), oy + 1 + y, 1, 1);
    }
  }
}

/** Dibuja un sprite en un canvas independiente (para iconos de la interfaz). */
export function spriteToDataUrl(atlas: SpriteAtlas, species: number, scale: number): string {
  const size = atlas.sizes[species];
  const c = document.createElement('canvas');
  c.width = size.w * scale;
  c.height = size.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas.canvas, 0, species * atlas.cellH, size.w, size.h, 0, 0, c.width, c.height);
  return c.toDataURL();
}
