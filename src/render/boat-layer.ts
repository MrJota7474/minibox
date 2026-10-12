import { BoatKind, BoatState, type Boat } from '../civ/boats';
import type { CivSystem } from '../civ/civ-system';
import { VILLAGE_COLORS } from '../civ/model';
import type { Camera } from './camera';
import { drawPixelArt } from './sprites';

/** Pixel art original de los barcos (mirando a la derecha; 3,5 px por casilla). */
const SETTLER_BOAT = ['....f.....', '....mf....', '....mss...', '....msss..', '....mssss.', 'hhhhhhhhhh', '.hhhhhhhh.', '..hhhhhh..'];
const WAR_BOAT = ['...ff.....', '...mff....', '...msssss.', '...mskkss.', '...msssss.', 'hhhhhhhhhh', 'hdhdhdhdhh', '.hhhhhhhh.'];
const PX_PER_TILE = 3.5;
const CELL_W = 12;
const CELL_H = 10;
/** Por debajo de este zoom los barcos se dibujan como un rectángulo. */
const SPRITE_MIN_ZOOM = 2.5;
const HULL = { h: '#6a4220', d: '#3a2410', m: '#4a3018', k: '#1a1410' };

/** Atlas de barcos: una fila por color de reino y una columna por tipo. */
function buildAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * 2;
  canvas.height = CELL_H * VILLAGE_COLORS.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  VILLAGE_COLORS.forEach((color, row) => {
    drawPixelArt(ctx, SETTLER_BOAT, { ...HULL, s: '#f2ead8', f: color }, 0, row * CELL_H);
    drawPixelArt(ctx, WAR_BOAT, { ...HULL, s: color, f: '#d2405e' }, CELL_W, row * CELL_H);
  });
  return canvas;
}

/** Dibuja los barcos con su posición interpolada y una estela cuando navegan. */
export class BoatLayer {
  private readonly atlas = buildAtlas();

  constructor(
    private readonly civ: CivSystem,
    private readonly camera: Camera,
  ) {}

  private colorIndex(b: Boat): number {
    const K = b.kingdom >= 0 ? this.civ.kingdoms.kingdoms[b.kingdom] : null;
    return K ? K.colorIndex : this.civ.villages[b.village].colorIndex;
  }

  /** Posición interpolada (en casillas) de un barco. */
  static position(b: Boat, alpha: number): { x: number; y: number } {
    return { x: b.px + (b.x - b.px) * alpha, y: b.py + (b.y - b.py) * alpha };
  }

  draw(ctx: CanvasRenderingContext2D, alpha: number): void {
    const cam = this.camera;
    const z = cam.zoom;
    for (const b of this.civ.boats) {
      if (!b.alive) continue;
      const pos = BoatLayer.position(b, alpha);
      const p = cam.worldToScreen(pos.x, pos.y);
      if (p.x < -40 || p.y < -40 || p.x > cam.viewW + 40 || p.y > cam.viewH + 40) continue;
      const color = this.colorIndex(b);
      if (z < SPRITE_MIN_ZOOM) {
        ctx.fillStyle = VILLAGE_COLORS[color];
        ctx.fillRect(p.x - z, p.y - z * 0.5, z * 2, z);
        continue;
      }
      const scale = z / PX_PER_TILE;
      if (b.state !== BoatState.BOARDING) this.drawWake(ctx, p.x, p.y, b.dir, z);
      const w = CELL_W * scale;
      const h = CELL_H * scale;
      const sx = b.kind === BoatKind.WAR ? CELL_W : 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (b.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(this.atlas, sx, color * CELL_H, CELL_W, CELL_H, -w / 2, -h * 0.75, w, h);
      ctx.restore();
    }
  }

  private drawWake(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, z: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const back = -dir;
    for (let k = 1; k <= 3; k++) {
      const s = Math.max(1, z * 0.18);
      ctx.fillRect(x + back * z * (0.9 + k * 0.45), y + z * 0.1 - k * s * 0.6, s, s);
      ctx.fillRect(x + back * z * (0.9 + k * 0.45), y + z * 0.1 + k * s * 0.6, s, s);
    }
  }
}
