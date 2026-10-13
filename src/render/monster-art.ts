import { Species } from '../entities/species';
import type { Pix } from './pixel';

/**
 * Pixel art original de los monstruos de MiniBox, dibujado por código como el resto de
 * criaturas: el penante (alma en pena con sudario), el escorio (mole de basalto con
 * grietas de lava) y el cenagoso (montón de fango, musgo y raíces).
 */

/** Qué hace el monstruo en el cuadro: caminar, levantar el brazo o golpear. */
export const MonsterAction = { WALK: 0, RAISE: 1, STRIKE: 2 } as const;
export type MonsterActionId = (typeof MonsterAction)[keyof typeof MonsterAction];

/** Tamaño en pantalla respecto a un aldeano. */
export const MONSTER_SCALE: Readonly<Record<number, number>> = {
  [Species.PENANTE]: 1,
  [Species.ESCORIO]: 1.3,
  [Species.CENAGOSO]: 1.3,
};

interface Point {
  x: number;
  y: number;
}

/** Alma en pena: capucha, cara de hueso, brazos huesudos y un sudario hecho jirones que flota. */
function drawPenante(p: Pix, walk: number, action: MonsterActionId, g: number): Point {
  const shroud = '#6a5a8e';
  const shade = '#463a66';
  const light = '#8c7cb4';
  const bone = '#e6e0cc';
  const boneShade = '#b8b09a';
  const glow = '#9cf0c0';
  const wisp = '#a898d8';
  // Flota: sube y baja un píxel al moverse.
  const bob = walk === 1 || walk === 3 ? -1 : 0;
  const top = g - 15 + bob;

  // Sudario: se ensancha hacia abajo y acaba en jirones que ondean.
  for (let k = 0; k < 10; k++) {
    const half = 2 + Math.floor((k + 1) / 3);
    const y = top + 5 + k;
    p.rect(8 - half, y, half * 2 + 1, 1, shroud);
    p.set(8 - half, y, shade);
    p.set(8 - half + 1, y, shade);
    if (k > 2) p.set(8 + half - 1, y, light);
  }
  const hem = top + 15;
  for (let x = 3; x <= 13; x++) {
    if ((x + walk) % 2 === 0) p.set(x, hem, shade);
    if ((x + walk) % 4 === 0) p.set(x, hem + 1, shade);
  }
  // Jirones que deja atrás.
  p.set(3, top + 9, wisp);
  if (walk % 2 === 1) p.set(2, top + 11, wisp);
  else p.set(1, top + 7, wisp);

  // Capucha y cara de hueso, con las cuencas encendidas.
  p.ellipse(8.5, top + 3, 3.4, 3, shroud);
  p.rect(5, top + 2, 2, 4, shade);
  p.rect(8, top + 2, 4, 3, bone);
  p.rect(8, top + 5, 3, 1, boneShade);
  p.set(9, top + 3, '#1a1410');
  p.set(11, top + 3, glow);
  p.set(10, top + 5, '#1a1410');
  p.set(8, top, light);

  // Brazos huesudos.
  const sy = top + 7;
  if (action === MonsterAction.RAISE) {
    p.set(11, sy, shade);
    p.set(12, sy - 1, bone);
    p.set(13, sy - 2, bone);
    p.set(13, sy - 3, bone);
    p.set(14, sy - 4, boneShade);
    p.set(12, sy - 4, boneShade);
    return { x: 13, y: sy - 3 };
  }
  if (action === MonsterAction.STRIKE) {
    p.rect(11, sy, 2, 1, shade);
    p.rect(13, sy, 3, 1, bone);
    p.set(16, sy - 1, boneShade);
    p.set(16, sy + 1, boneShade);
    p.rect(12, sy + 2, 3, 1, bone);
    return { x: 16, y: sy };
  }
  const reach = walk === 1 ? 1 : 0;
  p.set(11, sy, shade);
  p.set(12, sy + 1, bone);
  p.set(13 + reach, sy + 1, bone);
  p.set(14 + reach, sy + 2, boneShade);
  p.set(12, sy + 3, bone);
  p.set(13, sy + 4, boneShade);
  return { x: 14 + reach, y: sy + 2 };
}

