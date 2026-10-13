import { LAW_IDS, LAW_LABELS, type LawId, type WorldLaws } from '../sim/laws';
import { ERA_INFO } from '../world/climate';
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
