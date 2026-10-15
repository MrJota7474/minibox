import { BuildingType } from '../civ/model';
import { Species } from '../entities/species';
import { Pix, shade } from './pixel';

/**
 * Pixel art original de los edificios (8 px por casilla), con arquitectura propia de
 * cada raza: humanos (entramado y teja), silvanos (troncos y techos de hojas), petrinos
 * (sillería y pizarra) y colmilludos (tiendas de piel y colmillos).
 */
export const BUILDING_PX = 8;

interface Style {
  wall: string;
  pattern: 'timber' | 'log' | 'stone' | 'hide' | 'reed' | 'adobe';
  trim: string;
  roof: string;
  roofShape: 'gable' | 'dome' | 'flat' | 'tent' | 'thatch' | 'cupola';
  /** Casas sobre pilotes (palafitos). */
  stilts?: boolean;
  door: string;
  stone: string;
  accent: string;
  /** Tejado (o piel, en las tiendas) de la segunda variante de casa. */
  roofAlt: string;
  wallAlt: string;
}

const STYLES: Readonly<Record<number, Style>> = {
  [Species.HUMAN]: { wall: '#e3d2a8', pattern: 'timber', trim: '#6a4a2a', roof: '#b5432f', roofShape: 'gable', door: '#5a3a22', stone: '#9a9a9a', accent: '#f2d16b', roofAlt: '#8a5a3a', wallAlt: '#ead8b8' },
  [Species.SILVAN]: { wall: '#9a6a3a', pattern: 'log', trim: '#6a4422', roof: '#3f8a3a', roofShape: 'dome', door: '#4a3a22', stone: '#8aa08a', accent: '#e8e0a0', roofAlt: '#5e9a36', wallAlt: '#8a5e34' },
  [Species.PETRINO]: { wall: '#a8a39a', pattern: 'stone', trim: '#76726c', roof: '#5a5a66', roofShape: 'flat', door: '#4a4a52', stone: '#7a7a80', accent: '#f2a03d', roofAlt: '#6a5650', wallAlt: '#b4aea2' },
  [Species.TUSKER]: { wall: '#a87a4a', pattern: 'hide', trim: '#6a4a2a', roof: '#8a5a32', roofShape: 'tent', door: '#2a1a0a', stone: '#6a5a4a', accent: '#f4f0e4', roofAlt: '#7a5a3a', wallAlt: '#b88a58' },
  [Species.SCALEFOLK]: { wall: '#b8a070', pattern: 'reed', trim: '#5a4a2a', roof: '#8a9a4a', roofShape: 'thatch', door: '#2a2a1a', stone: '#7a8a7a', accent: '#4fd0c0', roofAlt: '#a89a50', wallAlt: '#c8b080', stilts: true },
  [Species.DUNEFOLK]: { wall: '#dcb47a', pattern: 'adobe', trim: '#a8784a', roof: '#c8a06a', roofShape: 'cupola', door: '#3a6aa8', stone: '#b89a78', accent: '#f4f0e4', roofAlt: '#d0aa74', wallAlt: '#e4c08c' },
};
const WINDOW = '#f2d16b';
const RACES = [Species.HUMAN, Species.SILVAN, Species.PETRINO, Species.TUSKER, Species.SCALEFOLK, Species.DUNEFOLK];
/** Altura (px) de los pilotes de los palafitos. */
const STILT_H = 2;
/** Variantes de cada edificio (tejado y pared de otro tono). */
export const BUILDING_VARIANTS = 2;
const FLOWERS = ['#e8546a', '#f2d16b', '#f4b6c8'];

// ---------- Piezas ----------

