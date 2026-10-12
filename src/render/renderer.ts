import type { CivSystem } from '../civ/civ-system';
import { RESOURCE_COLORS } from '../civ/model';
import { SPECIES } from '../entities/species';
import type { UnitStore } from '../entities/units';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { BACKGROUND } from './palette';
import { CivLayer } from './civ-layer';
import { buildSpriteAtlas, type SpriteAtlas } from './sprites';
import { TerrainLayer } from './terrain-layer';

export interface Overlay {
  /** Pincel bajo el cursor (en casillas). */
  brush: { x: number; y: number; size: number } | null;
  /** Índice de la criatura seleccionada o -1. */
  selected: number;
  /** Casilla inspeccionada o -1. */
  selectedTile: number;
}

/** Por debajo de este zoom las criaturas se dibujan como puntos. */
const SPRITE_MIN_ZOOM = 5;
const SPRITE_ZOOM_DIVISOR = 6;

/** Render en Canvas 2D (aislado tras esta clase para poder cambiarlo a WebGL). */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain: TerrainLayer;
  readonly atlas: SpriteAtlas;
  private dpr = 1;
  private dprCap: number;
  private readonly speciesColors: string[];
  private readonly adultTicks: number[];
  private readonly civLayer: CivLayer;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly units: UnitStore,
    private readonly camera: Camera,
    civ: CivSystem,
    dprCap: number,
    atlas?: SpriteAtlas,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    this.terrain = new TerrainLayer(world);
    this.atlas = atlas ?? buildSpriteAtlas();
    this.dprCap = dprCap;
    this.speciesColors = SPECIES.map((s) => s.color);
    this.adultTicks = SPECIES.map((s) => s.adultTicks);
    this.civLayer = new CivLayer(world, civ, camera);
  }

  getDprCap(): number {
    return this.dprCap;
  }

  setDprCap(cap: number): void {
    this.dprCap = cap;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.camera.setViewport(rect.width, rect.height);
  }

  draw(alpha: number, tick: number, overlay: Overlay): void {
    this.terrain.update();
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    this.drawTerrain();
    this.civLayer.drawTerritory(ctx);
    this.civLayer.drawBuildings(ctx);
    if (overlay.selectedTile >= 0) this.drawTileMarker(overlay.selectedTile);
    this.drawUnits(alpha, tick);
    this.civLayer.drawLabels(ctx);
    if (overlay.selected >= 0) this.drawSelection(overlay.selected, alpha);
    if (overlay.brush) this.drawBrush(overlay.brush.x, overlay.brush.y, overlay.brush.size);
  }

  private drawTerrain(): void {
    const cam = this.camera;
    const x0 = Math.max(0, Math.floor(cam.left));
    const y0 = Math.max(0, Math.floor(cam.top));
    const x1 = Math.min(this.world.width, Math.ceil(cam.left + cam.viewW / cam.zoom) + 1);
    const y1 = Math.min(this.world.height, Math.ceil(cam.top + cam.viewH / cam.zoom) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    const s = cam.worldToScreen(x0, y0);
    this.ctx.drawImage(this.terrain.canvas, x0, y0, x1 - x0, y1 - y0, s.x, s.y, (x1 - x0) * cam.zoom, (y1 - y0) * cam.zoom);
  }

  private drawUnits(alpha: number, tick: number): void {
    const u = this.units;
    const cam = this.camera;
    const z = cam.zoom;
    const left = cam.left;
    const top = cam.top;
    const right = left + cam.viewW / z;
    const bottom = top + cam.viewH / z;
    if (z < SPRITE_MIN_ZOOM) {
      this.drawDots(alpha, left, top, right, bottom);
      return;
    }
    const scale = Math.max(1, Math.round(z / SPRITE_ZOOM_DIVISOR));
    const ctx = this.ctx;
    const atlas = this.atlas;

    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0) continue;
      const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
      const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
      if (wx < left - 2 || wy < top - 2 || wx > right + 2 || wy > bottom + 2) continue;
      const sx = (wx - left) * z;
      const sy = (wy - top) * z;
      const sp = u.species[i];
      const size = atlas.sizes[sp];
      const moving = u.x[i] !== u.px[i] || u.y[i] !== u.py[i];
      const frame = moving ? ((tick >> 1) + i) & 1 : 0;
      const flip = u.x[i] < u.px[i] || (!moving && u.tx[i] < u.x[i]) ? 1 : 0;
      // Las crías se dibujan un escalón más pequeñas.
      const s = u.age[i] < this.adultTicks[sp] && scale > 1 ? scale - 1 : scale;
      const w = size.w * s;
      const h = size.h * s;
      const spriteTop = Math.round(sy - h + s * 2);
      ctx.drawImage(atlas.canvas, (frame * 2 + flip) * atlas.cellW, sp * atlas.cellH, size.w, size.h, Math.round(sx - w / 2), spriteTop, w, h);
      // Carga que lleva un aldeano (madera, piedra, comida...) sobre la cabeza.
      if (u.carry[i] !== 0) {
        ctx.fillStyle = RESOURCE_COLORS[u.carry[i] - 1];
        ctx.fillRect(Math.round(sx - s * 1.5), spriteTop - s * 2, s * 3, s * 2);
      }
    }
  }

  /** Zoom alejado: puntos agrupados por especie (un solo cambio de color por especie). */
  private drawDots(alpha: number, left: number, top: number, right: number, bottom: number): void {
    const u = this.units;
    const z = this.camera.zoom;
    const dot = Math.max(1.5, z * 0.9);
    const ctx = this.ctx;
    for (let sp = 0; sp < this.speciesColors.length; sp++) {
      ctx.fillStyle = this.speciesColors[sp];
      for (let i = 0; i < u.highWater; i++) {
        if (u.alive[i] === 0 || u.species[i] !== sp) continue;
        const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
        const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
        if (wx < left || wy < top || wx > right || wy > bottom) continue;
        ctx.fillRect((wx - left) * z - dot / 2, (wy - top) * z - dot / 2, dot, dot);
      }
    }
  }

  private drawSelection(i: number, alpha: number): void {
    const u = this.units;
    if (!u.isAlive(i)) return;
    const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
    const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
    const p = this.camera.worldToScreen(wx, wy);
    const r = Math.max(6, this.camera.zoom * 1.2);
    this.ctx.strokeStyle = '#f2c14e';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + 1, r, r * 0.55, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private drawTileMarker(tile: number): void {
    const x = tile % this.world.width;
    const y = Math.floor(tile / this.world.width);
    const p = this.camera.worldToScreen(x, y);
    const z = Math.max(this.camera.zoom, 3);
    this.ctx.strokeStyle = '#f2c14e';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(p.x - 1, p.y - 1, z + 2, z + 2);
  }

  private drawBrush(tx: number, ty: number, size: number): void {
    const p = this.camera.worldToScreen(tx + 0.5, ty + 0.5);
    const r = Math.max(3, (size / 2) * this.camera.zoom);
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,214,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
