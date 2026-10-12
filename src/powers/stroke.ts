import type { Command } from '../sim/commands';
import { commandFor, type ToolDef } from './tools';

/**
 * Convierte un trazo continuo (en casillas) en comandos de simulación:
 * interpola entre muestras para no dejar huecos y repite mientras se mantiene pulsado.
 */
export class StrokeController {
  tool: ToolDef | null = null;
  size = 3;
  private active = false;
  private lastX = 0;
  private lastY = 0;
  private lastStampTime = 0;

  constructor(private readonly emit: (command: Command) => void) {}

  get isActive(): boolean {
    return this.active;
  }

  start(x: number, y: number, now: number): void {
    if (!this.tool) return;
    this.active = true;
    this.stamp(x, y, now);
  }

  move(x: number, y: number, now: number): void {
    if (!this.active || !this.tool) return;
    // El imán sólo sigue al cursor; los desastres puntuales sólo se repiten en el sitio.
    if (this.tool.kind === 'magnet' || (this.tool.kind === 'power' && !this.tool.continuous)) {
      this.lastX = x;
      this.lastY = y;
      return;
    }
    const spacing = this.spacing();
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const steps = Math.floor(Math.max(Math.abs(dx), Math.abs(dy)) / spacing);
    if (steps === 0) return;
    const fromX = this.lastX;
    const fromY = this.lastY;
    for (let s = 1; s <= steps; s++) {
      this.stamp(Math.round(fromX + (dx * s) / steps), Math.round(fromY + (dy * s) / steps), now);
    }
  }

  end(): void {
    if (this.active && this.tool?.kind === 'magnet') this.emit({ type: 'drop', x: this.lastX, y: this.lastY });
    this.active = false;
  }

  /** Repite la herramienta en el sitio si así lo define (p. ej. elevar terreno). */
  update(now: number): void {
    const repeat = this.tool && this.tool.kind !== 'magnet' ? this.tool.repeatMs : undefined;
    if (!this.active || !repeat) return;
    if (now - this.lastStampTime >= repeat) this.stamp(this.lastX, this.lastY, now);
  }

  private spacing(): number {
    if (!this.tool) return 1;
    if (this.tool.kind === 'spawn') return Math.max(2, this.size);
    return Math.max(1, Math.floor(this.size / 2));
  }

  private stamp(x: number, y: number, now: number): void {
    if (!this.tool) return;
    this.lastX = x;
    this.lastY = y;
    this.lastStampTime = now;
    this.emit(commandFor(this.tool, x, y, this.size));
  }
}