function wall(p: Pix, s: Style, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, s.wall);
  const dark = shade(s.wall, 0.82);
  switch (s.pattern) {
    case 'timber':
      p.rect(x, y, w, 1, s.trim);
      p.rect(x, y, 1, h, s.trim);
      p.rect(x + w - 1, y, 1, h, s.trim);
      if (w > 7) p.rect(x + Math.floor(w / 2), y, 1, h, s.trim);
      break;
    case 'log':
      for (let yy = y; yy < y + h; yy += 2) p.rect(x, yy, w, 1, dark);
      p.set(x, y, s.trim);
      p.set(x + w - 1, y, s.trim);
      break;
    case 'stone':
      for (let yy = y; yy < y + h; yy += 2) {
        p.rect(x, yy, w, 1, dark);
        for (let xx = x + ((yy - y) % 4 === 0 ? 1 : 3); xx < x + w; xx += 4) p.set(xx, yy + 1, dark);
      }
      break;
    case 'reed':
      // Cañas en vertical, con una atadura a media altura.
      for (let xx = x; xx < x + w; xx += 2) p.rect(xx, y, 1, h, dark);
      p.rect(x, y + Math.floor(h / 2), w, 1, s.trim);
      break;
    case 'hide':
      for (let xx = x + 2; xx < x + w; xx += 4) p.rect(xx, y, 1, h, dark);
      break;
    case 'adobe':
      // Barro liso con alguna grieta y las cabezas de las vigas asomando arriba.
      p.set(x + 2, y + Math.floor(h / 2), dark);
      p.set(x + 3, y + Math.floor(h / 2) + 1, dark);
      p.set(x + w - 3, y + 2, dark);
      for (let xx = x + 1; xx < x + w; xx += 3) p.set(xx, y, s.trim);
      break;
  }
}

function door(p: Pix, s: Style, cx: number, ground: number, h = 4): void {
  p.rect(cx - 1, ground - h, 2, h, s.door);
  p.set(cx, ground - Math.ceil(h / 2), s.accent);
}

function windowAt(p: Pix, s: Style, x: number, y: number): void {
  p.rect(x, y, 2, 2, WINDOW);
  p.set(x, y, shade(WINDOW, 1.1));
  p.set(x + 1, y + 1, shade(WINDOW, 0.8));
  p.set(x - 1, y + 2, s.trim);
  p.set(x + 2, y + 2, s.trim);
}

/** Jardinera bajo una ventana, con flores de colores. */
function flowerBox(p: Pix, s: Style, x: number, y: number, seed: number): void {
  p.rect(x - 1, y, 4, 1, shade(s.trim, 1.1));
  p.set(x - 1, y - 1, '#4f9a35');
  p.set(x, y - 1, FLOWERS[seed % FLOWERS.length]);
  p.set(x + 1, y - 1, '#4f9a35');
  p.set(x + 2, y - 1, FLOWERS[(seed + 1) % FLOWERS.length]);
}

/** Farol junto a la puerta. */
function lantern(p: Pix, x: number, y: number): void {
  p.set(x, y - 1, '#3a2a1a');
  p.set(x, y, '#ffd86a');
  p.set(x, y + 1, '#c08a2a');
}

/** Tejado a dos aguas con hileras de tejas y luz por la izquierda. */
function gable(p: Pix, s: Style, x0: number, x1: number, base: number, color = s.roof): void {
  const h = Math.ceil((x1 - x0 + 1) / 2);
  for (let k = 0; k < h; k++) {
    const y = base - k;
    const a = x0 + k;
    const b = x1 - k;
    if (a > b) break;
    const mid = Math.floor((a + b) / 2);
    p.rect(a, y, mid - a + 1, 1, k % 2 ? shade(color, 1.12) : color);
    p.rect(mid + 1, y, b - mid, 1, k % 2 ? shade(color, 0.85) : shade(color, 0.78));
  }
  // Caballete: la cumbrera más clara donde le da el sol.
  const top = base - h + 1;
  const peak = Math.floor((x0 + x1) / 2);
  p.set(peak, top, shade(color, 1.35));
  p.set(peak - 1, top + 1, shade(color, 1.25));
  p.rect(x0 - 1, base + 1, x1 - x0 + 3, 1, shade(color, 0.6));
}

