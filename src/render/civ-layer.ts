import type { CivSystem } from '../civ/civ-system';
import { BUILDING_DEFS, BuildingType, FARM_RIPE, VILLAGE_COLORS, type Building } from '../civ/model';
import { ZONE_SIZE, type World } from '../world/world';
import { dockWaterTile } from '../civ/boats';
import type { Camera } from './camera';
import { BUILDING_PX, buildBuildingAtlas, type BuildingAtlas } from './building-art';
import { shade } from './pixel';

const TERRITORY_ALPHA = 0.12;
const LABEL_MIN_ZOOM = 2.5;
const SPRITE_MIN_ZOOM = 2;
const PX_PER_TILE = BUILDING_PX;
/** Desde este zoom las granjas se dibujan surco a surco, con sus plantas. */
const CROP_MIN_ZOOM = 6;
/** Sombra de los edificios: desplazamiento (en casillas) hacia abajo a la derecha. */
const SHADOW_OFFSET = 0.22;
const SHADOW_COLOR = 'rgba(0,0,0,0.2)';
/** Llamas de la hoguera (5×8 px, tres cuadros): y = amarillo, o = naranja, r = rojo. */
const BONFIRE_FRAMES: readonly (readonly string[])[] = [
  ['..y..', '..y..', '.yoy.', '.yoo.', 'oyoor', 'rooor', 'rorrr', '.rrr.'],
  ['.y...', '..y..', '..yo.', '.oyo.', 'roooy', 'roorr', 'rrorr', '.rrr.'],
  ['...y.', '..y..', '.oy..', '.ooy.', 'ooyor', 'roooo', 'rrror', '.rrr.'],
];
const BONFIRE_COLORS: Readonly<Record<string, string>> = { y: '#ffe27a', o: '#ff9a2a', r: '#e84a1a' };
/** Centro de las llamas dentro del sprite de la hoguera (en píxeles del atlas, con contorno). */
const BONFIRE_X = 15;
const BONFIRE_Y = 16;

/** Variante de tono y espejo de cada edificio, siempre la misma para el mismo edificio. */
function variantOf(id: number): { variant: number; flip: boolean } {
  const h = Math.imul(id + 1, 2654435761) >>> 0;
  return { variant: (h >>> 7) & 1, flip: ((h >>> 9) & 1) === 1 };
}

