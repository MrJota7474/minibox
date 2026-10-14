import { hashString } from '../core/rng';
import { tileColor } from '../render/palette';
import { generateWorld } from '../world/generator';

/**
 * Pinta en el canvas el terreno que saldrá con esa semilla y ese tamaño (1 píxel por
 * casilla), con el mismo generador que el juego: lo que se ve es el mundo que se creará.
 */
export function paintPreview(canvas: HTMLCanvasElement, seedText: string, size: number): void {
  const world = generateWorld(hashString(seedText), size, size);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(size, size);
  const pixels = new Uint32Array(image.data.buffer);
  for (let i = 0; i < world.size; i++) pixels[i] = tileColor(world, i);
  ctx.putImageData(image, 0, 0);
}