/** Tejado de paja cónico (escamados): empinado, con fleco colgando y un remate de conchas. */
function thatch(p: Pix, s: Style, x0: number, x1: number, base: number): void {
  const half = (x1 - x0) / 2;
  const h = Math.ceil(half * 1.3);
  const cx = (x0 + x1) / 2;
  for (let k = 0; k < h; k++) {
    const spread = half * (1 - k / h);
    const a = Math.round(cx - spread);
    const b = Math.round(cx + spread);
    for (let x = a; x <= b; x++) p.set(x, base - k, (x + k) % 3 === 0 ? shade(s.roof, 0.8) : x < cx ? shade(s.roof, 1.1) : s.roof);
  }
  // Fleco bajo el alero.
  for (let x = x0 - 1; x <= x1 + 1; x += 2) p.set(x, base + 1, shade(s.roof, 0.65));
  p.set(Math.round(cx), base - h, s.accent);
}

/** Azotea de adobe con una cúpula blanca encima (dunarios). */
function cupola(p: Pix, s: Style, x0: number, x1: number, base: number, size: number): void {
  flatRoof(p, s, x0, x1, base, 2);
  const cx = (x0 + x1) / 2;
  // Ancho de cada fila con la paridad del centro, para que la cúpula quede simétrica.
  const odd = (x0 + x1) % 2 === 0 ? 1 : 0;
  for (let y = 0; y < size; y++) {
    const half = size * Math.sqrt(Math.max(0, 1 - ((y + 0.5) / size) ** 2));
    const width = Math.max(2 - odd, 2 * Math.round(half - odd / 2) + odd);
    const left = odd ? cx - (width - 1) / 2 : cx + 0.5 - width / 2;
    p.rect(left, base - 2 - y, width, 1, y === 0 ? shade(s.accent, 0.85) : s.accent);
  }
  p.set(Math.round(cx), base - 2 - size, '#d8b450');
}

/** Pilotes de un palafito bajo el suelo de la casa (desde `floor` hasta el suelo). */
function stilts(p: Pix, s: Style, x0: number, x1: number, floor: number, ground: number): void {
  for (const x of [x0 + 1, Math.round((x0 + x1) / 2), x1 - 1]) p.rect(x, floor + 1, 1, ground - floor, s.trim);
  // Escalerilla hasta la puerta.
  for (let y = floor + 1; y <= ground; y++) p.set(9, y, y % 2 === 0 ? s.trim : shade(s.trim, 1.3));
}

/** Techo abovedado de hojas (sólo la mitad de arriba: las paredes se ven debajo). */
function dome(p: Pix, s: Style, cx: number, base: number, rx: number, ry: number): void {
  for (let y = Math.floor(base - ry); y <= base; y++) {
    const t = (base - y) / (ry + 0.5);
    const half = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    p.rect(a, y, b - a + 1, 1, shade(s.roof, 0.8));
    if (b - a > 2) p.rect(a + 1, y, b - a - 1, 1, y < base ? s.roof : shade(s.roof, 0.8));
  }
  for (const [dx, dy] of [[-2, -1], [1, -2], [3, 0], [-3, 1]]) p.set(Math.round(cx + dx), Math.round(base + dy - ry / 2), shade(s.roof, 1.25));
  p.set(Math.round(cx + 1), Math.round(base - ry + 1), '#f4b6c8');
  p.rect(Math.round(cx - rx), base + 1, Math.round(rx * 2) + 1, 1, shade(s.roof, 0.6));
}

function flatRoof(p: Pix, s: Style, x0: number, x1: number, base: number, rows = 2): void {
  for (let k = 0; k < rows; k++) p.rect(x0 - 1 + k, base - k, x1 - x0 + 3 - k * 2, 1, k ? shade(s.roof, 1.15) : s.roof);
  p.rect(x0 - 1, base + 1, x1 - x0 + 3, 1, shade(s.roof, 0.6));
}

