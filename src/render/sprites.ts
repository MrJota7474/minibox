/**
 * Plantillas de pixel art como cuadrículas de texto (edificios, barcos), dibujadas con
 * un contorno oscuro de 1 px. Las criaturas se componen por partes en creature-art.ts.
 */
type Template = readonly string[];

const OUTLINE = '#1a1410';

/** Dibuja una plantilla de pixel art con contorno oscuro de 1 px. */
export function drawPixelArt(ctx: CanvasRenderingContext2D, t: Template, colors: Readonly<Record<string, string>>, ox: number, oy: number, flip = false): void {
  const h = t.length;
  const w = t[0].length;
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && t[y][x] !== '.';
  const px = (x: number): number => ox + 1 + (flip ? w - 1 - x : x);

  ctx.fillStyle = OUTLINE;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (filled(x, y)) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) {
        ctx.fillRect(px(x), oy + 1 + y, 1, 1);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = t[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = colors[ch] ?? OUTLINE;
      ctx.fillRect(px(x), oy + 1 + y, 1, 1);
    }
  }
}
