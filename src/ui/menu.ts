import type { ChronicleEntry } from '../civ/civ-system';
import type { LawId, WorldLaws } from '../sim/laws';
import { chronicleContent } from './chronicle';
import { eraContent, lawsContent } from './laws-panel';
import { el } from './dom';
import { helpContent } from './help';
import { savesContent, type SaveActions } from './saves-panel';
import { settingsContent, type Settings } from './settings';

export interface MenuActions {
  newWorld(): void;
  toggleFullscreen(): void;
  togglePerf(): void;
  chronicle(): readonly ChronicleEntry[];
  laws(): WorldLaws | null;
  setLaw(law: LawId, value: boolean): void;
  era(): number | null;
  setEra(era: number): void;
  saves: SaveActions;
  settings(): Settings;
  setSettings(s: Settings): void;
}

/** Menú principal (☰): nuevo mundo, partidas, pantalla completa, rendimiento, crónica, leyes, ajustes y controles. */
export class Menu {
  readonly root: HTMLElement;
  private readonly help: HTMLElement;
  private readonly chronicleBox: HTMLElement;
  private readonly lawsBox: HTMLElement;
  private readonly savesBox: HTMLElement;
  private readonly settingsBox: HTMLElement;

  constructor(actions: MenuActions) {
    this.help = helpContent();
    this.help.hidden = true;
    this.chronicleBox = el('div', { class: 'chronicle-box', attrs: { hidden: '' } });
    this.lawsBox = el('div', { class: 'laws-box', attrs: { hidden: '' } });
    this.savesBox = el('div', { class: 'saves-box', attrs: { hidden: '' } });
    this.settingsBox = el('div', { class: 'settings-box', attrs: { hidden: '' } });
    const item = (label: string, fn: () => void): HTMLButtonElement =>
      el('button', {
        class: 'btn btn-text menu-item',
        text: label,
        attrs: { type: 'button' },
        onClick: () => {
          fn();
        },
      });
    this.root = el('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menú', hidden: '' } }, [
      el('div', { class: 'panel menu' }, [
        el('h2', { text: 'MiniBox' }),
        item('Nuevo mundo', () => {
          this.close();
          actions.newWorld();
        }),
        item('Guardar / cargar', () => {
          this.savesBox.hidden = !this.savesBox.hidden;
          if (!this.savesBox.hidden) this.savesBox.replaceChildren(savesContent(actions.saves));
        }),
        this.savesBox,
        document.fullscreenEnabled
          ? item('Pantalla completa', () => {
              this.close();
              actions.toggleFullscreen();
            })
          : null,
        item('Mostrar/ocultar rendimiento', () => {
          this.close();
          actions.togglePerf();
        }),
        item('Crónica del mundo', () => {
          this.chronicleBox.hidden = !this.chronicleBox.hidden;
          if (!this.chronicleBox.hidden) this.chronicleBox.replaceChildren(chronicleContent(actions.chronicle()));
        }),
        this.chronicleBox,
        item('Leyes del mundo', () => {
          const laws = actions.laws();
          this.lawsBox.hidden = !this.lawsBox.hidden || !laws;
          const era = actions.era();
          if (!this.lawsBox.hidden && laws) {
            this.lawsBox.replaceChildren(lawsContent(laws, (law, value) => actions.setLaw(law, value)), era === null ? '' : eraContent(era, (e) => actions.setEra(e)));
          }
        }),
        this.lawsBox,
        item('Ajustes', () => {
          this.settingsBox.hidden = !this.settingsBox.hidden;
          if (!this.settingsBox.hidden) this.settingsBox.replaceChildren(settingsContent(actions.settings(), (s) => actions.setSettings(s)));
        }),
        this.settingsBox,
        item('Controles', () => {
          this.help.hidden = !this.help.hidden;
        }),
        this.help,
        item('Volver al juego', () => this.close()),
      ]),
    ]);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.help.hidden = true;
    this.chronicleBox.hidden = true;
    this.lawsBox.hidden = true;
    this.savesBox.hidden = true;
    this.settingsBox.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
}