function tent(p: Pix, s: Style, x0: number, x1: number, ground: number, height: number): void {
  for (let k = 0; k < height; k++) {
    const y = ground - k;
    const t = k / height;
    const a = Math.round(x0 + ((x1 - x0) / 2) * t);
    const b = Math.round(x1 - ((x1 - x0) / 2) * t);
    p.rect(a, y, b - a + 1, 1, k % 3 === 0 ? shade(s.wall, 0.85) : s.wall);
    p.set(a, y, shade(s.wall, 0.7));
  }
  const top = ground - height;
  const cx = Math.round((x0 + x1) / 2);
  // Palos que asoman y colmillos.
  p.set(cx - 1, top, s.trim);
  p.set(cx + 1, top, s.trim);
  p.set(cx - 2, top - 1, s.trim);
  p.set(cx + 2, top - 1, s.trim);
  p.set(cx - 3, top + 2, s.accent);
  p.set(cx + 3, top + 2, s.accent);
  // Pinturas de guerra.
  p.set(cx - 2, ground - 3, '#a83a2a');
  p.set(cx + 2, ground - 3, '#a83a2a');
  // Entrada.
  for (let k = 0; k < 4; k++) p.rect(cx - Math.floor((4 - k) / 2), ground - k, Math.max(1, 4 - k), 1, s.door);
}

function chimney(p: Pix, s: Style, x: number, y: number): void {
  p.rect(x, y, 2, 3, s.stone);
  p.set(x, y, shade(s.stone, 1.2));
}

// ---------- Edificios ----------

/** Casa de 2×2 casillas; cuanto más nivel, más grande y con más detalle. */
function house(p: Pix, s: Style, level: number): void {
  // En los palafitos, la casa empieza unos píxeles por encima del suelo.
  const g = p.h - 1 - (s.stilts ? STILT_H : 0);
  if (s.roofShape === 'tent') {
    tent(p, s, level >= 2 ? 1 : 2, level >= 2 ? 14 : 13, g, 9 + level * 2);
    if (level >= 3) {
      p.set(3, g - 12, s.accent);
      p.set(12, g - 12, s.accent);
    }
    return;
  }
  const wallH = 4 + level;
  const x0 = level >= 2 ? 1 : 2;
  const x1 = level >= 2 ? 14 : 13;
  if (s.stilts) stilts(p, s, x0, x1, g, p.h - 1);
  wall(p, s, x0, g - wallH + 1, x1 - x0 + 1, wallH);
  door(p, s, 8, g + 1, level >= 3 ? 5 : 4);
  if (level >= 2) windowAt(p, s, x0 + 2, g - wallH + 3);
  if (level >= 2) windowAt(p, s, x1 - 3, g - wallH + 3);
  // Jardineras en las casas de humanos y silvanos; farol en las grandes.
  if (level >= 2 && (s.pattern === 'timber' || s.pattern === 'log')) {
    flowerBox(p, s, x0 + 2, g - wallH + 6, level);
    flowerBox(p, s, x1 - 3, g - wallH + 6, level + 1);
  }
  if (level >= 3) lantern(p, 10, g - 3);
  const base = g - wallH;
  if (s.roofShape === 'gable') {
    // Las chozas humanas llevan techo de paja.
    gable(p, s, x0 - 1, x1 + 1, base, level === 1 ? '#c9a24a' : s.roof);
    if (level >= 3) chimney(p, s, x1 - 3, base - 6);
  } else if (s.roofShape === 'thatch') {
    thatch(p, s, x0 - 1, x1 + 1, base);
  } else if (s.roofShape === 'cupola') {
    cupola(p, s, x0, x1, base, 2 + level);
  } else if (s.roofShape === 'dome') {
    dome(p, s, (x0 + x1) / 2, base, (x1 - x0) / 2 + 1.5, 3 + level);
    if (level >= 3) {
      // Casa en el árbol: un tronco que la atraviesa y una copa encima.
      p.rect(7, base - 12, 2, 6, '#6b4a2a');
      p.ellipse(8, base - 13, 5, 3, '#2f6f2a');
    }
  } else {
    flatRoof(p, s, x0, x1, base, level >= 2 ? 3 : 2);
    if (level >= 2) chimney(p, s, x0 + 1, base - 4);
    if (level >= 3) for (let x = x0; x <= x1; x += 2) p.set(x, base - 3, s.stone);
  }
}

