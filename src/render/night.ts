import type { CivSystem } from '../civ/civ-system';
import { BuildingType } from '../civ/model';
import type { HazardSystem } from '../powers/hazards';
import type { World } from '../world/world';
import type { Camera } from './camera';

/** Oscuridad máxima en plena noche (0-1) y su color. */
const NIGHT_ALPHA = 0.6;
const NIGHT_RGB = '10,14,40';
/** Tamaño del halo precalculado (px). */
const GLOW_PX = 64;
/** Fuegos que se iluminan como mucho por fotograma. */
const MAX_FIRE_LIGHTS = 300;
/** Margen del velo de noche (más que el mayor temblor de la cámara). */
const SHAKE_PAD = 24;

/** Radio (en casillas) y fuerza de la luz de cada edificio de noche. */
function lightOf(type: number, level: number): { r: number; a: number } | null {
  if (type === BuildingType.HALL) return level <= 1 ? { r: 4.5, a: 0.9 } : { r: 3.5, a: 0.7 };
  if (type === BuildingType.HOUSE) return level >= 2 ? { r: 2, a: 0.55 } : { r: 1.3, a: 0.35 };
  if (type === BuildingType.SHRINE) return { r: 3, a: 0.7 };
  if (type === BuildingType.DOCK) return { r: 1.6, a: 0.4 };
  return null;
}

/** Halo cálido: degradado radial pintado una sola vez y reutilizado escalado. */
function buildGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GLOW_PX;
  c.height = GLOW_PX;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const g = ctx.createRadialGradient(GLOW_PX / 2, GLOW_PX / 2, 0, GLOW_PX / 2, GLOW_PX / 2, GLOW_PX / 2);
  g.addColorStop(0, 'rgba(255,200,120,0.9)');
  g.addColorStop(0.4, 'rgba(255,160,70,0.45)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GLOW_PX, GLOW_PX);
  return c;
}

/**
 * La noche: oscurece el mapa según la luz del momento y enciende hogueras, ventanas,
 * santuarios, muelles y fuegos. Es sólo dibujo (la luz la da world/daylight.ts).
 */
export class NightLayer {
  private readonly glow = buildGlow();

  constructor(
    private readonly world: World,
    private readonly civ: CivSystem,
    private readonly hazards: HazardSystem,
    private readonly camera: Camera,
  ) {}

  /** `light` va de 1 (día) a 0 (plena noche). */
  draw(ctx: CanvasRenderingContext2D, light: number): void {
    const dark = 1 - light;
    if (dark <= 0.01) return;
    const c = this.camera;
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${NIGHT_RGB},${dark * NIGHT_ALPHA})`;
    // Con margen: el temblor de la cámara desplaza el dibujo y no debe dejar bordes sin oscurecer.
    ctx.fillRect(-SHAKE_PAD, -SHAKE_PAD, c.viewW + SHAKE_PAD * 2, c.viewH + SHAKE_PAD * 2);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const right = c.left + c.viewW / c.zoom;
    const bottom = c.top + c.viewH / c.zoom;
    for (const b of this.civ.buildings) {
      if (!b.alive || b.level < 1 || b.underConstruction) continue;
      const l = lightOf(b.type, b.level);
      if (!l) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (cx + l.r < c.left || cy + l.r < c.top || cx - l.r > right || cy - l.r > bottom) continue;
      this.light(ctx, cx, cy, l.r, l.a * dark);
    }
    const fires = this.hazards.burningTiles();
    const w = this.world.width;
    for (let k = 0; k < fires.length && k < MAX_FIRE_LIGHTS; k++) {
      const x = (fires[k] % w) + 0.5;
      const y = Math.floor(fires[k] / w) + 0.5;
      if (x < c.left - 2 || y < c.top - 2 || x > right + 2 || y > bottom + 2) continue;
      this.light(ctx, x, y, 1.6, 0.6 * dark);
    }
    ctx.globalCompositeOperation = prev;
    ctx.globalAlpha = 1;
  }

  private light(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
    const c = this.camera;
    const size = r * 2 * c.zoom;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(this.glow, (x - c.left) * c.zoom - size / 2, (y - c.top) * c.zoom - size / 2, size, size);
  }
}
