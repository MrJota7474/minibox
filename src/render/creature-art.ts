import { SPECIES, Species, isMonster } from '../entities/species';
import { VILLAGE_COLORS } from '../civ/model';
import { MonsterAction, drawMonster } from './monster-art';
import { Pix, shade } from './pixel';

/**
 * Pixel art original de las criaturas de MiniBox, compuesto por partes al arrancar:
 * cada raza tiene su silueta (altura, complexión, orejas, barba, colmillos, peinado),
 * la ropa lleva el color de su reino y hay 4 cuadros de caminar y 2 de acción
 * (levantar y golpear la herramienta; en los animales, comer o morder).
 */
export const CELL_W = 18;
export const CELL_H = 21;
/** Posturas: 0-3 caminar (0 = quieto), 4 = levantar, 5 = golpear. */
export const POSE_COUNT = 6;
export const Pose = { WALK0: 0, RAISE: 4, STRIKE: 5 } as const;
/** Colores de ropa: uno por color de reino y el último, neutro (sin reino). */
export const CLOTH_COUNT = VILLAGE_COLORS.length + 1;
const NEUTRAL_CLOTH = '#8a7a64';
const SPECIES_TOTAL = SPECIES.length;

// ---------- Razas ----------

interface RaceLook {
  skin: string;
  hair: string;
  eye: string;
  pants: string;
  shoes: string;
  /** Altura de cabeza, torso y piernas; anchura del torso. */
  head: number;
  torso: number;
  legs: number;
  width: number;
  ears: 'round' | 'pointy' | 'none';
  hairStyle: 'short' | 'long' | 'cap' | 'mohawk' | 'crest';
  /** Cola (color), que asoma por detrás. */
  tail?: string;
  beard?: string;
  tusks?: boolean;
}

const RACES: Readonly<Record<number, RaceLook>> = {
  [Species.HUMAN]: { skin: '#e8b48a', hair: '#5a3a22', eye: '#2a1d14', pants: '#4a3a2a', shoes: '#2e2018', head: 5, torso: 5, legs: 4, width: 5, ears: 'round', hairStyle: 'short' },
  [Species.SILVAN]: { skin: '#f0d6b4', hair: '#e8d070', eye: '#2f6b25', pants: '#2f5a2a', shoes: '#3a2a1a', head: 5, torso: 5, legs: 5, width: 4, ears: 'pointy', hairStyle: 'long' },
  [Species.PETRINO]: { skin: '#e0a878', hair: '#9a9aa2', eye: '#2a1d14', pants: '#5a4030', shoes: '#2e2018', head: 5, torso: 5, legs: 2, width: 7, ears: 'round', hairStyle: 'cap', beard: '#b0642a' },
  [Species.TUSKER]: { skin: '#7fa25a', hair: '#1f1a16', eye: '#d2405e', pants: '#5a3a1a', shoes: '#2a1a0a', head: 6, torso: 6, legs: 3, width: 7, ears: 'pointy', hairStyle: 'mohawk', tusks: true },
  [Species.SCALEFOLK]: { skin: '#4fa08a', hair: '#e0a040', eye: '#f2d850', pants: '#3a5a4a', shoes: '#2a3a2a', head: 5, torso: 5, legs: 4, width: 5, ears: 'none', hairStyle: 'crest', tail: '#3f8a72' },
};

/** Dónde queda la mano delantera en cada postura (para colocar la herramienta). */
export interface Hand {
  x: number;
  y: number;
}