function storage(p: Pix, s: Style): void {
  const g = p.h - 1;
  if (s.roofShape === 'tent') {
    tent(p, s, 1, 14, g, 10);
  } else {
    wall(p, s, 1, g - 6, 14, 7);
    if (s.roofShape === 'dome') dome(p, s, 7.5, g - 7, 8, 5);
    else if (s.roofShape === 'thatch') thatch(p, s, 0, 15, g - 7);
    else if (s.roofShape === 'cupola') cupola(p, s, 1, 14, g - 7, 3);
    else if (s.roofShape === 'flat') flatRoof(p, s, 1, 14, g - 7, 3);
    else gable(p, s, 0, 15, g - 7);
    // Portón de doble hoja.
    p.rect(5, g - 4, 6, 5, s.door);
    p.rect(7, g - 4, 2, 5, shade(s.door, 1.3));
  }
  // Cajas y barriles a la puerta.
  p.rect(0, g - 2, 3, 3, '#b07a43');
  p.set(1, g - 1, '#8a5a2a');
  p.rect(13, g - 2, 3, 3, '#8a5a2a');
  p.rect(13, g - 1, 3, 1, '#c9a87a');
}

/** Muelle: caseta de madera sobre la orilla. */
function dock(p: Pix, s: Style): void {
  const g = p.h - 1;
  p.rect(0, g - 3, 16, 4, '#9a6a3a');
  for (let x = 1; x < 16; x += 3) p.rect(x, g - 3, 1, 4, '#6a4422');
  wall(p, { ...s, pattern: 'log', wall: '#a8784a' }, 3, g - 9, 8, 6);
  gable(p, s, 2, 11, g - 10);
  door(p, s, 7, g - 3, 3);
  // Red de pesca colgada.
  p.rect(12, g - 8, 3, 4, '#c9b48a');
  p.set(13, g - 7, '#8a7a5a');
  p.set(14, g - 5, '#8a7a5a');
}

/** Santuario: templete sobre una escalinata, con braseros y un pináculo dorado; cada raza lo levanta a su manera. */
function shrine(p: Pix, s: Style): void {
  const g = p.h - 1;
  const gold = '#f2d16b';
  // Escalinata de piedra.
  p.rect(0, g - 1, 16, 2, s.stone);
  p.rect(1, g - 3, 14, 2, shade(s.stone, 1.15));
  p.rect(1, g - 1, 14, 1, shade(s.stone, 0.8));
  let top: number;
  if (s.roofShape === 'tent') {
    tent(p, s, 3, 12, g - 3, 12);
    top = g - 17;
  } else {
    // Cella con dos columnas claras y la puerta abierta a oscuras.
    wall(p, s, 4, g - 10, 8, 7);
    p.rect(3, g - 10, 1, 7, shade(s.stone, 1.3));
    p.rect(12, g - 10, 1, 7, shade(s.stone, 1.3));
    p.rect(7, g - 7, 2, 4, '#2a1d14');
    p.set(7, g - 8, gold);
    p.set(8, g - 8, gold);
    if (s.roofShape === 'gable') gable(p, s, 2, 13, g - 11);
    else if (s.roofShape === 'thatch') thatch(p, s, 2, 13, g - 11);
    else if (s.roofShape === 'cupola') cupola(p, s, 3, 12, g - 11, 4);
    else if (s.roofShape === 'dome') dome(p, s, 7.5, g - 11, 6, 5);
    else flatRoof(p, s, 3, 12, g - 11, 3);
    // El pináculo arranca justo encima del tejado (el de paja es más alto).
    top = s.roofShape === 'flat' ? g - 15 : s.roofShape === 'thatch' ? g - 20 : s.roofShape === 'cupola' ? g - 19 : g - 18;
  }
  // Pináculo: un disco dorado sobre un vástago.
  p.rect(7, top, 2, 3, s.stone);
  p.rect(6, top - 3, 4, 3, gold);
  p.rect(7, top - 4, 2, 5, gold);
  p.set(7, top - 3, '#fff6c0');
  p.set(8, top - 1, shade(gold, 0.75));
  // Braseros a los lados de la escalera.
  for (const x of [1, 14]) {
    p.set(x, g - 4, s.trim);
    p.set(x, g - 5, '#ff9a2a');
    p.set(x, g - 6, '#ffd04a');
  }
}

