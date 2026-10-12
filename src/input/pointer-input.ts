import type { GestureEvent, GestureRecognizer, PointerSample } from './gestures';

const WHEEL_ZOOM_SPEED = 0.0015;
const WHEEL_LINE_ZOOM_SPEED = 0.05;

/** Conecta Pointer Events y la rueda del ratón del canvas con el reconocedor de gestos. */
export class PointerInput {
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly recognizer: GestureRecognizer,
    private readonly onGesture: (e: GestureEvent) => void,
    private readonly onLeave: () => void,
  ) {
    this.listen('pointerdown', (e) => {
      e.preventDefault();
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        // Algunos navegadores rechazan la captura en punteros sintéticos; no es crítico.
      }
      this.emit(this.recognizer.down(this.sample(e)));
    });
    this.listen('pointermove', (e) => this.emit(this.recognizer.move(this.sample(e))));
    this.listen('pointerup', (e) => this.emit(this.recognizer.up(this.sample(e))));
    this.listen('pointercancel', (e) => this.emit(this.recognizer.cancel(this.sample(e))));
    this.listen('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.recognizer.activePointers === 0) this.onLeave();
    });
    this.listen('contextmenu', (e) => e.preventDefault());
    // Si el sistema roba el puntero (llamada, notificación) no debe quedar un dedo «fantasma».
    this.listen('lostpointercapture', (e) => this.emit(this.recognizer.cancel(this.sample(e))));
    const reset = (): void => this.emit(this.recognizer.reset());
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') reset();
    };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => window.removeEventListener('blur', reset));
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      const speed = e.deltaMode === 1 ? WHEEL_LINE_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
      const p = this.local(e.clientX, e.clientY);
      this.onGesture({ type: 'zoom', factor: Math.exp(-e.deltaY * speed), x: p.x, y: p.y });
    };
    this.el.addEventListener('wheel', wheel, { passive: false });
    this.disposers.push(() => this.el.removeEventListener('wheel', wheel));
  }

  update(now: number): void {
    this.emit(this.recognizer.update(now));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  private listen<K extends 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerleave' | 'lostpointercapture' | 'contextmenu'>(
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ): void {
    const handler = fn as EventListener;
    this.el.addEventListener(type, handler);
    this.disposers.push(() => this.el.removeEventListener(type, handler));
  }

  private emit(events: GestureEvent[]): void {
    for (const e of events) this.onGesture(e);
  }

  private local(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private sample(e: PointerEvent): PointerSample {
    const p = this.local(e.clientX, e.clientY);
    return { id: e.pointerId, x: p.x, y: p.y, time: e.timeStamp, touch: e.pointerType !== 'mouse', button: e.button };
  }
}
