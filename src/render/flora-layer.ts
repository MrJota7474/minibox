import { CHUNK_SIZE, type World } from '../world/world';
import type { Camera } from './camera';
import { Decor, FLORA_H, FLORA_W, type FloraAtlas } from './flora-art';
import { Biome, Flora, Terrain, isFertileTerrain } from '../world/terrain';
import { hash2 } from './pixel';

/** Píxeles de sprite por casilla en la caché (el tamaño nativo del pixel art). */
const PX = 12;
/** Margen alrededor del chunk: las copas sobresalen hacia arriba y a los lados. */
const MARGIN_X = 6;
const MARGIN_TOP = FLORA_H - PX + 4;
/** Chunks en caché como mínimo (cada uno ocupa ~0,6 MB); crece si la pantalla ve más. */
const MIN_CACHED = 48;
const CACHE_MARGIN = 12;
/** Chunks que se pueden repintar por frame (al alejar la cámara aparecen poco a poco). */
const RENDERS_PER_FRAME = 2;
export const FLORA_MIN_ZOOM = 7;
/** Desplazamiento máximo de cada planta dentro de su casilla (en píxeles del sprite). */
const JITTER_X = 7;
const JITTER_Y = 4;

/** Adorno del suelo de una casilla sin plantas (matas, flores, guijarros, juncos) o NONE. */
function decorFor(terrain: number, biome: number, r: number): number {
  if (terrain === Terrain.SAND) return r < 0.08 ? Decor.PEBBLES : Flora.NONE;
  if (!isFertileTerrain(terrain) || biome === Biome.DESERT || biome === Biome.BLIGHT) return Flora.NONE;
  if (biome === Biome.SWAMP) return r < 0.12 ? Decor.REEDS : Flora.NONE;
  if (r < 0.04 && biome !== Biome.SNOW) return Decor.FLOWERS;
  return r < 0.12 ? Decor.TUFT : Flora.NONE;
}

interface Entry {
  canvas: HTMLCanvasElement;
  season: number;
  sig: number;
}

/**
 * Árboles, arbustos y rocas con su dibujo. Cada chunk se pinta una vez en un canvas
 * (con márgenes para las copas) y sólo se repinta si cambian sus plantas o la estación.
 */
export class FloraLayer {
  private readonly cache = new Map<number, Entry>();
  /** Chunks cuyo terreno cambió: hay que comprobar si cambiaron sus plantas. */
  private readonly suspect = new Set<number>();

  constructor(
    private readonly world: World,
    private readonly atlas: FloraAtlas,
  ) {}

