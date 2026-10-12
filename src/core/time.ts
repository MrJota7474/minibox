/** Constantes del calendario de la simulación (tick fijo a 10 Hz en x1). */
export const TICKS_PER_SECOND = 10;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
export const TICKS_PER_MONTH = 50;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;

export interface WorldDate {
  year: number;
  month: number;
}

export function tickToDate(tick: number): WorldDate {
  const year = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const month = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_MONTH) + 1;
  return { year, month };
}

export function ticksToYears(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_YEAR);
}
