import { TIER_SETTINGS, type DeviceProfile } from '../core/device';
import { el } from './dom';

export interface NewWorldOptions {
  seedText: string;
  size: number;
  populate: boolean;
}

const SIZE_OPTIONS: readonly { size: number; label: string }[] = [
  { size: 192, label: 'Pequeño (192×192)' },
  { size: 256, label: 'Mediano (256×256)' },
  { size: 384, label: 'Grande (384×384)' },
  { size: 512, label: 'Enorme (512×512)' },
];

const TIER_LABELS: Readonly<Record<string, string>> = { bajo: 'Básico', medio: 'Medio', alto: 'Alto', ultra: 'Máximo' };

const SEED_WORDS = ['alba', 'bruma', 'cenit', 'duna', 'eco', 'fiordo', 'gema', 'halo', 'isla', 'jade', 'karst', 'lago', 'monte', 'nube', 'oasis', 'pino', 'rio', 'sol', 'tundra', 'valle'];

export function randomSeed(): string {
  const pick = (): string => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

/** Pantalla de «Nuevo mundo». */
export class StartMenu {
  readonly root: HTMLElement;
  private readonly seedInput: HTMLInputElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly populate: HTMLInputElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly continueBtn: HTMLButtonElement;

  constructor(device: DeviceProfile, onCreate: (opts: NewWorldOptions) => void, onCancel: () => void, onContinue: () => void) {
    this.continueBtn = el('button', { class: 'btn btn-primary continue-btn', attrs: { type: 'button', hidden: '' }, onClick: () => onContinue() });
    this.seedInput = el('input', { attrs: { id: 'seed', type: 'text', maxlength: '40', autocomplete: 'off', spellcheck: 'false' } });
    this.seedInput.value = randomSeed();
    this.sizeSelect = el(
      'select',
      { attrs: { id: 'size' } },
      SIZE_OPTIONS.map((o) => {
        const heavy = o.size > TIER_SETTINGS[device.tier].mapSize;
        return el('option', { text: heavy ? `${o.label} · exigente` : o.label, attrs: { value: String(o.size) } });
      }),
    );
    this.sizeSelect.value = String(device.mapSize);
    this.populate = el('input', { attrs: { id: 'populate', type: 'checkbox' } });
    this.populate.checked = true;
    this.cancelBtn = el('button', { class: 'btn btn-text', text: 'Volver', attrs: { type: 'button' }, onClick: () => onCancel() });

    const form = el('form', { class: 'start-form' }, [
      el('label', { attrs: { for: 'seed' }, text: 'Semilla' }),
      el('div', { class: 'seed-row' }, [
        this.seedInput,
        el('button', { class: 'btn btn-text', text: 'Azar', title: 'Semilla aleatoria', attrs: { type: 'button' }, onClick: () => (this.seedInput.value = randomSeed()) }),
      ]),
      el('label', { attrs: { for: 'size' }, text: 'Tamaño del mapa' }),
      this.sizeSelect,
      el('label', { class: 'check' }, [this.populate, el('span', { text: 'Poblar con animales' })]),
      el('div', { class: 'start-actions' }, [this.cancelBtn, el('button', { class: 'btn btn-primary', text: 'Crear mundo', attrs: { type: 'submit' } })]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const seedText = this.seedInput.value.trim() || randomSeed();
      onCreate({ seedText, size: Number(this.sizeSelect.value), populate: this.populate.checked });
    });

    this.root = el('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'start-title', hidden: '' } }, [
      el('div', { class: 'panel start' }, [
        el('h1', { class: 'logo', text: 'MiniBox', attrs: { id: 'start-title' } }),
        el('p', { class: 'tagline', text: 'Crea un mundo y mira cómo cobra vida.' }),
        this.continueBtn,
        form,
        el('p', { class: 'device-note', text: `Calidad detectada: ${TIER_LABELS[device.tier]} · hasta ${device.unitCap} criaturas` }),
      ]),
    ]);
  }

  open(canCancel: boolean): void {
    this.cancelBtn.hidden = !canCancel;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Muestra «Continuar» con la descripción de la última partida (o lo oculta). */
  setContinue(label: string | null): void {
    this.continueBtn.hidden = label === null;
    this.continueBtn.textContent = label ? `Continuar: ${label}` : '';
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
}
