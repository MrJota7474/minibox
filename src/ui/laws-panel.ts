import { LAW_IDS, LAW_LABELS, type LawId, type WorldLaws } from '../sim/laws';
import { el } from './dom';

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