function drawHumanoid(p: Pix, look: RaceLook, cloth: string, pose: number): Hand {
  const ground = CELL_H - 2;
  const cx = Math.floor(CELL_W / 2) - 1;
  const legTop = ground - look.legs;
  // Al dar la zancada (cuadros 1 y 3) el cuerpo baja un píxel: así se nota el paso.
  const bob = pose === 1 || pose === 3 ? 1 : 0;
  const torsoTop = legTop - look.torso + bob;
  const headTop = torsoTop - look.head;
  const half = Math.floor(look.width / 2);
  const left = cx - half;
  const skinShade = shade(look.skin, 0.8);
  const clothShade = shade(cloth, 0.72);
  // El brazo delantero, algo más claro, para que se lea sobre el torso.
  const armTone = shade(cloth, 1.25);
  const walk = pose < 4 ? pose : 0;
  const swing = [0, 1, 0, -1][walk];

  // Cola (escamados): baja por detrás y se balancea al andar.
  if (look.tail) {
    const sway = pose < 4 ? swing : 0;
    p.set(left - 1, legTop - 1, look.tail);
    p.set(left - 2, legTop, look.tail);
    p.set(left - 3 + sway, legTop + 1, look.tail);
    p.set(left - 4 + sway, legTop + 1, shade(look.tail, 0.8));
  }

  // Brazo trasero (más oscuro, detrás del cuerpo).
  const backArmX = left - (pose < 4 ? swing : 0);
  p.rect(backArmX, torsoTop + 1, 1, look.torso - 1, clothShade);
  p.set(backArmX, torsoTop + look.torso - 1, skinShade);

  // Piernas.
  const legFront = cx + 1;
  const legBack = cx - 1;
  const stride = pose >= 4 ? 1 : swing;
  for (let k = 0; k < look.legs; k++) {
    const y = legTop + k;
    const t = (k + 1) / look.legs;
    p.set(legBack - Math.round(stride * t), y, shade(look.pants, 0.8));
    p.set(legFront + Math.round(stride * t), y, look.pants);
  }
  p.set(legBack - stride, ground, look.shoes);
  p.set(legBack - stride - 1, ground, look.shoes);
  p.set(legFront + stride, ground, look.shoes);
  p.set(legFront + stride + 1, ground, look.shoes);

  // Torso con el color del reino, luz en los hombros, cinturón y sombra lateral.
  p.rect(left, torsoTop, look.width, look.torso, cloth);
  p.rect(left + 1, torsoTop, look.width - 2, 1, shade(cloth, 1.2));
  p.rect(left, torsoTop, 1, look.torso, clothShade);
  p.rect(left, torsoTop + look.torso - 2, look.width, 1, shade(cloth, 0.5));
  p.set(cx, torsoTop + look.torso - 2, '#d8b450');

  // Cabeza.
  const headW = look.head;
  const hx = cx - Math.floor(headW / 2) + 1;
  p.rect(hx, headTop, headW, look.head, look.skin);
  p.rect(hx, headTop + look.head - 1, headW, 1, skinShade);
  p.set(hx + headW - 1, headTop + 2, look.eye);
  p.set(hx + headW - 2, headTop + 2, '#ffffff');
  drawHair(p, look, hx, headTop, headW);
  // Las orejas, encima del pelo para que se vean.
  if (look.ears === 'none') {
    // Sin orejas: escamas más oscuras en la mejilla.
    p.set(hx + 1, headTop + 3, skinShade);
    p.set(hx + 2, headTop + 2, skinShade);
  } else if (look.ears === 'pointy') {
    p.set(hx, headTop + 2, look.skin);
    p.set(hx - 1, headTop + 1, look.skin);
    p.set(hx - 2, headTop, look.skin);
  } else {
    p.set(hx + 1, headTop + 2, skinShade);
  }
  if (look.beard) {
    p.rect(hx + 1, headTop + look.head - 2, headW - 1, 3, look.beard);
    p.set(hx + headW - 1, headTop + look.head + 1, look.beard);
  }
  if (look.tusks) {
    p.set(hx + headW - 1, headTop + look.head - 2, '#f4f0e4');
    p.set(hx + headW, headTop + look.head - 3, '#f4f0e4');
    p.set(hx + headW - 3, headTop + look.head - 2, '#f4f0e4');
  }

  // Brazo delantero según la postura; devuelve la mano.
  const sy = torsoTop + 1;
  const sx = cx + 1;
  if (pose === Pose.RAISE) {
    p.set(sx, sy - 1, armTone);
    p.set(sx + 1, sy - 2, armTone);
    p.set(sx + 1, sy - 3, look.skin);
    return { x: sx + 1, y: sy - 3 };
  }
  if (pose === Pose.STRIKE) {
    p.rect(sx, sy, 3, 1, armTone);
    p.set(sx + 3, sy, look.skin);
    return { x: sx + 3, y: sy };
  }
  const ax = sx + swing;
  p.rect(ax, sy, 1, look.torso - 2, armTone);
  p.set(ax, sy + look.torso - 2, look.skin);
  return { x: ax, y: sy + look.torso - 2 };
}

