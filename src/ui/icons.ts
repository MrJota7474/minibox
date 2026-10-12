import { Biome, Terrain } from '../world/terrain';
import { biomeSwatch, terrainSwatch, type Rgb } from '../render/palette';
import { spriteToDataUrl, type SpriteAtlas } from '../render/sprites';
import type { BrushToolId } from '../sim/commands';
import type { ToolDef } from '../powers/tools';

/** Iconos pixelados originales (cuadrículas de 10×10) generados por código. */
const ICON_COLORS: Readonly<Record<string, string>> = {
  o: '#f3e6c8',
  w: '#ffffff',
  b: '#b07a43',
  g: '#4f9a35',
  G: '#2f6b25',
  d: '#8b6b3f',
  t: '#7a4f2a',
  r: '#d2405e',
  s: '#a9b1b9',
  y: '#e8c34a',
  a: '#e8a33d',
  k: '#1a1410',
};

const GRIDS: Readonly<Record<string, readonly string[]>> = {
  inspect: ['..oooo....', '.o....o...', 'o..ww..o..', 'o.w....o..', 'o......o..', '.o....o...', '..oooobb..', '.......bb.', '........bb', '.........b'],
  move: ['....o.....', '...ooo....', '....o.....', '.o..o..o..', 'ooooooooo.', '.o..o..o..', '....o.....', '...ooo....', '....o.....', '..........'],
  raise: ['....aa....', '...aaaa...', '..aaaaaa..', '....aa....', '....aa....', '..........', 'gggggggggg', 'dddddddddd', 'dddddddddd', '..........'],
  lower: ['....aa....', '....aa....', '..aaaaaa..', '...aaaa...', '....aa....', '..........', 'gggggggggg', 'dddddddddd', 'dddddddddd', '..........'],
  sponge: ['..........', '.yyyyyyyy.', '.yy.yyyyy.', '.yyyyy.yy.', '.y.yyyyyy.', '.yyyy.yyy.', '.yyyyyyy..', '.yy.yyyyy.', '.yyyyyyyy.', '..........'],
  tree: ['...ggg....', '..ggggg...', '.ggGgggg..', '.gggggGg..', '..gGggg...', '...ggg....', '....t.....', '....t.....', '...ttt....', '..........'],
  bush: ['..........', '..........', '...ggg....', '..grgggg..', '.ggggrgg..', '.grggggg..', '.gggggrg..', '..ggggg...', '..........', '..........'],
  axe: ['..ss......', '.ssss.....', '.sssst....', '..ss.t....', '.....t....', '......t...', '......t...', '.......t..', '.......t..', '..........'],
  pause: ['..........', '.oo...oo..', '.oo...oo..', '.oo...oo..', '.oo...oo..', '.oo...oo..', '.oo...oo..', '.oo...oo..', '..........', '..........'],
  menu: ['..........', '.oooooooo.', '.oooooooo.', '..........', '.oooooooo.', '.oooooooo.', '..........', '.oooooooo.', '.oooooooo.', '..........'],
  fullscreen: ['ooo....ooo', 'o........o', 'o........o', '..........', '..........', '..........', '..........', 'o........o', 'o........o', 'ooo....ooo'],
  close: ['..........', '.o......o.', '..o....o..', '...o..o...', '....oo....', '....oo....', '...o..o...', '..o....o..', '.o......o.', '..........'],
  follow: ['....o.....', '...ooo....', '..o.o.o...', '....o.....', 'ooo.a.ooo.', '....o.....', '..o.o.o...', '...ooo....', '....o.....', '..........'],
  house: ['....aa....', '...aaaa...', '..aaaaaa..', '.aaaaaaaa.', 'aaaaaaaaaa', '.oooooooo.', '.oobbbooo.', '.oobbbooo.', '.oobbbooo.', '..........'],
  chevron: ['..........', '..........', '.o......o.', '..o....o..', '...o..o...', '....oo....', '..........', '..........', '..........', '..........'],
};

const ICON_SCALE = 3;
const cache = new Map<string, string>();

function render(size: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas');
  c.width = size * ICON_SCALE;
  c.height = size * ICON_SCALE;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(ICON_SCALE, ICON_SCALE);
  paint(ctx);
  return c.toDataURL();
}

export function gridIcon(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const grid = GRIDS[name];
  const url = render(10, (ctx) => {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const ch = grid[y][x];
        if (ch === '.') continue;
        ctx.fillStyle = ICON_COLORS[ch] ?? '#fff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  cache.set(name, url);
  return url;
}

function rgbCss(c: Rgb, jitter: number): string {
  return `rgb(${c[0] + jitter},${c[1] + jitter},${c[2] + jitter})`;
}

/** Muestra de terreno/bioma con textura de ruido. */
function swatchIcon(key: string, color: Rgb): string {
  const cached = cache.get(key);
  if (cached) return cached;
  const url = render(10, (ctx) => {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const j = (((x * 7 + y * 13) ^ (x * y)) % 5) * 4 - 8;
        ctx.fillStyle = rgbCss(color, j);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 9, 10, 1);
    ctx.fillRect(9, 0, 1, 10);
  });
  cache.set(key, url);
  return url;
}

const TERRAIN_FOR_BRUSH: Partial<Record<BrushToolId, number>> = {
  deep: Terrain.DEEP,
  ocean: Terrain.OCEAN,
  water: Terrain.SHALLOW,
  sand: Terrain.SAND,
  soil: Terrain.SOIL_LOW,
  hills: Terrain.HILLS,
  mountain: Terrain.MOUNTAIN,
};
const BIOME_FOR_BRUSH: Partial<Record<BrushToolId, number>> = {
  grass: Biome.GRASS,
  forest: Biome.FOREST,
  desert: Biome.DESERT,
};
const GRID_FOR_BRUSH: Partial<Record<BrushToolId, string>> = {
  raise: 'raise',
  lower: 'lower',
  sponge: 'sponge',
  tree: 'tree',
  bush: 'bush',
  'clear-flora': 'axe',
};

export function toolIcon(tool: ToolDef, atlas: SpriteAtlas): string {
  if (tool.kind === 'spawn') {
    const key = `species-${tool.species}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const url = spriteToDataUrl(atlas, tool.species, 4);
    cache.set(key, url);
    return url;
  }
  const terrain = TERRAIN_FOR_BRUSH[tool.brush];
  if (terrain !== undefined) {
    const base = terrainSwatch(terrain);
    return swatchIcon(`terrain-${terrain}`, terrain === Terrain.SOIL_LOW ? biomeSwatch(Biome.GRASS) : base);
  }
  const biome = BIOME_FOR_BRUSH[tool.brush];
  if (biome !== undefined) return swatchIcon(`biome-${biome}`, biomeSwatch(biome));
  return gridIcon(GRID_FOR_BRUSH[tool.brush] ?? 'close');
}

export function speciesIcon(species: number, atlas: SpriteAtlas): string {
  const key = `species-${species}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const url = spriteToDataUrl(atlas, species, 4);
  cache.set(key, url);
  return url;
}
