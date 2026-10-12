import { tickToDate } from '../core/time';
import { AUTOSAVE_SLOT, type SlotInfo } from '../persistence/db';
import type { SaveMeta } from '../persistence/snapshot';
import { el } from './dom';

export interface SaveActions {
  list(): Promise<SlotInfo[]>;
  /** Hay una partida en curso que guardar. */
  canSave(): boolean;
  save(slot: string): Promise<unknown>;
  load(slot: string): Promise<void>;
  remove(slot: string): Promise<void>;
  exportFile(): Promise<void>;
  importFile(file: File): Promise<void>;
}

const CONFIRM_MS = 3000;

function describeMeta(m: SaveMeta): string {
  const { year } = tickToDate(m.tick);
  const when = new Date(m.savedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  const villages = m.villages === 1 ? '1 aldea' : `${m.villages} aldeas`;
  return `«${m.seedText}» · año ${year} · ${m.population} criaturas · ${villages} · ${when}`;
}

/** Botón que pide un segundo toque para confirmar (sin diálogos que bloqueen en el móvil). */
function confirmButton(label: string, question: string, onConfirm: () => void): HTMLButtonElement {
  let armed = 0;
  const btn = el('button', { class: 'btn btn-mini btn-danger', text: label, attrs: { type: 'button' } });
  btn.addEventListener('click', () => {
    if (armed) {
      window.clearTimeout(armed);
      armed = 0;
      onConfirm();
      return;
    }
    btn.textContent = question;
    armed = window.setTimeout(() => {
      armed = 0;
      btn.textContent = label;
    }, CONFIRM_MS);
  });
  return btn;
}

/** Lista de ranuras con guardar / cargar / borrar, y exportar o importar un archivo. */
export function savesContent(actions: SaveActions): HTMLElement {
  const list = el('div', { class: 'save-slots' }, [el('p', { class: 'save-note', text: 'Cargando…' })]);
  let busy = false;
  const run = (fn: () => Promise<unknown>, refresh = true): void => {
    if (busy) return;
    busy = true;
    root.classList.add('is-busy');
    void fn()
      // Los fallos ya se notifican con un aviso en el controlador de partidas.
      .catch(() => undefined)
      .finally(() => {
        busy = false;
        root.classList.remove('is-busy');
        if (refresh) render();
      });
  };

  const row = (info: SlotInfo): HTMLElement => {
    const isAuto = info.slot === AUTOSAVE_SLOT;
    const title = isAuto ? 'Autoguardado' : `Ranura ${info.slot}`;
    const buttons: HTMLElement[] = [];
    if (!isAuto) {
      // Sobrescribir una partida pide confirmación, como borrarla.
      const save = info.meta
        ? confirmButton('Guardar', '¿Sobrescribir?', () => run(() => actions.save(info.slot)))
        : el('button', { class: 'btn btn-mini', text: 'Guardar', attrs: { type: 'button' }, onClick: () => run(() => actions.save(info.slot)) });
      save.disabled = !actions.canSave();
      buttons.push(save);
    }
    if (info.meta) {
      buttons.push(el('button', { class: 'btn btn-mini', text: 'Cargar', attrs: { type: 'button' }, onClick: () => run(() => actions.load(info.slot), false) }));
      buttons.push(confirmButton('Borrar', '¿Seguro?', () => run(() => actions.remove(info.slot))));
    }
    return el('div', { class: 'save-slot' }, [
      el('div', { class: 'save-info' }, [el('strong', { text: title }), el('span', { class: 'save-desc', text: info.meta ? describeMeta(info.meta) : 'Vacía' })]),
      el('div', { class: 'save-buttons' }, buttons),
    ]);
  };

  const render = (): void => {
    actions
      .list()
      .then((slots) => list.replaceChildren(...slots.map(row)))
      .catch(() => list.replaceChildren(el('p', { class: 'save-note', text: 'El navegador no permite guardar partidas (¿modo privado?). Puedes exportarlas a un archivo.' })));
  };

  const fileInput = el('input', { attrs: { type: 'file', accept: '.minibox,application/octet-stream', hidden: '' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) run(() => actions.importFile(file), false);
  });
  const exportBtn = el('button', { class: 'btn btn-mini', text: 'Exportar archivo', attrs: { type: 'button' }, onClick: () => run(() => actions.exportFile(), false) });
  exportBtn.disabled = !actions.canSave();
  const root = el('div', { class: 'saves' }, [
    list,
    el('div', { class: 'save-files' }, [exportBtn, el('button', { class: 'btn btn-mini', text: 'Importar archivo', attrs: { type: 'button' }, onClick: () => fileInput.click() }), fileInput]),
  ]);
  render();
  return root;
}
