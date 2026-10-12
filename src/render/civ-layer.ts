import type { CivSystem } from '../civ/civ-system';
import { BUILDING_DEFS, BuildingType, FARM_RIPE, VILLAGE_COLORS, type Building } from '../civ/model';
import { ZONE_SIZE, type World } from '../world/world';
import type { Camera } from './camera';
import { buildBuildingAtlas, type BuildingAtlas } from './civ-sprites';

const TERRITORY_ALPHA = 0.12;
const LABEL_MIN_ZOOM = 2.5;
const SPRITE_MIN_ZOOM = 2;
const PX_PER_TILE = 4;

function rgba(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

const FILLS = VILLAGE_COLORS.map((c) => rgba(c, TERRITORY_ALPHA));
const BORDERS = VILLAGE_COLORS.map((c) => rgba(c, 0.85));

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
        const color = this.civ.villages[owner - 1].colorIndex;
        const p = cam.worldToScreen(zx * ZONE_SIZE, zy * ZONE_SIZE);
        ctx.fillStyle = FILLS[color];
        ctx.fillRect(p.x, p.y, z, z);
        ctx.strokeStyle = BORDERS[color];
        ctx.beginPath();
        const h = line / 2;
        if (zx === 0 || w.zoneOwner[zy * w.zonesX + zx - 1] !== owner) this.edge(ctx, p.x + h, p.y, p.x + h, p.y + z);
        if (zx === w.zonesX - 1 || w.zoneOwner[zy * w.zonesX + zx + 1] !== owner) this.edge(ctx, p.x + z - h, p.y, p.x + z - h, p.y + z);
        if (zy === 0 || w.zoneOwner[(zy - 1) * w.zonesX + zx] !== owner) this.edge(ctx, p.x, p.y + h, p.x + z, p.y + h);
        if (zy === w.zonesY - 1 || w.zoneOwner[(zy + 1) * w.zonesX + zx] !== owner) this.edge(ctx, p.x, p.y + z - h, p.x + z, p.y + z - h);
        ctx.stroke();
      }
    }
  }

  private edge(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }

  drawBuildings(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    const right = cam.left + cam.viewW / cam.zoom;
    const bottom = cam.top + cam.viewH / cam.zoom;
    for (const b of this.civ.buildings) {
      if (!b.alive || b.x + b.w < cam.left || b.y + b.h < cam.top || b.x > right || b.y > bottom) continue;
      const p = cam.worldToScreen(b.x, b.y);
      const w = b.w * cam.zoom;
      const h = b.h * cam.zoom;
      if (b.type === BuildingType.FARM && b.level >= 1) this.drawFarm(ctx, b, p.x, p.y, w, h);
      else if (b.level >= 1) this.drawSprite(ctx, b, p.x, p.y);
      if (b.underConstruction) this.drawSite(ctx, b, p.x, p.y, w, h);
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number): void {
    const race = this.civ.villages[b.village].race;
    const z = this.camera.zoom;
    if (z < SPRITE_MIN_ZOOM) {
      ctx.fillStyle = VILLAGE_COLORS[this.civ.villages[b.village].colorIndex];
      ctx.fillRect(x, y, b.w * z, b.h * z);
      return;
    }
    const r = this.atlas.rect(race, b.type, b.level);
    if (!r) return;
    const scale = z / PX_PER_TILE;
    // El contorno sobresale 1 px de la huella del edificio.
    ctx.drawImage(this.atlas.canvas, r.sx, r.sy, r.w, r.h, x - scale, y - scale, r.w * scale, r.h * scale);
  }

  private drawFarm(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, w: number, h: number): void {
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
      ctx.strokeText(text, p.x, p.y - cam.zoom * 0.6);
      ctx.fillStyle = VILLAGE_COLORS[v.colorIndex];
      ctx.fillText(text, p.x, p.y - cam.zoom * 0.6);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
