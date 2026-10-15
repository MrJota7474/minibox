/**
 * Ciclo de día y noche. Sólo depende del tick (sin estado que guardar) y sólo usa aritmética
 * básica, así que la simulación puede usarlo sin perder el determinismo.
 */

/** Ticks de un día completo (36 s en x1). */
export const DAY_TICKS = 360;

/** Fracciones del día: anochecer, noche cerrada y amanecer (antes del anochecer es pleno día). */
const DUSK_START = 0.55;
const NIGHT_START = 0.65;
const DAWN_START = 0.9;

/** Luz del momento: 1 de día, 0 en plena noche, con transiciones lineales al atardecer y al amanecer. */
export function daylight(tick: number): number {
  const p = (((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS) / DAY_TICKS;
  if (p < DUSK_START) return 1;
  if (p < NIGHT_START) return 1 - (p - DUSK_START) / (NIGHT_START - DUSK_START);
  if (p < DAWN_START) return 0;
  return (p - DAWN_START) / (1 - DAWN_START);
}

/** ¿Es de noche? (la mitad oscura del atardecer y del amanecer cuenta como noche). */
export function isNight(tick: number): boolean {
  return daylight(tick) < 0.5;
}
