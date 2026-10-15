import type { ChronicleEntry } from '../civ/civ-system';
import type { LawId, WorldLaws } from '../sim/laws';
import { chronicleContent } from './chronicle';
import { eraContent, lawsContent, seasonLengthContent } from './laws-panel';
import { el } from './dom';
import { helpContent } from './help';
import { gridIcon } from './icons';
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
  seasonTicks(): number | null;
  setSeasonTicks(ticks: number): void;
  saves: SaveActions;
  settings(): Settings;
  setSettings(s: Settings): void;
}

/** Una sección del menú: o se abre en el propio panel (con su título y un botón para volver) o es una acción directa. */
interface Section {
  icon: string;
  label: string;
  content?: () => HTMLElement;
  run?: () => void;
}

/**
 * Menú principal (☰): una cuadrícula de secciones con icono. Las que tienen contenido
 * (partidas, crónica, leyes, ajustes, controles) se abren dentro del panel; las demás son
 * acciones directas.
 */
export class Menu {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly view: HTMLElement;
  private readonly viewTitle: HTMLElement;
  private readonly viewBody: HTMLElement;

  constructor(actions: MenuActions) {
    const act = (fn: () => void) => () => {
      this.close();
      fn();
    };
    const sections: Section[] = [
      { icon: 'globe', label: 'Nuevo mundo', run: act(() => actions.newWorld()) },
      { icon: 'save', label: 'Partidas', content: () => savesContent(actions.saves) },
      { icon: 'book', label: 'Crónica', content: () => chronicleContent(actions.chronicle()) },
      { icon: 'scroll', label: 'Leyes del mundo', content: () => this.lawsSection(actions) },
      { icon: 'gear', label: 'Ajustes', content: () => settingsContent(actions.settings(), (s) => actions.setSettings(s)) },
      { icon: 'keys', label: 'Controles', content: () => helpContent() },
      ...(document.fullscreenEnabled ? [{ icon: 'fullscreen', label: 'Pantalla completa', run: act(() => actions.toggleFullscreen()) }] : []),
      { icon: 'chart', label: 'Rendimiento', run: act(() => actions.togglePerf()) },
    ];

    this.grid = el(
      'div',
      { class: 'menu-grid' },
      sections.map((s, k) => {
        const b = el('button', { class: 'btn menu-tile', attrs: { type: 'button' }, onClick: () => (s.content ? this.openSection(s.label, s.content()) : s.run?.()) }, [
          el('img', { attrs: { src: gridIcon(s.icon), alt: '' } }),
          el('span', { class: 'menu-tile-label', text: s.label }),
        ]);
        // Orden de entrada: los botones aparecen uno tras otro.
        b.style.setProperty('--i', String(k));
        return b;
      }),
    );
    this.viewTitle = el('h3', { class: 'menu-view-title' });
    this.viewBody = el('div', { class: 'menu-view-body' });
    this.view = el('div', { class: 'menu-view', attrs: { hidden: '' } }, [
      el('div', { class: 'menu-view-head' }, [
        el('button', { class: 'btn btn-mini menu-back', title: 'Volver', attrs: { type: 'button', 'aria-label': 'Volver' }, onClick: () => this.showGrid() }, [
          el('img', { attrs: { src: gridIcon('back'), alt: '' } }),
        ]),
        this.viewTitle,
      ]),
      this.viewBody,
    ]);
    this.root = el('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menú', hidden: '' } }, [
      el('div', { class: 'panel menu' }, [
        el('div', { class: 'menu-head' }, [
          el('h2', { class: 'menu-title', text: 'MiniBox' }),
          el('button', { class: 'btn btn-mini', title: 'Cerrar', attrs: { type: 'button', 'aria-label': 'Cerrar el menú' }, onClick: () => this.close() }, [
            el('img', { attrs: { src: gridIcon('close'), alt: '' } }),
          ]),
        ]),
        this.grid,
        this.view,
        el('button', { class: 'btn btn-primary menu-resume', text: 'Volver al juego', attrs: { type: 'button' }, onClick: () => this.close() }),
      ]),
    ]);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  private lawsSection(actions: MenuActions): HTMLElement {
    const laws = actions.laws();
    if (!laws) return el('p', { class: 'menu-empty', text: 'Crea un mundo para cambiar sus leyes.' });
    const era = actions.era();
    const seasons = actions.seasonTicks();
    return el('div', { class: 'laws-box' }, [
      lawsContent(laws, (law, value) => actions.setLaw(law, value)),
      seasons === null ? '' : seasonLengthContent(seasons, (t) => actions.setSeasonTicks(t)),
      era === null ? '' : eraContent(era, (e) => actions.setEra(e)),
    ]);
  }

  private openSection(title: string, body: HTMLElement): void {
    this.viewTitle.textContent = title;
    this.viewBody.replaceChildren(body);
    this.grid.hidden = true;
    this.view.hidden = false;
  }

  private showGrid(): void {
    this.view.hidden = true;
    this.viewBody.replaceChildren();
    this.grid.hidden = false;
  }

  open(): void {
    this.showGrid();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.showGrid();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
}