  /** Llamado al repintar un chunk del terreno. */
  touch(chunk: number): void {
    if (this.cache.has(chunk)) this.suspect.add(chunk);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, season: number): void {
    const z = cam.zoom;
    if (z < FLORA_MIN_ZOOM) return;
    const w = this.world;
    const cx0 = Math.max(0, Math.floor(cam.left / CHUNK_SIZE));
    const cy0 = Math.max(0, Math.floor(cam.top / CHUNK_SIZE));
    const cx1 = Math.min(w.chunksX - 1, Math.floor((cam.left + cam.viewW / z) / CHUNK_SIZE));
    // Una fila más abajo: sus copas pueden asomar por arriba.
    const cy1 = Math.min(w.chunksY - 1, Math.floor((cam.top + cam.viewH / z) / CHUNK_SIZE) + 1);
    const scale = z / PX;
    // Al reducir, mejor suavizado que pixel art «roto».
    const smooth = scale < 1;
    if (smooth) ctx.imageSmoothingEnabled = true;
    let budget = RENDERS_PER_FRAME;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * w.chunksX + cx;
        let entry = this.cache.get(c);
        const stale = !entry || entry.season !== season || this.suspect.has(c);
        // Sin presupuesto este frame: se dibuja lo que haya (aunque sea de la estación anterior)
        // y sigue pendiente; se repintará en los siguientes frames.
        if (stale && budget > 0) {
          const sig = this.signature(cx, cy);
          this.suspect.delete(c);
          if (!entry || entry.season !== season || entry.sig !== sig) {
            budget--;
            entry = this.render(cx, cy, season, sig, entry);
          }
        }
        if (!entry) continue;
        // Al usarlo pasa al final (los primeros son los menos usados).
        this.cache.delete(c);
        this.cache.set(c, entry);
        const p = cam.worldToScreen(cx * CHUNK_SIZE, cy * CHUNK_SIZE);
        ctx.drawImage(
          entry.canvas,
          Math.round(p.x - MARGIN_X * scale),
          Math.round(p.y - MARGIN_TOP * scale),
          Math.round(entry.canvas.width * scale),
          Math.round(entry.canvas.height * scale),
        );
      }
    }
    if (smooth) ctx.imageSmoothingEnabled = false;
    this.evict(Math.max(MIN_CACHED, (cx1 - cx0 + 1) * (cy1 - cy0 + 1) + CACHE_MARGIN));
  }

  /** Resumen de las plantas y biomas del chunk (si no cambia, no hace falta repintar). */
  private signature(cx: number, cy: number): number {
    const w = this.world;
    let h = 0;
    const x1 = Math.min(w.width, (cx + 1) * CHUNK_SIZE);
    const y1 = Math.min(w.height, (cy + 1) * CHUNK_SIZE);
    for (let y = cy * CHUNK_SIZE; y < y1; y++) {
      for (let x = cx * CHUNK_SIZE; x < x1; x++) {
        const i = y * w.width + x;
        // Plantas, bioma, capa de terreno (la decoración depende de ella) y edificios.
        const v = w.flora[i] | (w.biome[i] << 4) | (w.terrain[i] << 8) | (w.buildingAt[i] !== 0 ? 1 << 12 : 0);
        h = (Math.imul(h ^ v, 0x9e3779b1) + i) | 0;
      }
    }
    return h;
  }

  private render(cx: number, cy: number, season: number, sig: number, reuse: Entry | undefined): Entry {
    const canvas = reuse?.canvas ?? document.createElement('canvas');
    canvas.width = CHUNK_SIZE * PX + MARGIN_X * 2;
    canvas.height = CHUNK_SIZE * PX + MARGIN_TOP;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { canvas, season, sig };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = this.world;
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    for (let ty = y0; ty < Math.min(w.height, y0 + CHUNK_SIZE); ty++) {
      for (let tx = x0; tx < Math.min(w.width, x0 + CHUNK_SIZE); tx++) {
        const i = ty * w.width + tx;
        if (w.buildingAt[i] !== 0) continue;
        const f = w.flora[i] !== Flora.NONE ? w.flora[i] : decorFor(w.terrain[i], w.biome[i], hash2(tx, ty, 11));
        if (f === Flora.NONE) continue;
        const cell = this.atlas.cell(f, w.biome[i], season, hash2(tx, ty) < 0.5 ? 0 : 1);
        if (!cell) continue;
        // Desplazamiento propio de cada planta (en los dos ejes) y espejo al azar: así los
        // bosques no se ven en filas ni con todos los árboles iguales.
        const jx = Math.round((hash2(tx, ty, 7) - 0.5) * JITTER_X);
        // Sólo hacia arriba: hacia abajo se saldría del lienzo del chunk y se cortaría el tronco.
        const jy = -Math.round(hash2(tx, ty, 9) * JITTER_Y);
        const dx = Math.round(MARGIN_X + (tx - x0) * PX + (PX - FLORA_W) / 2 + jx);
        const dy = MARGIN_TOP + (ty - y0 + 1) * PX - FLORA_H + 1 + jy;
        if (hash2(tx, ty, 13) < 0.5) {
          ctx.drawImage(this.atlas.canvas, cell.sx, cell.sy, FLORA_W, FLORA_H, dx, dy, FLORA_W, FLORA_H);
        } else {
          ctx.save();
          ctx.translate(dx + FLORA_W, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(this.atlas.canvas, cell.sx, cell.sy, FLORA_W, FLORA_H, 0, 0, FLORA_W, FLORA_H);
          ctx.restore();
        }
      }
    }
    return { canvas, season, sig };
  }

  private evict(max: number): void {
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
      this.suspect.delete(oldest);
    }
  }
}