/** Hoguera del primer nivel del ayuntamiento: anillo de piedras, troncos, llamas y una tienda. */
function bonfire(p: Pix, s: Style): void {
  const g = p.h - 6;
  const cx = 14;
  // Tienda de campaña detrás.
  for (let k = 0; k < 10; k++) p.rect(1 + Math.floor(k / 2), g + 3 - k, 11 - k, 1, k % 3 === 0 ? shade(s.wall, 0.85) : s.wall);
  p.rect(5, g, 3, 3, s.door);
  // Anillo de piedras.
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    p.rect(Math.round(cx + Math.cos(ang) * 6), Math.round(g + 2 + Math.sin(ang) * 3), 2, 1, a % 2 ? s.stone : shade(s.stone, 1.15));
  }
  // Troncos cruzados y llamas.
  p.rect(cx - 3, g + 2, 7, 1, '#6a4a2a');
  p.rect(cx - 2, g + 1, 5, 1, '#8a5a2a');
  p.rect(cx - 2, g - 2, 5, 3, '#e86a2a');
  p.rect(cx - 1, g - 5, 3, 3, '#f08a1a');
  p.rect(cx, g - 7, 1, 2, '#f5d04a');
  p.set(cx - 1, g - 3, '#f5d04a');
  p.set(cx + 1, g - 1, '#f5d04a');
}

