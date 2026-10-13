import { el } from './dom';

/** Preferencias del jugador (se recuerdan en este navegador). */
export interface Settings {
  readonly autosave: boolean;
  readonly autosaveMinutes: number;
  readonly showLabels: boolean;
  readonly showTerritory: boolean;
  /** Sonido activado y volumen (0-100). */
  readonly sound: boolean;
  readonly volume: number;
}

export const DEFAULT_SETTINGS: Settings = { autosave: true, autosaveMinutes: 2, showLabels: true, showTerritory: true, sound: true, volume: 60 };
const MAX_VOLUME = 100;
export const AUTOSAVE_CHOICES: readonly number[] = [1, 2, 5, 10];
const STORAGE_KEY = 'minibox.settings';

/** Lee los ajustes guardados; ante cualquier problema, los de por defecto. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const data = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
    const minutes = AUTOSAVE_CHOICES.includes(data.autosaveMinutes as number) ? (data.autosaveMinutes as number) : DEFAULT_SETTINGS.autosaveMinutes;
    return {
      autosave: bool(data.autosave, DEFAULT_SETTINGS.autosave),
      autosaveMinutes: minutes,
      showLabels: bool(data.showLabels, DEFAULT_SETTINGS.showLabels),
      showTerritory: bool(data.showTerritory, DEFAULT_SETTINGS.showTerritory),
      sound: bool(data.sound, DEFAULT_SETTINGS.sound),
      volume: typeof data.volume === 'number' && data.volume >= 0 && data.volume <= MAX_VOLUME ? Math.round(data.volume) : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Guarda los ajustes (si el navegador lo permite; si no, sólo duran esta sesión). */
export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function checkbox(id: string, label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { attrs: { type: 'checkbox', id } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'check', attrs: { for: id } }, [input, el('span', { text: label })]);
}

/** Panel de ajustes; cada cambio produce un objeto nuevo. */
export function settingsContent(current: Settings, onChange: (s: Settings) => void): HTMLElement {
  let s = current;
  const update = (patch: Partial<Settings>): void => {
    s = { ...s, ...patch };
    onChange(s);
  };
  const select = el('select', { class: 'select', attrs: { id: 'set-autosave-min', 'aria-label': 'Frecuencia del autoguardado' } });
  for (const m of AUTOSAVE_CHOICES) select.append(el('option', { text: `cada ${m} min`, attrs: { value: String(m) } }));
  select.value = String(s.autosaveMinutes);
  select.addEventListener('change', () => update({ autosaveMinutes: Number(select.value) }));
  const volume = el('input', { class: 'range', attrs: { type: 'range', id: 'set-volume', min: '0', max: String(MAX_VOLUME), step: '5', 'aria-label': 'Volumen' } });
  volume.value = String(s.volume);
  volume.addEventListener('input', () => update({ volume: Number(volume.value) }));
  return el('div', { class: 'laws settings' }, [
    el('div', { class: 'settings-row' }, [checkbox('set-sound', 'Sonido', s.sound, (v) => update({ sound: v })), volume]),
    el('div', { class: 'settings-row' }, [checkbox('set-autosave', 'Autoguardado', s.autosave, (v) => update({ autosave: v })), select]),
    checkbox('set-labels', 'Nombres de aldeas', s.showLabels, (v) => update({ showLabels: v })),
    checkbox('set-territory', 'Territorios', s.showTerritory, (v) => update({ showTerritory: v })),
  ]);
}
