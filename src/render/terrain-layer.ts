import { CHUNK_SIZE, type World } from '../world/world';
import { tileColor } from './palette';

/**
 * Textura del terreno a 1 píxel por casilla. Sólo se recolorean y suben
 * los chunks marcados como modificados.
 */
export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  /** Estación con la que se tiñe el mapa (al cambiar, se repinta entero). */
  season = 1;

  constructor(private readonly world: World) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    this.image = ctx.createImageData(world.width, world.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
  }

  /** Redibuja como mucho `budget` chunks pendientes (el resto, en los siguientes frames). */
  update(budget = Infinity): number {
    if (!this.world.hasDirtyChunks()) return 0;
    let count = 0;
    this.world.consumeDirtyChunks((cx, cy) => {
      this.paintChunk(cx, cy);
      count++;
    }, budget);
    return count;
  }

  private paintChunk(cx: number, cy: number): void {
    const w = this.world;
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(x0 + CHUNK_SIZE, w.width);
    const y1 = Math.min(y0 + CHUNK_SIZE, w.height);
    for (let y = y0; y < y1; y++) {
      let i = y * w.width + x0;
      for (let x = x0; x < x1; x++, i++) this.pixels[i] = tileColor(w, i, this.season);
    }
    this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
}
