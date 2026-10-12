import { TICK_MS } from './time';

/** Velocidades disponibles: 0 = pausa. */
export const SPEEDS = [0, 1, 2, 5] as const;
export type Speed = (typeof SPEEDS)[number];

const MAX_FRAME_DT_MS = 250;
const DEFAULT_MAX_TICKS_PER_FRAME = 8;

/**
 * Reloj de paso fijo: convierte tiempo real en ticks de simulación.
 * Si el equipo no da abasto, el juego se ralentiza en vez de saltar ticks,
 * así el resultado nunca depende de los FPS.
 */
export class FixedClock {
  speed: Speed = 1;
  maxTicksPerFrame = DEFAULT_MAX_TICKS_PER_FRAME;
  private accumulator = 0;

  advance(dtMs: number): number {
    if (this.speed === 0) {
      this.accumulator = 0;
      return 0;
    }
    const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_DT_MS);
    this.accumulator += dt * this.speed;
    let ticks = Math.floor(this.accumulator / TICK_MS);
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator -= ticks * TICK_MS;
    }
    return ticks;
  }

  /** Fracción [0,1) del siguiente tick, para interpolar el render. */
  alpha(): number {
    if (this.speed === 0) return 1;
    return Math.min(this.accumulator / TICK_MS, 1);
  }
}
