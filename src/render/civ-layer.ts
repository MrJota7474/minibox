import type { CivSystem } from '../civ/civ-system';
import { BUILDING_DEFS, BuildingType, FARM_RIPE, VILLAGE_COLORS, type Building } from '../civ/model';
import { ZONE_SIZE, type World } from '../world/world';
import { dockWaterTile } from '../civ/boats';
import type { Camera } from './camera';
import { BUILDING_PX, buildBuildingAtlas, type BuildingAtlas } from './building-art';

const TERRITORY_ALPHA = 0.12;
const LABEL_MIN_ZOOM = 2.5;
const SPRITE_MIN_ZOOM = 2;
const PX_PER_TILE = BUILDING_PX;
/** Desde este zoom las granjas se dibujan surco a surco, con sus plantas. */
const CROP_MIN_ZOOM = 6;

function rgba(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

const FILLS = VILLAGE_COLORS.map((c) => rgba(c, TERRITORY_ALPHA));
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

  drawBuildings(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    const right = cam.left + cam.viewW / cam.zoom;
    const bottom = cam.top + cam.viewH / cam.zoom;
    // Los edificios más altos sobresalen hacia arriba: se dibujan de arriba abajo para que se solapen bien.
    const visible = this.civ.buildings.filter((b) => b.alive && b.x + b.w >= cam.left && b.y + b.h >= cam.top - 3 && b.x <= right && b.y <= bottom);
    visible.sort((a, b) => a.y + a.h - (b.y + b.h) || a.id - b.id);
    for (const b of visible) {
      const p = cam.worldToScreen(b.x, b.y);
      const w = b.w * cam.zoom;
      const h = b.h * cam.zoom;
      if (b.type === BuildingType.FARM && b.level >= 1) this.drawFarm(ctx, b, p.x, p.y, w, h);
      else if (b.level >= 1) this.drawSprite(ctx, b, p.x, p.y);
      if (b.type === BuildingType.DOCK && b.level >= 1) this.drawPier(ctx, b);
      if (b.underConstruction) this.drawSite(ctx, b, p.x, p.y, w, h);
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number): void {
    const race = this.civ.villages[b.village].race;
    const z = this.camera.zoom;
    if (z < SPRITE_MIN_ZOOM) {
      ctx.fillStyle = VILLAGE_COLORS[this.colorOfKingdom(this.civ.villages[b.village].kingdom)];
      ctx.fillRect(x, y, b.w * z, b.h * z);
      return;
    }
    const r = this.atlas.rect(race, b.type, b.level);
    if (!r) return;
    const scale = z / PX_PER_TILE;
    // El contorno sobresale 1 px de la huella, y el tejado, `top` píxeles por encima.
    const top = Math.round(y - (r.top + 1) * scale);
    ctx.drawImage(this.atlas.canvas, r.sx, r.sy, r.w, r.h, Math.round(x - scale), top, Math.round(r.w * scale), Math.round(r.h * scale));
    const v = this.civ.villages[b.village];
    if (b.type === BuildingType.HALL && b.level >= 2 && z >= CROP_MIN_ZOOM) this.drawBanner(ctx, x + (b.w * z) * 0.86, top + scale * 2, scale, VILLAGE_COLORS[this.colorOfKingdom(v.kingdom)]);
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

/** Bandera del reino en un mástil (ayuntamientos y fortalezas). */
  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(Math.round(x - s), Math.round(y - s), Math.round(3 * s), Math.round(12 * s));
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(s), Math.round(10 * s));
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(Math.round(x + s), Math.round(y - s), Math.round(7 * s), Math.round(6 * s));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + s), Math.round(y), Math.round(6 * s), Math.round(4 * s));
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

  /** Andamio de obra con barra de progreso. */
  private drawSite(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number): void {
    const needed = BUILDING_DEFS[b.type].work[b.level] || 1;
    const z = this.camera.zoom;
    ctx.strokeStyle = '#c08a4a';
    ctx.lineWidth = Math.max(1, z * 0.2);
    if (b.level === 0) {
      ctx.fillStyle = 'rgba(138,90,42,0.35)';
      ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
    }
    ctx.strokeRect(x, y, w, h);
    if (z < SPRITE_MIN_ZOOM) return;
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    for (const v of this.civ.villages) {
      if (!v.alive) continue;
      const hall = this.civ.building(v.hallId);
      if (!hall) continue;
      const p = cam.worldToScreen(hall.x + hall.w / 2, hall.y);
      if (p.x < -100 || p.y < -20 || p.x > cam.viewW + 100 || p.y > cam.viewH + 40) continue;
      const text = `${v.name} · ${v.population}`;
      const ty = p.y - cam.zoom * 0.6;
      const color = VILLAGE_COLORS[this.colorOfKingdom(v.kingdom)];
      ctx.strokeText(text, p.x, ty);
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, ty);
      const K = v.kingdom >= 0 ? this.civ.kingdoms.kingdoms[v.kingdom] : null;
      if (K && K.capital === v.id) this.drawCrown(ctx, p.x - ctx.measureText(text).width / 2 - size, ty - size * 0.75, size * 0.8, color);
      if (v.captureProgress > 0 && v.captureBy >= 0) this.drawCaptureBar(ctx, p.x, ty + 3, v.captureProgress, VILLAGE_COLORS[this.colorOfKingdom(v.captureBy)]);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