/** Ayuntamiento (nivel 2) y fortaleza (nivel 3): 3×3 casillas. */
function hall(p: Pix, s: Style, level: number): void {
  if (level <= 1) return bonfire(p, s);
  const g = p.h - 1;
  if (s.roofShape === 'tent') {
    if (level >= 3) for (let x = 0; x < 24; x += 2) p.rect(x, g - 5 - (x % 4 === 0 ? 1 : 0), 1, 6, '#6a4422');
    tent(p, s, 2, 21, g, level >= 3 ? 18 : 15);
    p.rect(10, g - 20, 3, 2, s.accent);
    p.set(9, g - 21, s.accent);
    p.set(13, g - 21, s.accent);
    return;
  }
  if (s.roofShape === 'dome' && level >= 3) {
    // Palacio en un árbol gigante.
    p.rect(9, g - 16, 6, 17, '#6b4a2a');
    p.rect(10, g - 16, 2, 17, '#8a6a3a');
    door(p, s, 12, g + 1, 5);
    windowAt(p, s, 11, g - 10);
    p.ellipse(12, g - 20, 11, 6, '#2f6f2a');
    p.ellipse(11, g - 21, 9, 4, '#3f8a3a');
    for (const [x, y] of [[6, g - 22], [16, g - 19], [12, g - 24], [9, g - 18]]) p.set(x, y, '#f4b6c8');
    return;
  }
  if (s.roofShape === 'cupola' && level >= 3) {
    // Palacio de adobe: gran cúpula central y dos alminares con su cupulita.
    wall(p, s, 3, g - 11, 18, 12);
    door(p, s, 12, g + 1, 6);
    windowAt(p, s, 6, g - 8);
    windowAt(p, s, 16, g - 8);
    cupola(p, s, 3, 20, g - 11, 7);
    for (const x of [0, 21]) {
      wall(p, s, x, g - 19, 3, 20);
      p.ellipse(x + 1, g - 20, 1.6, 1.6, s.accent);
      p.set(x + 1, g - 22, '#d8b450');
    }
    return;
  }
  if (s.roofShape === 'thatch' && level >= 3) {
    // Gran casa comunal de los escamados: más alta, con pilotes, tejado enorme y dos tótems.
    const floor = g - STILT_H;
    for (const x of [3, 8, 15, 20]) p.rect(x, floor + 1, 1, STILT_H, s.trim);
    wall(p, s, 2, floor - 10, 20, 11);
    door(p, s, 12, floor + 1, 6);
    windowAt(p, s, 5, floor - 7);
    windowAt(p, s, 17, floor - 7);
    thatch(p, s, 0, 23, floor - 11);
    for (const x of [0, 23]) {
      p.rect(x, g - 13, 1, 14, s.trim);
      p.rect(x, g - 15, 1, 2, s.accent);
      p.set(x, g - 10, s.accent);
    }
    return;
  }
  const stoneKeep = level >= 3;
  const ws: Style = stoneKeep && s.pattern !== 'stone' ? { ...s, pattern: 'stone', wall: '#a8a39a' } : s;
  const wallH = stoneKeep ? 12 : 9;
  wall(p, ws, 2, g - wallH + 1, 20, wallH);
  door(p, ws, 12, g + 1, 6);
  windowAt(p, ws, 5, g - wallH + 3);
  windowAt(p, ws, 17, g - wallH + 3);
  if (stoneKeep) {
    windowAt(p, ws, 11, g - wallH + 3);
    // Almenas y torres.
    for (let x = 1; x < 23; x += 3) p.rect(x, g - wallH - 1, 2, 2, ws.wall);
    wall(p, ws, 0, g - wallH - 6, 5, wallH + 7);
    wall(p, ws, 19, g - wallH - 6, 5, wallH + 7);
    for (const x of [0, 3, 19, 22]) p.rect(x, g - wallH - 8, 1, 2, ws.wall);
    p.rect(1, g - wallH - 3, 1, 2, '#2a1d14');
    p.rect(21, g - wallH - 3, 1, 2, '#2a1d14');
    return;
  }
  const base = g - wallH;
  if (s.roofShape === 'gable') {
    gable(p, s, 1, 22, base);
    // Campanario.
    p.rect(10, base - 14, 4, 4, s.wall);
    p.set(11, base - 12, s.accent);
    gable(p, s, 9, 14, base - 15);
  } else if (s.roofShape === 'thatch') {
    thatch(p, s, 1, 22, base);
  } else if (s.roofShape === 'cupola') {
    cupola(p, s, 2, 21, base, 6);
  } else if (s.roofShape === 'dome') {
    dome(p, s, 11.5, base, 11, 7);
  } else {
    flatRoof(p, s, 2, 21, base, 3);
    chimney(p, s, 4, base - 5);
    chimney(p, s, 18, base - 5);
  }
}

// ---------- Atlas ----------

interface Sprite {
  type: number;
  level: number;
  w: number;
  h: number;
  draw: (p: Pix, s: Style) => void;
}

