import { LAW_IDS, LAW_LABELS, type LawId, type WorldLaws } from '../sim/laws';
import { ERA_INFO, SEASON_LENGTHS } from '../world/climate';
import { el } from './dom';

/** Selector de era (poder de dios): la elegida dura hasta que empiece la siguiente. */
export function eraContent(current: number, onSelect: (era: number) => void): HTMLElement {
  const select = el('select', { class: 'select', attrs: { id: 'era-select', 'aria-label': 'Era del mundo' } });
  ERA_INFO.forEach((e, k) => select.append(el('option', { text: e.name, attrs: { value: String(k), title: e.description } })));
  select.value = String(current);
  const note = el('p', { class: 'save-note', text: ERA_INFO[current].description });
  select.addEventListener('change', () => {
    const era = Number(select.value);
    note.textContent = ERA_INFO[era].description;
    onSelect(era);
  });
  return el('div', { class: 'era-box' }, [el('label', { class: 'era-label', text: 'Era del mundo', attrs: { for: 'era-select' } }), select, note]);
}

/** Selector de la duración de cada estación. */
export function seasonLengthContent(current: number, onSelect: (ticks: number) => void): HTMLElement {
  const select = el('select', { class: 'select', attrs: { id: 'season-length', 'aria-label': 'Duración de cada estación' } });
  for (const s of SEASON_LENGTHS) select.append(el('option', { text: s.label, attrs: { value: String(s.ticks) } }));
  select.value = String(current);
  select.addEventListener('change', () => onSelect(Number(select.value)));
  return el('div', { class: 'era-box' }, [el('label', { class: 'era-label', text: 'Cada estación dura', attrs: { for: 'season-length' } }), select]);
}

/** Casillas de verificación de las leyes del mundo. */
export function lawsContent(laws: WorldLaws, onChange: (law: LawId, value: boolean) => void): HTMLElement {
  return el(
    'div',
    { class: 'laws' },
    LAW_IDS.map((id) => {
      const input = el('input', { attrs: { type: 'checkbox', id: `law-${id}` } });
      input.checked = laws[id];
      input.addEventListener('change', () => onChange(id, input.checked));
      return el('label', { class: 'check', attrs: { for: `law-${id}` } }, [input, el('span', { text: LAW_LABELS[id] })]);
    }),
  );
}