/** Mole de basalto con el corazón de lava: grietas incandescentes y puños como yunques. */
function drawEscorio(p: Pix, walk: number, action: MonsterActionId, g: number): Point {
  const rock = '#3d3638';
  const light = '#5c4f50';
  const dark = '#241f22';
  // Las grietas laten: en los pasos impares brillan más.
  const hot = walk % 2 === 1 || action === MonsterAction.STRIKE;
  const lava = hot ? '#ffb03a' : '#ff8a2a';
  const core = hot ? '#fff2a0' : '#ffd04a';
  const deep = '#e84a1a';
  const step = walk === 1 ? 1 : walk === 3 ? -1 : 0;

  // Piernas cortas y macizas.
  p.rect(4 - step, g - 3, 3, 4, dark);
  p.rect(10 + step, g - 3, 3, 4, rock);
  p.set(11 + step, g - 1, deep);
  // Brazo trasero.
  p.rect(1, g - 10, 3, 6, dark);
  p.rect(1, g - 4, 3, 2, rock);

  // Cuerpo.
  p.ellipse(8, g - 8, 5.6, 5.2, rock);
  p.ellipse(7, g - 11, 3.6, 1.8, light);
  p.rect(3, g - 5, 3, 2, dark);
  for (const [x, y] of [[5, g - 9], [6, g - 8], [6, g - 7], [7, g - 6], [8, g - 6], [9, g - 5], [10, g - 7], [11, g - 8], [9, g - 10], [10, g - 11]]) p.set(x, y, lava);
  p.rect(7, g - 9, 2, 2, core);
  p.set(8, g - 7, core);
  p.set(4, g - 7, deep);
  p.set(11, g - 6, deep);

  // Cabeza hundida entre los hombros, con ojos de ascua.
  p.rect(8, g - 15, 5, 4, rock);
  p.rect(8, g - 15, 5, 1, light);
  p.set(7, g - 13, dark);
  p.set(10, g - 13, core);
  p.set(12, g - 13, lava);
  p.rect(10, g - 12, 3, 1, deep);
  p.set(9, g - 16, dark);
  p.set(12, g - 16, dark);

  // Brazo delantero y puño.
  if (action === MonsterAction.RAISE) {
    p.rect(12, g - 15, 3, 6, light);
    p.rect(12, g - 18, 4, 3, rock);
    p.set(13, g - 17, lava);
    return { x: 14, y: g - 18 };
  }
  if (action === MonsterAction.STRIKE) {
    p.rect(11, g - 10, 4, 3, light);
    p.rect(14, g - 11, 4, 4, rock);
    p.set(16, g - 9, core);
    p.set(15, g - 10, lava);
    return { x: 17, y: g - 9 };
  }
  p.rect(12, g - 10, 3, 6, light);
  p.rect(12, g - 4, 4, 3, rock);
  p.set(14, g - 3, lava);
  return { x: 14, y: g - 3 };
}

/** Montón de fango con una capa de musgo, juncos en el lomo y brazos que arrastra. */
function drawCenagoso(p: Pix, walk: number, action: MonsterActionId, g: number): Point {
  const mud = '#6a6338';
  const mudDark = '#454226';
  const mudLight = '#8a8248';
  const moss = '#5f8a34';
  const mossLight = '#9bc24e';
  const root = '#7a5a32';
  const eye = '#f6d84a';
  const sway = walk === 1 ? 1 : walk === 3 ? -1 : 0;

  // Pies: dos pegotes que se alternan.
  p.rect(3 + sway, g - 1, 4, 2, mudDark);
  p.rect(10 - sway, g - 1, 4, 2, mudDark);
  // Brazo trasero.
  p.rect(0, g - 8, 2, 7, mudDark);
  p.set(0, g - 1, root);

  // Cuerpo: una cúpula de barro que gotea.
  p.ellipse(8, g - 7, 6.4, 6, mud);
  p.rect(2, g - 3, 13, 2, mudDark);
  p.ellipse(6, g - 8, 2.6, 2.2, mudLight);
  for (const x of [3, 6, 9, 12]) p.set(x + ((x + walk) % 2), g - 1, mud);
  // Musgo por encima y juncos en el lomo.
  p.ellipse(7.5, g - 12, 5, 2, moss);
  p.rect(3, g - 11, 2, 2, moss);
  for (const [x, y] of [[5, g - 13], [8, g - 13], [10, g - 12], [4, g - 10]]) p.set(x, y, mossLight);
  p.rect(4, g - 17, 1, 4, moss);
  p.set(4, g - 18, root);
  p.rect(7, g - 16, 1, 3, moss);
  p.set(7, g - 17, root);
  p.set(2, g - 14, moss);
  p.set(2, g - 15, mossLight);

  // Ojos amarillos bajo el musgo y una boca enorme.
  p.rect(9, g - 10, 5, 1, mudDark);
  p.set(10, g - 9, eye);
  p.set(13, g - 9, eye);
  if (action === MonsterAction.STRIKE) {
    p.rect(9, g - 7, 6, 4, '#1f1a12');
    for (const x of [9, 11, 13]) p.set(x, g - 7, '#ece4c8');
    for (const x of [10, 12, 14]) p.set(x, g - 4, '#ece4c8');
  } else {
    p.rect(9, g - 6, 5, 1, '#1f1a12');
    p.set(10, g - 5, '#ece4c8');
    p.set(13, g - 5, '#ece4c8');
  }

  // Brazo delantero, largo, con dedos de raíz.
  if (action === MonsterAction.RAISE) {
    p.rect(14, g - 15, 2, 7, mud);
    p.rect(14, g - 17, 3, 2, mudLight);
    p.set(13, g - 18, root);
    p.set(16, g - 18, root);
    return { x: 15, y: g - 17 };
  }
  if (action === MonsterAction.STRIKE) {
    p.rect(13, g - 11, 4, 2, mud);
    p.rect(15, g - 12, 3, 4, mudLight);
    p.set(17, g - 13, root);
    p.set(17, g - 8, root);
    return { x: 17, y: g - 10 };
  }
  p.rect(15, g - 8, 2, 7, mud);
  p.rect(15, g - 1, 3, 1, mudLight);
  p.set(17, g, root);
  p.set(15, g, root);
  return { x: 16, y: g - 1 };
}

/** Dibuja un monstruo en la celda; `ground` es la fila de los pies. Devuelve dónde queda su «mano». */
export function drawMonster(p: Pix, species: number, walk: number, action: MonsterActionId, ground: number): Point {
  if (species === Species.PENANTE) return drawPenante(p, walk, action, ground);
  if (species === Species.ESCORIO) return drawEscorio(p, walk, action, ground);
  return drawCenagoso(p, walk, action, ground);
}
