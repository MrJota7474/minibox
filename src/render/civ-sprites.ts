import { BuildingType } from '../civ/model';
import { Species } from '../entities/species';
import { drawPixelArt } from './sprites';

/** Pixel art original de los edificios (4 px por casilla). */
export const BUILDING_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  hall1: [
    '............',
    '............',
    '............',
    '....s..s....',
    '.....ff.....',
    '....fyff....',
    '...fyyyff...',
    '...ffyyff...',
    '..sbbbbbbs..',
    '...ssssss...',
    '............',
    '............',
  ],
  hall2: [
    '.....aa.....',
    '.....rr.....',
    '....rrrr....',
    '...rrrrrr...',
    '..rrrrrrrr..',
    '.rrrrrrrrrr.',
    'rrrrrrrrrrrr',
    '.wwwwwwwwww.',
    '.wkkwwwwkkw.',
    '.wwwwddwwww.',
    '.wwwwddwwww.',
    '.wwwwddwwww.',
  ],
  hall3: [
    'a....aa....a',
    'ss...rr...ss',
    'ss..rrrr..ss',
    'ss.rrrrrr.ss',
    'ssrrrrrrrrss',
    'ssssssssssss',
    'ssksssssskss',
    'ssssssssssss',
    'sssssddsssss',
    'sssssddsssss',
    'sssssddsssss',
    'ssssssssssss',
  ],
  house1: ['...rr...', '..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.wwwwww.', '.wwddww.', '.wwddww.', '.wwddww.'],
  house2: ['..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.wwwwww.', '.wkwwkw.', '.wwwwww.', '.wwddww.', '.wwddww.'],
  house3: ['s..rr...', 's.rrrr..', '.rrrrrr.', 'rrrrrrrr', '.wkwwkw.', '.wwwwww.', '.wkddkw.', '.wwddww.'],
  storage: ['..rrrr..', '.rrrrrr.', 'rrrrrrrr', 'pppppppp', 'ppddddpp', 'ppddddpp', 'ppddddpp', 'pppppppp'],
  dock: ['.rrr..a.', 'rrrrr.a.', '.wdw..d.', '.wdw..d.', 'pppppppp', 'pdppdppd', 'pppppppp', 'd..d..d.'],
};

const VARIANTS = ['hall1', 'hall2', 'hall3', 'house1', 'house2', 'house3', 'storage', 'dock'] as const;
type Variant = (typeof VARIANTS)[number];

const FIRE = { f: '#e86a2a', y: '#f5d04a', b: '#6a4a2a' };

/** Paleta de edificios por raza (tejado, pared, puerta, ventana, piedra, tablones, acento). */
const RACE_PALETTES: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  [Species.HUMAN]: { r: '#b5432f', w: '#e3d2a8', d: '#5a3a22', k: '#f2d16b', s: '#9a9a9a', p: '#8a5a2a', a: '#e8a33d', ...FIRE },
  [Species.SILVAN]: { r: '#3f8a3a', w: '#c9b07a', d: '#4a3a22', k: '#cfe87a', s: '#8aa08a', p: '#7a6a3a', a: '#e8e0a0', ...FIRE },
  [Species.PETRINO]: { r: '#5a5a66', w: '#a8a39a', d: '#3a2a1a', k: '#f2a03d', s: '#7a7a80', p: '#6a5a4a', a: '#d2405e', ...FIRE },
  [Species.TUSKER]: { r: '#7a5030', w: '#8a6a44', d: '#2a1a0a', k: '#e86a2a', s: '#6a5a4a', p: '#5a3a1a', a: '#e8e0c0', ...FIRE },
};

const RACES = [Species.HUMAN, Species.SILVAN, Species.PETRINO, Species.TUSKER];
const CELL = 14;

export interface BuildingAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Rectángulo (con contorno) de un edificio de una raza en el atlas, o null. */
  rect(race: number, type: number, level: number): { sx: number; sy: number; w: number; h: number } | null;
}

function variantFor(type: number, level: number): Variant | null {
  const l = Math.max(1, level);
  if (type === BuildingType.HALL) return (`hall${Math.min(3, l)}` as Variant);
  if (type === BuildingType.HOUSE) return (`house${Math.min(3, l)}` as Variant);
  if (type === BuildingType.STORAGE) return 'storage';
  if (type === BuildingType.DOCK) return 'dock';
  return null;
}

export function buildBuildingAtlas(): BuildingAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * VARIANTS.length;
  canvas.height = CELL * RACES.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  RACES.forEach((race, r) => {
    VARIANTS.forEach((name, c) => drawPixelArt(ctx, BUILDING_TEMPLATES[name], RACE_PALETTES[race], c * CELL, r * CELL));
  });
  return {
    canvas,
    rect(race, type, level) {
      const variant = variantFor(type, level);
      const r = RACES.indexOf(race as (typeof RACES)[number]);
      if (!variant || r < 0) return null;
      const t = BUILDING_TEMPLATES[variant];
      return { sx: VARIANTS.indexOf(variant) * CELL, sy: r * CELL, w: t[0].length + 2, h: t.length + 2 };
    },
  };
}