function rgba(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

const FILLS = VILLAGE_COLORS.map((c) => rgba(c, TERRITORY_ALPHA));
/** Pliegues de las banderas (el color del reino, algo más oscuro), calculados una vez. */
const FOLDS = new Map<string, string>(VILLAGE_COLORS.map((c) => [c, shade(c, 0.78)]));
const BORDERS = VILLAGE_COLORS.map((c) => rgba(c, 0.9));
const INNER_BORDERS = VILLAGE_COLORS.map((c) => rgba(c, 0.3));

/** Dibuja territorio, edificios, obras y nombres de aldea. */
export class CivLayer {
  private readonly atlas: BuildingAtlas;

  constructor(
    private readonly world: World,
    private readonly civ: CivSystem,
    private readonly camera: Camera,
  ) {
    this.atlas = buildBuildingAtlas();
  }

  drawTerritory(ctx: CanvasRenderingContext2D): void {
    const w = this.world;
    const cam = this.camera;
    const z = cam.zoom * ZONE_SIZE;
    const zx0 = Math.max(0, Math.floor(cam.left / ZONE_SIZE));
    const zy0 = Math.max(0, Math.floor(cam.top / ZONE_SIZE));
    const zx1 = Math.min(w.zonesX - 1, Math.floor((cam.left + cam.viewW / cam.zoom) / ZONE_SIZE));
    const zy1 = Math.min(w.zonesY - 1, Math.floor((cam.top + cam.viewH / cam.zoom) / ZONE_SIZE));
    const line = Math.max(1, Math.min(3, cam.zoom * 0.35));
    ctx.lineWidth = line;
    for (let zy = zy0; zy <= zy1; zy++) {
      for (let zx = zx0; zx <= zx1; zx++) {
        const owner = w.zoneOwner[zy * w.zonesX + zx];
        if (owner === 0) continue;
        const kingdom = this.kingdomOfZone(zy * w.zonesX + zx);
        const color = this.colorOfKingdom(kingdom);
        const p = cam.worldToScreen(zx * ZONE_SIZE, zy * ZONE_SIZE);
        ctx.fillStyle = FILLS[color];
        ctx.fillRect(p.x, p.y, z, z);
        const h = line / 2;
        // Fronteras de reino gruesas; límites entre aldeas del mismo reino, tenues.
        const neighbors: [number, number, number, number, number][] = [
          [zx === 0 ? -2 : zy * w.zonesX + zx - 1, p.x + h, p.y, p.x + h, p.y + z],
          [zx === w.zonesX - 1 ? -2 : zy * w.zonesX + zx + 1, p.x + z - h, p.y, p.x + z - h, p.y + z],
          [zy === 0 ? -2 : (zy - 1) * w.zonesX + zx, p.x, p.y + h, p.x + z, p.y + h],
          [zy === w.zonesY - 1 ? -2 : (zy + 1) * w.zonesX + zx, p.x, p.y + z - h, p.x + z, p.y + z - h],
        ];
        for (const [n, x0, y0, x1, y1] of neighbors) {
          const otherOwner = n < 0 ? 0 : w.zoneOwner[n];
          if (otherOwner === owner) continue;
          const sameKingdom = otherOwner !== 0 && this.kingdomOfZone(n) === kingdom;
          ctx.strokeStyle = sameKingdom ? INNER_BORDERS[color] : BORDERS[color];
          ctx.beginPath();
          this.edge(ctx, x0, y0, x1, y1);
          ctx.stroke();
        }
      }
    }
  }

  private kingdomOfZone(z: number): number {
    return this.civ.villages[this.world.zoneOwner[z] - 1].kingdom;
  }

  private colorOfKingdom(k: number): number {
    return k >= 0 ? this.civ.kingdoms.kingdoms[k].colorIndex : 0;
  }

  private edge(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }

  drawBuildings(ctx: CanvasRenderingContext2D, now = 0): void {
    const cam = this.camera;
    const right = cam.left + cam.viewW / cam.zoom;
    const bottom = cam.top + cam.viewH / cam.zoom;
    // Los edificios más altos sobresalen hacia arriba: se dibujan de arriba abajo para que se solapen bien.
    const visible = this.civ.buildings.filter((b) => b.alive && b.x + b.w >= cam.left && b.y + b.h >= cam.top - 3 && b.x <= right && b.y <= bottom);
    visible.sort((a, b) => a.y + a.h - (b.y + b.h) || a.id - b.id);
    // Primero todas las sombras (un solo color), para que ninguna tape a otro edificio.
    if (cam.zoom >= SPRITE_MIN_ZOOM) {
      ctx.fillStyle = SHADOW_COLOR;
      const off = SHADOW_OFFSET * cam.zoom;
      for (const b of visible) {
        if (b.type === BuildingType.FARM || b.level < 1) continue;
        const p = cam.worldToScreen(b.x, b.y);
        ctx.fillRect(Math.round(p.x + off), Math.round(p.y + off), Math.round(b.w * cam.zoom), Math.round(b.h * cam.zoom));
      }
    }
    for (const b of visible) {
      const p = cam.worldToScreen(b.x, b.y);
      const w = b.w * cam.zoom;
      const h = b.h * cam.zoom;
      if (b.type === BuildingType.FARM && b.level >= 1) this.drawFarm(ctx, b, p.x, p.y, w, h);
      else if (b.level >= 1) this.drawSprite(ctx, b, p.x, p.y, now);
      if (b.type === BuildingType.DOCK && b.level >= 1) this.drawPier(ctx, b);
      if (b.underConstruction) this.drawSite(ctx, b, p.x, p.y, w, h);
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, now: number): void {
    const race = this.civ.villages[b.village].race;
    const z = this.camera.zoom;
    if (z < SPRITE_MIN_ZOOM) {
      ctx.fillStyle = VILLAGE_COLORS[this.colorOfKingdom(this.civ.villages[b.village].kingdom)];
      ctx.fillRect(x, y, b.w * z, b.h * z);
      return;
    }
    const look = variantOf(b.id);
    const r = this.atlas.rect(race, b.type, b.level, look.variant, look.flip);
    if (!r) return;
    const scale = z / PX_PER_TILE;
    // El contorno sobresale 1 px de la huella, y el tejado, `top` píxeles por encima.
    const top = Math.round(y - (r.top + 1) * scale);
    const left = Math.round(x - scale);
    ctx.drawImage(this.atlas.canvas, r.sx, r.sy, r.w, r.h, left, top, Math.round(r.w * scale), Math.round(r.h * scale));
    if (z < CROP_MIN_ZOOM) return;
    if (b.type === BuildingType.HALL && b.level === 1) this.drawBonfire(ctx, left + BONFIRE_X * scale, top + BONFIRE_Y * scale, scale, now + b.id * 97);
    const v = this.civ.villages[b.village];
    if (b.type === BuildingType.HALL && b.level >= 2) this.drawBanner(ctx, x + (b.w * z) * 0.86, top + scale * 2, scale, VILLAGE_COLORS[this.colorOfKingdom(v.kingdom)], now + b.id * 131);
  }

  /** Llamas de la hoguera que cambian de cuadro (cada hoguera a su ritmo). */
  private drawBonfire(ctx: CanvasRenderingContext2D, cx: number, top: number, s: number, now: number): void {
    const rows = BONFIRE_FRAMES[Math.floor(now / 120) % BONFIRE_FRAMES.length];
    const x0 = cx - 2 * s;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        ctx.fillStyle = BONFIRE_COLORS[ch];
        ctx.fillRect(Math.round(x0 + x * s), Math.round(top + y * s), Math.ceil(s), Math.ceil(s));
      }
    }
  }

  /** Pasarela de tablones del muelle sobre su casilla de agua. */
  private drawPier(ctx: CanvasRenderingContext2D, b: Building): void {
    const water = dockWaterTile(this.world, b);
    if (water < 0) return;
    const z = this.camera.zoom;
    const p = this.camera.worldToScreen(water % this.world.width, Math.floor(water / this.world.width));
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(p.x + z * 0.1, p.y + z * 0.25, z * 0.8, z * 0.5);
    ctx.fillStyle = '#5a3a1a';
    for (let k = 0; k < 3; k++) ctx.fillRect(p.x + z * (0.15 + k * 0.27), p.y + z * 0.25, Math.max(1, z * 0.06), z * 0.5);
  }

  /** Bandera del reino en un mástil (ayuntamientos y fortalezas): ondea columna a columna. */
  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, now: number): void {
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(Math.round(x - s), Math.round(y - s), Math.round(3 * s), Math.round(12 * s));
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(s), Math.round(10 * s));
    const fold = FOLDS.get(color) ?? color;
    for (let c = 0; c < 6; c++) {
      // La onda crece hacia la punta (junto al mástil apenas se mueve).
      const wave = Math.round(Math.sin(now / 260 - c * 0.9) * Math.min(1, c / 3)) * s;
      const cx = Math.round(x + (c + 1) * s);
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(cx, Math.round(y - s + wave), Math.ceil(s) + (c === 5 ? Math.ceil(s) : 0), Math.round(6 * s));
      ctx.fillStyle = c % 2 === 0 ? fold : color;
      ctx.fillRect(cx, Math.round(y + wave), Math.ceil(s), Math.round(4 * s));
    }
  }

  private drawFarm(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number): void {
    if (this.camera.zoom >= CROP_MIN_ZOOM) return this.drawCrops(ctx, b, x, y);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x, y, w, h);
    const g = b.growth / FARM_RIPE;
    ctx.fillStyle = g >= 1 ? '#f0d060' : g > 0.7 ? '#d8c050' : g > 0.3 ? '#62ab3b' : '#8aa04a';
    const rows = b.h * 2;
    const rowH = h / rows;
    const crop = Math.max(1, rowH * (0.3 + g * 0.4));
    for (let k = 0; k < rows; k++) ctx.fillRect(x + w * 0.08, y + k * rowH + (rowH - crop) / 2, w * 0.84, crop);
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = Math.max(1, this.camera.zoom * 0.15);
    ctx.strokeRect(x, y, w, h);
  }

