/** Lienzo de píxeles con contorno automático: base de todo el pixel art generado por código. */
export const OUTLINE = '#1a1410';

type Color = string | null;

export class Pix {
  readonly data: Color[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Array<Color>(w * h).fill(null);
  }

  set(x: number, y: number, c: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  /** Elipse rellena (copas de árbol, rocas...). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.25);
        const dy = (y - cy) / (ry + 0.25);
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  get(x: number, y: number): Color {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : null;
  }

  /** Pinta en el canvas (opcionalmente espejado) añadiendo un contorno oscuro de 1 px. */
  paint(ctx: CanvasRenderingContext2D, ox: number, oy: number, flip = false, outline = OUTLINE): void {
    const px = (x: number): number => ox + (flip ? this.w - 1 - x : x);
    ctx.fillStyle = outline;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) ctx.fillRect(px(x), oy + y, 1, 1);
      }
    }
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(px(x), oy + y, 1, 1);
      }
    }
  }
}

/** Aclara (f > 1) u oscurece (f < 1) un color #rrggbb. */
export function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number): number => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Mezcla dos colores #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const va = parseInt(a.slice(1), 16);
  const vb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((va >> s) & 255) * (1 - t) + ((vb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Ruido determinista por posición (para variar dibujos sin tocar el azar de la simulación). */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2246822519, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