function drawHair(p: Pix, look: RaceLook, hx: number, top: number, w: number): void {
  const c = look.hair;
  // Brillo del pelo donde le da la luz (arriba, hacia la cara).
  const shine = shade(c, 1.35);
  switch (look.hairStyle) {
    case 'short':
      p.rect(hx, top - 1, w, 2, c);
      p.rect(hx, top + 1, 1, 2, c);
      p.rect(hx + 2, top - 1, w - 3, 1, shine);
      break;
    case 'long':
      p.rect(hx, top - 1, w, 2, c);
      p.rect(hx - 1, top, 2, 5, c);
      p.set(hx + w - 1, top + 1, c);
      p.rect(hx + 1, top - 1, w - 2, 1, shine);
      p.set(hx - 1, top + 4, shade(c, 0.8));
      break;
    case 'cap':
      // Casco de piedra de los petrinos.
      p.rect(hx - 1, top - 1, w + 2, 2, c);
      p.rect(hx, top - 2, w, 1, shade(c, 1.15));
      p.set(hx + w, top + 1, shade(c, 0.8));
      break;
    case 'crest':
      // Cresta de púas sobre la cabeza y la nuca.
      for (let k = 0; k < w; k += 2) p.set(hx + k, top - 1, c);
      for (let k = 1; k < w; k += 2) p.set(hx + k, top - 2, shade(c, 1.2));
      p.set(hx - 1, top + 1, c);
      break;
    case 'mohawk':
      p.rect(hx + 1, top - 2, w - 2, 2, c);
      p.set(hx, top, c);
      break;
  }
}

// ---------- Animales ----------

function drawSheep(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const wool = '#f4f0e4';
  const woolShade = '#d8d2c2';
  const dark = '#3b3231';
  const legs = [3, 5, 9, 11];
  legs.forEach((x, k) => {
    const lift = walk % 2 === 1 && k % 2 === (walk === 1 ? 0 : 1) ? 1 : 0;
    p.rect(x, g - 2, 1, 2 - lift, dark);
  });
  // El vellón sube y baja un píxel al andar.
  const b = walk === 1 || walk === 3 ? 1 : 0;
  p.rect(2, g - 7 + b, 11, 5, wool);
  p.rect(3, g - 8 + b, 9, 1, wool);
  p.rect(4, g - 8 + b, 6, 1, '#ffffff');
  p.rect(3, g - 2 + b, 9, 1, woolShade);
  for (const [x, y] of [[4, g - 6], [7, g - 5], [10, g - 6], [5, g - 4], [9, g - 4]]) p.set(x, y + b, woolShade);
  for (const [x, y] of [[5, g - 7], [8, g - 6], [11, g - 7]]) p.set(x, y + b, '#ffffff');
  p.set(1, g - 6 + b, wool);
  const headDown = (pose === Pose.RAISE || pose === Pose.STRIKE ? 2 : 0) + b;
  p.rect(12, g - 8 + headDown, 3, 3, dark);
  p.set(15, g - 7 + headDown, dark);
  p.set(14, g - 7 + headDown, '#f4f0e4');
  p.set(12, g - 9 + headDown, dark);
  // Oreja caída, algo más clara.
  p.set(11, g - 7 + headDown, '#5a4a48');
  return { x: 15, y: g - 6 + headDown };
}

function drawRabbit(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const hop = walk === 1 || walk === 3 ? 1 : 0;
  const fur = '#b8956a';
  const furShade = '#94744e';
  p.rect(5, g - 4 - hop, 6, 3, fur);
  p.rect(6, g - 5 - hop, 4, 1, fur);
  p.rect(5, g - 2 - hop, 6, 1, furShade);
  p.set(4, g - 4 - hop, '#f4f0e4');
  p.rect(10, g - 6 - hop, 3, 3, fur);
  p.set(12, g - 5 - hop, '#2a1d14');
  p.rect(10, g - 9 - hop, 1, 3, fur);
  p.rect(11, g - 9 - hop, 1, 3, furShade);
  p.set(10, g - 8 - hop, '#e8a0a0');
  p.rect(6, g - 1, 2, 1, furShade);
  p.rect(9, g - 1 + (hop ? -1 : 0), 2, 1, furShade);
  return { x: 13, y: g - 4 };
}

