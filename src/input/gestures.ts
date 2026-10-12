/**
 * Reconocedor de gestos independiente del DOM (testeable).
 * Regla clave en táctil: un dedo pinta sólo tras un breve retraso o desplazamiento;
 * si llega un segundo dedo antes, no se pinta nada y pasa a pellizco/desplazamiento.
 */
export type InputMode = 'paint' | 'pan';

export type GestureEvent =
  | { readonly type: 'stroke-start'; readonly x: number; readonly y: number }
  | { readonly type: 'stroke-move'; readonly x: number; readonly y: number }
  | { readonly type: 'stroke-end' }
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly type: 'zoom'; readonly factor: number; readonly x: number; readonly y: number }
  | { readonly type: 'tap'; readonly x: number; readonly y: number }
  | { readonly type: 'hover'; readonly x: number; readonly y: number };

export interface PointerSample {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly touch: boolean;
  /** 0 = principal, 1 = central, 2 = secundario. */
  readonly button: number;
}

export const TOUCH_PAINT_DELAY_MS = 80;
export const TOUCH_PAINT_SLOP_PX = 6;
export const TAP_MAX_MS = 350;
export const TAP_SLOP_PX = 10;

type Phase = 'idle' | 'pending' | 'stroke' | 'pan' | 'pinch';

interface Pos {
  x: number;
  y: number;
}

function dist(a: Pos, b: Pos): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class GestureRecognizer {
  /** 'paint' si la herramienta activa actúa sobre el mapa; 'pan' para mover/inspeccionar. */
  mode: InputMode = 'pan';
  /** Modificador temporal (barra espaciadora) que fuerza el desplazamiento. */
  panModifier = false;

  private phase: Phase = 'idle';
  private readonly pointers = new Map<number, Pos>();
  private primaryId = -1;
  private start: Pos & { time: number } = { x: 0, y: 0, time: 0 };
  private tapCandidate = false;
  private pinchDist = 0;
  private pinchCenter: Pos = { x: 0, y: 0 };
  private lastTouch = false;

  get isStroking(): boolean {
    return this.phase === 'stroke';
  }

  get activePointers(): number {
    return this.pointers.size;
  }

  /** true si el último puntero que pulsó era táctil (para no dejar el pincel dibujado al levantar el dedo). */
  get lastInputTouch(): boolean {
    return this.lastTouch;
  }

  /** Olvida todos los punteros (pérdida de foco, cambio de app...). Cierra el trazo si lo había. */
  reset(): GestureEvent[] {
    const out: GestureEvent[] = this.phase === 'stroke' ? [{ type: 'stroke-end' }] : [];
    this.pointers.clear();
    this.phase = 'idle';
    this.tapCandidate = false;
    return out;
  }

  down(p: PointerSample): GestureEvent[] {
    this.lastTouch = p.touch;
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 1) return this.firstDown(p);
    if (this.pointers.size === 2) {
      const out: GestureEvent[] = [];
      if (this.phase === 'stroke') out.push({ type: 'stroke-end' });
      this.phase = 'pinch';
      this.tapCandidate = false;
      this.resetPinch();
      return out;
    }
    return [];
  }

  private firstDown(p: PointerSample): GestureEvent[] {
    this.primaryId = p.id;
    this.start = { x: p.x, y: p.y, time: p.time };
    if (!p.touch && p.button !== 0) {
      this.phase = 'pan';
      this.tapCandidate = false;
      return [];
    }
    if (this.mode === 'paint' && !this.panModifier) {
      if (p.touch) {
        this.phase = 'pending';
        return [];
      }
      this.phase = 'stroke';
      return [{ type: 'stroke-start', x: p.x, y: p.y }];
    }
    this.phase = 'pan';
    this.tapCandidate = true;
    return [];
  }

  move(p: PointerSample): GestureEvent[] {
    const prev = this.pointers.get(p.id);
    if (!prev) return p.touch ? [] : [{ type: 'hover', x: p.x, y: p.y }];
    const out: GestureEvent[] = [];
    switch (this.phase) {
      case 'pending':
        if (dist(this.start, p) > TOUCH_PAINT_SLOP_PX) {
          this.phase = 'stroke';
          out.push({ type: 'stroke-start', x: this.start.x, y: this.start.y }, { type: 'stroke-move', x: p.x, y: p.y });
        }
        break;
      case 'stroke':
        if (p.id === this.primaryId) out.push({ type: 'stroke-move', x: p.x, y: p.y });
        break;
      case 'pan':
        if (p.id === this.primaryId) {
          out.push({ type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y });
          if (dist(this.start, p) > TAP_SLOP_PX) this.tapCandidate = false;
        }
        break;
      case 'pinch':
        this.pointers.set(p.id, { x: p.x, y: p.y });
        out.push(...this.pinchEvents());
        break;
      default:
        break;
    }
    this.pointers.set(p.id, { x: p.x, y: p.y });
    return out;
  }

  up(p: PointerSample): GestureEvent[] {
    return this.release(p, false);
  }

  cancel(p: PointerSample): GestureEvent[] {
    return this.release(p, true);
  }

  private release(p: PointerSample, cancelled: boolean): GestureEvent[] {
    if (!this.pointers.has(p.id)) return [];
    this.pointers.delete(p.id);
    const out: GestureEvent[] = [];
    switch (this.phase) {
      case 'pending':
        // Toque corto con herramienta: aplica una vez.
        if (!cancelled) out.push({ type: 'stroke-start', x: this.start.x, y: this.start.y }, { type: 'stroke-end' });
        this.phase = 'idle';
        break;
      case 'stroke':
        out.push({ type: 'stroke-end' });
        this.phase = 'idle';
        break;
      case 'pan':
        if (!cancelled && this.tapCandidate && p.time - this.start.time <= TAP_MAX_MS) {
          out.push({ type: 'tap', x: p.x, y: p.y });
        }
        this.phase = this.pointers.size > 0 ? 'pan' : 'idle';
        break;
      case 'pinch':
        if (this.pointers.size === 1) {
          // Tras el pellizco el dedo restante sólo mueve el mapa, nunca pinta.
          const [id, pos] = this.pointers.entries().next().value as [number, Pos];
          this.primaryId = id;
          this.start = { x: pos.x, y: pos.y, time: p.time };
          this.phase = 'pan';
          this.tapCandidate = false;
        } else if (this.pointers.size >= 2) {
          this.resetPinch();
        } else {
          this.phase = 'idle';
        }
        break;
      default:
        this.phase = 'idle';
    }
    return out;
  }

  /** Avanza temporizadores (llamar cada frame). */
  update(time: number): GestureEvent[] {
    if (this.phase === 'pending' && time - this.start.time >= TOUCH_PAINT_DELAY_MS) {
      this.phase = 'stroke';
      return [{ type: 'stroke-start', x: this.start.x, y: this.start.y }];
    }
    return [];
  }

  private twoPointers(): [Pos, Pos] {
    const it = this.pointers.values();
    return [it.next().value as Pos, it.next().value as Pos];
  }

  private resetPinch(): void {
    const [a, b] = this.twoPointers();
    this.pinchDist = Math.max(1, dist(a, b));
    this.pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pinchEvents(): GestureEvent[] {
    const [a, b] = this.twoPointers();
    const d = Math.max(1, dist(a, b));
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const out: GestureEvent[] = [
      { type: 'pan', dx: c.x - this.pinchCenter.x, dy: c.y - this.pinchCenter.y },
      { type: 'zoom', factor: d / this.pinchDist, x: c.x, y: c.y },
    ];
    this.pinchDist = d;
    this.pinchCenter = c;
    return out;
  }
}
