import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { DAY_TICKS, daylight, isNight } from '../src/world/daylight';

describe('día y noche', () => {
  it('de día hay luz plena y en plena noche ninguna', () => {
    expect(daylight(0)).toBe(1);
    expect(daylight(Math.round(DAY_TICKS * 0.3))).toBe(1);
    expect(daylight(Math.round(DAY_TICKS * 0.75))).toBe(0);
    expect(isNight(0)).toBe(false);
    expect(isNight(Math.round(DAY_TICKS * 0.75))).toBe(true);
  });

  it('anochece y amanece poco a poco, y el ciclo se repite', () => {
    const dusk = daylight(Math.round(DAY_TICKS * 0.6));
    const dawn = daylight(Math.round(DAY_TICKS * 0.95));
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
    for (let t = 0; t < DAY_TICKS; t += 7) expect(daylight(t + DAY_TICKS * 3)).toBe(daylight(t));
    // Todo el día está entre 0 y 1, y la luz no da saltos.
    for (let t = 1; t < DAY_TICKS; t++) {
      expect(daylight(t)).toBeGreaterThanOrEqual(0);
      expect(daylight(t)).toBeLessThanOrEqual(1);
      expect(Math.abs(daylight(t) - daylight(t - 1))).toBeLessThan(0.05);
    }
  });

  it('el ciclo se ve por defecto (se puede apagar en los ajustes)', () => {
    expect(DEFAULT_SETTINGS.dayNight).toBe(true);
  });
});
