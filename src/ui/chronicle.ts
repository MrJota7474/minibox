import type { ChronicleEntry } from '../civ/civ-system';
import { tickToDate } from '../core/time';
import { el } from './dom';

const SHOWN = 40;

/** Lista de los últimos acontecimientos del mundo, del más reciente al más antiguo. */
export function chronicleContent(entries: readonly ChronicleEntry[]): HTMLElement {
  if (entries.length === 0) return el('p', { class: 'insp-note', text: 'Aún no ha pasado nada digno de contar.' });
  const recent = entries.slice(-SHOWN).reverse();
  return el(
    'ol',
    { class: 'chronicle' },
    recent.map((e) => el('li', { class: `chronicle-${e.type}` }, [el('span', { class: 'chronicle-year', text: `Año ${tickToDate(e.tick).year}` }), el('span', { text: e.text })])),
  );
}
