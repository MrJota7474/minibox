import { DAY_TICKS, isNight } from '../world/daylight';

/**
 * Fiestas: la primera noche de cada estación, las aldeas con comida de sobra celebran un
 * banquete. Todo se deduce del tick y de la duración de las estaciones (sin estado guardado).
 */

/** Primer tick de la noche dentro de un día y cuántos ticks dura (se calcula una vez). */
const NIGHT_START = ((): number => {
  for (let t = 1; t < DAY_TICKS; t++) if (isNight(t) && !isNight(t - 1)) return t;
  return 0;
})();
export const NIGHT_LEN = ((): number => {
  let n = 0;
  for (let t = 0; t < DAY_TICKS; t++) if (isNight(t)) n++;
  return n;
})();

/**
 * Tick en que empieza (o empezó) la fiesta del último cambio de estación, o -1 si no hay: antes
 * del primer cambio, o si con estaciones más cortas que un día la estación acaba antes de que
 * anochezca (esa fiesta se salta, en vez de juntarse con la siguiente).
 */
export function festivalStartFor(tick: number, seasonTicks: number, offset: number): number {
  if (tick + offset < seasonTicks) return -1;
  const boundary = Math.floor((tick + offset) / seasonTicks) * seasonTicks - offset;
  let start = Math.floor(boundary / DAY_TICKS) * DAY_TICKS + NIGHT_START;
  // Si la estación cambia ya entrada la noche, se celebra la noche siguiente.
  if (start < boundary) start += DAY_TICKS;
  return start < boundary + seasonTicks ? start : -1;
}

/** ¿Es noche de fiesta? */
export function inFestival(tick: number, seasonTicks: number, offset: number): boolean {
  const start = festivalStartFor(tick, seasonTicks, offset);
  return start >= 0 && tick >= start && tick < start + NIGHT_LEN;
}

/**
 * Motivo de la fiesta según la estación que empieza. Sin la ley de estaciones las fiestas siguen
 * llegando con el mismo ritmo, por la cosecha.
 */
export function festivalReason(season: number, seasons: boolean): string {
  if (!seasons) return 'se celebra la cosecha';
  return ['se recibe la primavera', 'se celebra el solsticio de verano', 'se celebra la cosecha de otoño', 'se encienden hogueras contra el invierno'][season] ?? 'se celebra la cosecha';
}