function drawWolf(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const fur = '#8a929c';
  const furDark = '#62696f';
  const belly = '#c9ced2';
  const lunge = pose === Pose.STRIKE ? 1 : 0;
  const legs: [number, number][] = [
    [3, 0],
    [5, 1],
    [11, 0],
    [13, 1],
  ];
  for (const [x, phase] of legs) {
    const fwd = walk === 1 ? (phase ? 1 : -1) : walk === 3 ? (phase ? -1 : 1) : 0;
    p.rect(x + fwd, g - 2, 1, 2, furDark);
  }
  p.rect(2 + lunge, g - 7, 12, 5, fur);
  p.rect(4 + lunge, g - 3, 9, 1, belly);
  p.rect(2 + lunge, g - 7, 12, 1, furDark);
  // Pelo erizado del lomo, más claro.
  for (const x of [5, 8, 11]) p.set(x + lunge, g - 6, '#aab2ba');
  // Cola: se balancea al trotar.
  const wag = walk === 1 ? -1 : walk === 3 ? 1 : 0;
  p.set(1 + lunge, g - 6, fur);
  p.set(0 + lunge, g - 7 + wag, fur);
  p.set(0 + lunge, g - 8 + wag, furDark);
  // Cabeza y hocico.
  const hy = g - 9 + (pose === Pose.RAISE ? 2 : 0);
  p.rect(13 + lunge, hy, 4, 4, fur);
  p.rect(16 + lunge, hy + 2, 1, 1, furDark);
  p.set(13 + lunge, hy - 1, furDark);
  p.set(15 + lunge, hy - 1, furDark);
  p.set(15 + lunge, hy + 1, '#f2d14b');
  if (pose === Pose.STRIKE) p.set(16 + lunge, hy + 3, '#c2304a');
  return { x: 17, y: hy + 3 };
}

/** Cuatro patas que se alternan al andar (`phase` 0/1 = pareja delantera o trasera de cada lado). */
function legs(p: Pix, xs: readonly (readonly [number, number])[], walk: number, top: number, len: number, color: string, hoof?: string): void {
  for (const [x, phase] of xs) {
    const fwd = walk === 1 ? (phase ? 1 : -1) : walk === 3 ? (phase ? -1 : 1) : 0;
    p.rect(x + fwd, top, 1, len, color);
    if (hoof) p.set(x + fwd, top + len - 1, hoof);
  }
}

function drawDeer(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const fur = '#a0663a';
  const dark = '#784a28';
  const belly = '#e8d2b0';
  legs(p, [[4, 0], [6, 1], [11, 0], [13, 1]], walk, g - 4, 4, dark, '#2a1d14');
  p.rect(3, g - 8, 11, 4, fur);
  p.rect(4, g - 9, 9, 1, fur);
  p.rect(4, g - 5, 9, 1, belly);
  p.rect(5, g - 8, 6, 1, shade(fur, 1.15));
  // Cola blanca levantada.
  p.set(2, g - 9, '#f4f0e4');
  p.set(2, g - 8, belly);
  // Cuello largo y cabeza; al comer, la cabeza baja al suelo.
  const down = pose === Pose.RAISE || pose === Pose.STRIKE;
  const hx = 14;
  const hy = down ? g - 5 : g - 13;
  if (!down) p.rect(13, g - 11, 2, 3, fur);
  else p.rect(14, g - 8, 2, 2, fur);
  p.rect(hx, hy, 3, 3, fur);
  p.set(hx + 3, hy + 1, dark);
  p.set(hx + 1, hy, '#2a1d14');
  p.set(hx, hy - 1, fur);
  // Cornamenta.
  const ant = '#d8c49a';
  p.rect(hx, hy - 3, 1, 2, ant);
  p.set(hx - 1, hy - 4, ant);
  p.set(hx + 1, hy - 4, ant);
  p.set(hx + 2, hy - 3, ant);
  return { x: hx + 3, y: hy + 2 };
}