/** Granja de cerca: valla, surcos y plantas que crecen hasta espigar (doradas al madurar). */
  private drawCrops(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number): void {
    const s = this.camera.zoom / PX_PER_TILE;
    const w = b.w * PX_PER_TILE;
    const h = b.h * PX_PER_TILE;
    const px = (dx: number, dy: number, ww: number, hh: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.ceil(ww * s), Math.ceil(hh * s));
    };
    px(0, 0, w, h, '#6b4a2a');
    for (let r = 1; r < h; r += 4) px(1, r, w - 2, 1, '#55381f');
    const g = b.growth / FARM_RIPE;
    const ripe = g >= 1;
    const tall = ripe ? 5 : g > 0.6 ? 4 : g > 0.25 ? 2 : 1;
    const stem = ripe ? '#c9a23a' : '#4f9a35';
    for (let r = 4; r < h; r += 4) {
      for (let c = 2; c < w - 1; c += 3) {
        px(c, r - tall, 1, tall, stem);
        if (ripe) px(c - 0.5, r - tall - 1, 2, 2, '#f0d060');
        else if (tall >= 4) px(c + 1, r - tall + 1, 1, 1, '#62ab3b');
      }
    }
    // Valla de madera.
    px(0, 0, w, 1, '#8a5a2a');
    px(0, h - 1, w, 1, '#8a5a2a');
    px(0, 0, 1, h, '#8a5a2a');
    px(w - 1, 0, 1, h, '#8a5a2a');
    for (let k = 0; k < w; k += 4) {
      px(k, 0, 1, 1, '#4a3220');
      px(k, h - 1, 1, 1, '#4a3220');
    }
  }

  /** Obra: solar de tierra, andamio de postes y tablones (que sube con el progreso) y barra de progreso. */
  private drawSite(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number): void {
    const needed = BUILDING_DEFS[b.type].work[b.level] || 1;
    const done = Math.min(1, b.progress / needed);
    const z = this.camera.zoom;
    if (b.level === 0) {
      ctx.fillStyle = 'rgba(138,90,42,0.45)';
      ctx.fillRect(x, y, w, h);
    }
    if (z < SPRITE_MIN_ZOOM) {
      ctx.strokeStyle = '#c08a4a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      return;
    }
    // Postes en las esquinas (y uno en medio si es ancho) que crecen con la obra.
    const pole = Math.max(1, Math.round(z * 0.14));
    const rise = h * (0.5 + done * 0.7);
    const posts = b.w >= 3 ? [0, 0.5, 1] : [0, 1];
    ctx.fillStyle = '#7a5228';
    for (const f of posts) ctx.fillRect(Math.round(x + f * (w - pole)), Math.round(y + h - rise), pole, Math.round(rise));
    // Tablones horizontales cada media casilla de altura.
    ctx.fillStyle = '#c08a4a';
    const plank = Math.max(1, Math.round(z * 0.12));
    for (let yy = y + h - z * 0.5; yy > y + h - rise; yy -= z * 0.55) ctx.fillRect(Math.round(x - pole), Math.round(yy), Math.round(w + pole * 2), plank);
    // Una riostra en diagonal.
    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = Math.max(1, z * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h - rise);
    ctx.stroke();
    const barH = Math.max(2, z * 0.35);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y + h + 1, w, barH);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(x, y + h + 1, w * Math.min(1, b.progress / needed), barH);
  }

  /** Corona pixelada de las capitales. */
  private drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
    const p = s / 5;
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(x - p, y - p, s + p * 2, s * 0.8 + p * 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + p * 2, s, p * 2);
    for (const k of [0, 2, 4]) ctx.fillRect(x + k * p, y, p, p * 2);
  }

  /** Barra de conquista (color del reino atacante). */
  private drawCaptureBar(ctx: CanvasRenderingContext2D, cx: number, y: number, progress: number, color: string): void {
    const w = 40;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, (w * Math.min(100, progress)) / 100, 4);
  }

  drawLabels(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    if (cam.zoom < LABEL_MIN_ZOOM) return;
    const size = Math.round(Math.min(16, Math.max(11, cam.zoom * 2.2)));
    ctx.font = `600 ${size}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const v of this.civ.villages) {
      if (!v.alive) continue;
      const hall = this.civ.building(v.hallId);
      if (!hall) continue;
      const p = cam.worldToScreen(hall.x + hall.w / 2, hall.y);
      if (p.x < -100 || p.y < -20 || p.x > cam.viewW + 100 || p.y > cam.viewH + 40) continue;
      const text = `${v.name} · ${v.population}`;
      // Por encima del tejado (el ayuntamiento sobresale más que la hoguera).
      const ty = p.y - cam.zoom * (hall.level >= 2 ? 2.4 : 0.9);
      const color = VILLAGE_COLORS[this.colorOfKingdom(v.kingdom)];
      const K = v.kingdom >= 0 ? this.civ.kingdoms.kingdoms[v.kingdom] : null;
      const capital = K !== null && K.capital === v.id;
      const tw = ctx.measureText(text).width;
      const pad = Math.round(size * 0.45);
      const crownW = capital ? size + 2 : 0;
      const pw = tw + pad * 2 + crownW;
      const ph = size + 6;
      const px = Math.round(p.x - pw / 2);
      const py = Math.round(ty - ph + 3);
      // Placa: fondo oscuro con el borde del color del reino.
      ctx.fillStyle = 'rgba(26,20,16,0.82)';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = color;
      ctx.fillRect(px, py, pw, 2);
      ctx.fillRect(px, py + ph - 2, pw, 2);
      ctx.fillRect(px, py, 2, ph);
      ctx.fillRect(px + pw - 2, py, 2, ph);
      ctx.fillStyle = '#f3e6c8';
      ctx.fillText(text, p.x + crownW / 2, ty);
      if (capital) this.drawCrown(ctx, px + pad - 1, py + Math.round(ph * 0.22), size * 0.8, color);
      if (v.captureProgress > 0 && v.captureBy >= 0) this.drawCaptureBar(ctx, p.x, ty + 7, v.captureProgress, VILLAGE_COLORS[this.colorOfKingdom(v.captureBy)]);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
