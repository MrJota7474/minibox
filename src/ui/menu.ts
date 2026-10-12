import { el } from './dom';
import { helpContent } from './help';

export interface MenuActions {
  newWorld(): void;
  toggleFullscreen(): void;
  togglePerf(): void;
}

/** Menú principal (☰): nuevo mundo, pantalla completa, rendimiento y controles. */
export class Menu {
  readonly root: HTMLElement;
  private readonly help: HTMLElement;

  constructor(actions: MenuActions) {
    this.help = helpContent();
    this.help.hidden = true;
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
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
}