function drawGoat(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const coat = '#d8cfc0';
  const shadeC = '#aaa090';
  legs(p, [[4, 0], [6, 1], [10, 0], [12, 1]], walk, g - 3, 3, '#5a5048', '#2a1d14');
  p.rect(3, g - 7, 11, 4, coat);
  p.rect(4, g - 8, 8, 1, coat);
  p.rect(3, g - 4, 11, 1, shadeC);
  p.rect(5, g - 8, 4, 1, '#f4f0e4');
  p.set(2, g - 8, coat);
  const lunge = pose === Pose.STRIKE ? 1 : 0;
  const hy = g - 10 + (pose === Pose.RAISE ? 3 : 0);
  const hx = 13 + lunge;
  p.rect(hx, hy, 3, 3, coat);
  p.set(hx + 3, hy + 1, shadeC);
  p.set(hx + 1, hy + 1, '#2a1d14');
  // Barba y cuernos curvos hacia atrás.
  p.rect(hx + 2, hy + 3, 1, 2, '#f4f0e4');
  const horn = '#6a5a48';
  p.set(hx, hy - 1, horn);
  p.set(hx - 1, hy - 2, horn);
  p.set(hx - 2, hy - 2, horn);
  p.set(hx - 2, hy - 1, horn);
  return { x: hx + 3, y: hy + 2 };
}

function drawCamel(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const hide = '#c99a5a';
  const dark = '#9a7040';
  legs(p, [[3, 0], [5, 1], [11, 0], [13, 1]], walk, g - 6, 6, dark, '#5a4028');
  p.rect(2, g - 10, 13, 4, hide);
  p.rect(2, g - 7, 13, 1, dark);
  // Joroba.
  p.rect(5, g - 13, 5, 3, hide);
  p.rect(6, g - 14, 3, 1, hide);
  p.rect(6, g - 13, 2, 1, shade(hide, 1.15));
  p.set(1, g - 9, dark);
  const down = pose === Pose.RAISE || pose === Pose.STRIKE;
  // Cuello en curva hacia arriba y cabeza alargada.
  if (down) {
    p.rect(14, g - 9, 2, 3, hide);
    p.rect(15, g - 6, 3, 2, hide);
    p.set(16, g - 6, '#2a1d14');
    return { x: 17, y: g - 5 };
  }
  p.rect(14, g - 13, 2, 4, hide);
  p.rect(15, g - 16, 2, 3, hide);
  p.rect(15, g - 17, 3, 2, hide);
  p.set(16, g - 17, '#2a1d14');
  p.set(17, g - 16, dark);
  return { x: 17, y: g - 15 };
}

function drawFox(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const fur = '#d8743a';
  const dark = '#2a1d14';
  const white = '#f4f0e4';
  const lunge = pose === Pose.STRIKE ? 1 : 0;
  legs(p, [[6, 0], [7, 1], [11, 0], [12, 1]], walk, g - 2, 2, dark);
  p.rect(5 + lunge, g - 5, 8, 3, fur);
  p.rect(7 + lunge, g - 2, 5, 1, white);
  p.rect(6 + lunge, g - 5, 5, 1, shade(fur, 1.15));
  // Cola larga y espesa con la punta blanca.
  const wag = walk === 1 ? -1 : walk === 3 ? 1 : 0;
  p.rect(1 + lunge, g - 5 + wag, 4, 2, fur);
  p.set(0 + lunge, g - 5 + wag, white);
  p.set(1 + lunge, g - 4 + wag, white);
  // Cabeza con hocico fino y orejas en punta.
  const hy = g - 7 + (pose === Pose.RAISE ? 2 : 0);
  const hx = 12 + lunge;
  p.rect(hx, hy, 3, 3, fur);
  p.rect(hx + 3, hy + 1, 2, 1, fur);
  p.set(hx + 4, hy + 1, dark);
  p.set(hx + 1, hy + 2, white);
  p.set(hx + 2, hy + 2, white);
  p.set(hx + 2, hy + 1, dark);
  p.set(hx, hy - 1, fur);
  p.set(hx + 2, hy - 1, fur);
  p.set(hx, hy - 2, dark);
  p.set(hx + 2, hy - 2, dark);
  return { x: hx + 4, y: hy + 2 };
}