const SPRITES: readonly Sprite[] = [
  { type: BuildingType.HALL, level: 1, w: 24, h: 28, draw: (p, s) => hall(p, s, 1) },
  { type: BuildingType.HALL, level: 2, w: 24, h: 40, draw: (p, s) => hall(p, s, 2) },
  { type: BuildingType.HALL, level: 3, w: 24, h: 40, draw: (p, s) => hall(p, s, 3) },
  { type: BuildingType.HOUSE, level: 1, w: 16, h: 26, draw: (p, s) => house(p, s, 1) },
  { type: BuildingType.HOUSE, level: 2, w: 16, h: 26, draw: (p, s) => house(p, s, 2) },
  { type: BuildingType.HOUSE, level: 3, w: 16, h: 30, draw: (p, s) => house(p, s, 3) },
  { type: BuildingType.STORAGE, level: 1, w: 16, h: 24, draw: (p, s) => storage(p, s) },
  { type: BuildingType.DOCK, level: 1, w: 16, h: 24, draw: (p, s) => dock(p, s) },
  { type: BuildingType.SHRINE, level: 1, w: 16, h: 28, draw: (p, s) => shrine(p, s) },
];
const CELL_W = 26;
const CELL_H = 42;

export interface BuildingAtlas {
  readonly canvas: HTMLCanvasElement;
  /**
   * Rectángulo (con contorno) de un edificio; `top` es lo que sobresale por encima de su huella.
   * `variant` elige el tono del tejado y `flip` lo dibuja espejado (sólo casas y almacenes).
   */
  rect(race: number, type: number, level: number, variant?: number, flip?: boolean): { sx: number; sy: number; w: number; h: number; top: number } | null;
}

/** Edificios que pueden salir espejados (los demás tienen la bandera o la entrada en un sitio fijo). */
function canFlip(type: number): boolean {
  return type === BuildingType.HOUSE || type === BuildingType.STORAGE;
}

/** Estilo de la variante: la segunda cambia el tejado y la pared por otros tonos de la misma raza. */
function variantStyle(s: Style, variant: number): Style {
  if (variant === 0) return s;
  return s.roofShape === 'tent' ? { ...s, wall: s.wallAlt } : { ...s, roof: s.roofAlt, wall: s.wallAlt };
}

export function buildBuildingAtlas(): BuildingAtlas {
  const canvas = document.createElement('canvas');
  // Columnas: edificio × (normal, espejado); filas: raza × variante.
  canvas.width = CELL_W * SPRITES.length * 2;
  canvas.height = CELL_H * RACES.length * BUILDING_VARIANTS;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  RACES.forEach((race, r) => {
    for (let v = 0; v < BUILDING_VARIANTS; v++) {
      const style = variantStyle(STYLES[race], v);
      SPRITES.forEach((sp, c) => {
        // Se dibuja con 1 px de margen para el contorno.
        const inner = new Pix(sp.w, sp.h);
        sp.draw(inner, style);
        const p = new Pix(sp.w + 2, sp.h + 2);
        for (let y = 0; y < sp.h; y++) {
          for (let x = 0; x < sp.w; x++) {
            const col = inner.get(x, y);
            if (col) p.set(x + 1, y + 1, col);
          }
        }
        const row = (r * BUILDING_VARIANTS + v) * CELL_H;
        p.paint(ctx, c * 2 * CELL_W, row);
        if (canFlip(sp.type)) p.paint(ctx, (c * 2 + 1) * CELL_W, row, true);
      });
    }
  });
  return {
    canvas,
    rect(race, type, level, variant = 0, flip = false) {
      const r = RACES.indexOf(race as (typeof RACES)[number]);
      const maxLevel = type === BuildingType.HALL || type === BuildingType.HOUSE ? 3 : 1;
      const c = SPRITES.findIndex((s) => s.type === type && s.level === Math.min(maxLevel, Math.max(1, level)));
      if (r < 0 || c < 0) return null;
      const sp = SPRITES[c];
      const footprint = type === BuildingType.HALL ? 24 : 16;
      const v = Math.abs(variant) % BUILDING_VARIANTS;
      const col = c * 2 + (flip && canFlip(type) ? 1 : 0);
      return { sx: col * CELL_W, sy: (r * BUILDING_VARIANTS + v) * CELL_H, w: sp.w + 2, h: sp.h + 2, top: sp.h - footprint };
    },
  };
}