function drawBear(p: Pix, pose: number): Hand {
  const g = CELL_H - 2;
  const walk = pose < 4 ? pose : 0;
  const fur = '#6a4a32';
  const dark = '#4a3222';
  const lunge = pose === Pose.STRIKE ? 1 : 0;
  legs(p, [[3, 0], [5, 1], [11, 0], [13, 1]], walk, g - 3, 3, dark);
  for (const x of [3, 5, 11, 13]) p.set(x, g - 3, fur);
  p.rect(2 + lunge, g - 9, 13, 6, fur);
  p.rect(3 + lunge, g - 10, 9, 1, fur);
  p.rect(4 + lunge, g - 10, 6, 1, shade(fur, 1.2));
  p.rect(2 + lunge, g - 4, 13, 1, dark);
  // Cabeza redonda con orejas y hocico claro; al atacar se alza.
  const hy = g - 10 + (pose === Pose.RAISE ? 3 : 0) - lunge;
  const hx = 13 + lunge;
  p.rect(hx, hy, 4, 4, fur);
  p.rect(hx + 3, hy + 2, 2, 2, '#a8805a');
  p.set(hx + 4, hy + 2, '#1a1410');
  p.set(hx + 2, hy + 1, '#1a1410');
  p.set(hx, hy - 1, dark);
  p.set(hx + 2, hy - 1, dark);
  if (pose === Pose.STRIKE) p.set(hx + 4, hy + 4, '#f4f0e4');
  return { x: hx + 5, y: hy + 3 };
}

/** Tamaño de dibujo de los animales grandes respecto a un aldeano. */
export const ANIMAL_SCALE: Readonly<Record<number, number>> = { [Species.BEAR]: 1.35, [Species.CAMEL]: 1.2, [Species.DEER]: 1.1 };

const ANIMAL_ART: Readonly<Record<number, (p: Pix, pose: number) => Hand>> = {
  [Species.DEER]: drawDeer,
  [Species.GOAT]: drawGoat,
  [Species.CAMEL]: drawCamel,
  [Species.FOX]: drawFox,
  [Species.BEAR]: drawBear,
};

// ---------- Atlas ----------

export interface CreatureAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Columna = postura × 2 + espejo; fila = especie × CLOTH_COUNT + ropa. */
  cell(species: number, cloth: number, pose: number, flip: boolean): { sx: number; sy: number };
  /** Mano delantera (en píxeles de la celda, sin espejar) por especie y postura. */
  hand(species: number, pose: number): Hand;
  /** Retrato para la interfaz. */
  toDataUrl(species: number, scale: number): string;
}

function drawCreature(p: Pix, species: number, cloth: string, pose: number): Hand {
  if (species === Species.SHEEP) return drawSheep(p, pose);
  if (species === Species.RABBIT) return drawRabbit(p, pose);
  if (species === Species.WOLF) return drawWolf(p, pose);
  const animal = ANIMAL_ART[species];
  if (animal) return animal(p, pose);
  if (isMonster(species)) {
    const action = pose === Pose.RAISE ? MonsterAction.RAISE : pose === Pose.STRIKE ? MonsterAction.STRIKE : MonsterAction.WALK;
    return drawMonster(p, species, pose < 4 ? pose : 0, action, CELL_H - 2);
  }
  return drawHumanoid(p, RACES[species], cloth, pose);
}

export function buildCreatureAtlas(): CreatureAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * POSE_COUNT * 2;
  canvas.height = CELL_H * SPECIES_TOTAL * CLOTH_COUNT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  const hands: Hand[][] = [];
  for (let s = 0; s < SPECIES_TOTAL; s++) {
    hands.push([]);
    const humanoid = RACES[s] !== undefined;
    for (let c = 0; c < CLOTH_COUNT; c++) {
      // Los animales no llevan ropa: basta con la primera fila.
      if (!humanoid && c > 0) continue;
      const cloth = c < VILLAGE_COLORS.length ? VILLAGE_COLORS[c] : NEUTRAL_CLOTH;
      for (let pose = 0; pose < POSE_COUNT; pose++) {
        for (let flip = 0; flip < 2; flip++) {
          const p = new Pix(CELL_W, CELL_H);
          const hand = drawCreature(p, s, cloth, pose);
          if (c === 0 && flip === 0) hands[s][pose] = hand;
          p.paint(ctx, (pose * 2 + flip) * CELL_W, (s * CLOTH_COUNT + c) * CELL_H, flip === 1);
        }
      }
    }
  }
  return {
    canvas,
    cell(species, cloth, pose, flip) {
      const row = species * CLOTH_COUNT + (RACES[species] ? cloth : 0);
      return { sx: (pose * 2 + (flip ? 1 : 0)) * CELL_W, sy: row * CELL_H };
    },
    hand: (species, pose) => hands[species][pose],
    toDataUrl(species, scale) {
      const c = document.createElement('canvas');
      c.width = CELL_W * scale;
      c.height = CELL_H * scale;
      const x = c.getContext('2d');
      if (!x) return '';
      x.imageSmoothingEnabled = false;
      const cloth = RACES[species] ? CLOTH_COUNT - 1 : 0;
      x.drawImage(canvas, 0, (species * CLOTH_COUNT + cloth) * CELL_H, CELL_W, CELL_H, 0, 0, c.width, c.height);
      return c.toDataURL();
    },
  };
}

// ---------- Herramientas y carga ----------

/** Herramientas (en vertical, con el puño abajo) y objetos que se llevan a cuestas. */
const TOOL_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  axe: ['.ss..', 'ssst.', '.s.t.', '...t.', '...t.', '...t.'],
  pick: ['sssss', 's.t.s', '..t..', '..t..', '..t..'],
  hoe: ['ss.', '.t.', '.t.', '.t.', '.t.', '.t.'],
  hammer: ['sss', 'sss', '.t.', '.t.', '.t.'],
  spear: ['.s.', 'sss', '.s.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.'],
  steelSpear: ['.S.', 'SSS', '.S.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.'],
  bow: ['.b..', 'b.l.', 'b..l', 'b..l', 'b.l.', '.b..'],
  rod: ['....t', '...t.', '..t..', '.t...', 't....', 't....'],
  basket: ['.t.t.', 'yyyyy', 'yYyYy', '.yyy.'],
  bundle: ['.cc.', 'cCcc', 'cccc', '.cc.'],
  log: ['ttttt', 'tTTTt', 'ttttt'],
  stone: ['.gg.', 'gGgg', 'gggg'],
  ore: ['.ro.', 'rorr', 'orro'],
  gold: ['.yY.', 'yYyy', 'yyyy'],
  food: ['.R..', 'RRgR', '.RR.'],
};
const TOOL_COLORS: Readonly<Record<string, string>> = {
  s: '#a9b1b9',
  S: '#e2e8ee',
  t: '#8a5a2a',
  T: '#b07a43',
  b: '#8a5a2a',
  l: '#e8e0c8',
  y: '#d8b450',
  Y: '#a8843a',
  c: '#c9a87a',
  C: '#a8885a',
  g: '#9a968e',
  G: '#76726c',
  r: '#b86b45',
  o: '#5a4a40',
  R: '#d2405e',
};

export const TOOL_IDS = Object.keys(TOOL_TEMPLATES);

export interface ToolAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Rectángulo de una herramienta: `forward` la gira 90° (golpe). */
  rect(tool: string, forward: boolean, flip: boolean): { sx: number; sy: number; w: number; h: number } | null;
}

function rotate(t: readonly string[]): string[] {
  // 90° en sentido horario: la punta pasa a apuntar hacia delante.
  const h = t.length;
  const w = t[0].length;
  return Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => t[h - 1 - y][x]).join(''));
}

export function buildToolAtlas(): ToolAtlas {
  const size = 11;
  const canvas = document.createElement('canvas');
  canvas.width = size * 4;
  canvas.height = size * TOOL_IDS.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  const rects = new Map<string, { sx: number; sy: number; w: number; h: number }>();
  TOOL_IDS.forEach((id, row) => {
    const variants = [TOOL_TEMPLATES[id], rotate(TOOL_TEMPLATES[id])];
    variants.forEach((t, k) => {
      for (let flip = 0; flip < 2; flip++) {
        const p = new Pix(t[0].length + 2, t.length + 2);
        t.forEach((line, y) => [...line].forEach((ch, x) => ch !== '.' && p.set(x + 1, y + 1, TOOL_COLORS[ch])));
        const sx = (k * 2 + flip) * size;
        p.paint(ctx, sx, row * size, flip === 1);
        rects.set(`${id}:${k}:${flip}`, { sx, sy: row * size, w: p.w, h: p.h });
      }
    });
  });
  return {
    canvas,
    rect: (tool, forward, flip) => rects.get(`${tool}:${forward ? 1 : 0}:${flip ? 1 : 0}`) ?? null,
  };
}
