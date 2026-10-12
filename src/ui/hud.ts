import { SPEEDS, type Speed } from '../core/clock';
import { tickToDate } from '../core/time';
import { SPECIES } from '../entities/species';
import type { SpriteAtlas } from '../render/sprites';
import { el, iconButton, setPressed } from './dom';
import { gridIcon, speciesIcon } from './icons';

export interface HudActions {
  setSpeed(speed: Speed): void;
  openMenu(): void;
  toggleFullscreen(): void;
}

const SPEED_LABELS: Readonly<Record<Speed, string>> = { 0: 'Pausa', 1: 'x1', 2: 'x2', 5: 'x5' };

/** Barra superior: fecha, población, velocidad del tiempo y menú. */
export class Hud {
  readonly root: HTMLElement;
  private readonly date: HTMLElement;
  private readonly total: HTMLElement;
  private readonly counts: HTMLElement[] = [];
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();

  constructor(atlas: SpriteAtlas, actions: HudActions) {
    this.date = el('span', { class: 'hud-date', text: 'Año 1 · Mes 1' });
    this.total = el('span', { class: 'hud-total' });
    const pop = el('div', { class: 'hud-pop' }, [
      ...SPECIES.map((s) => {
        const n = el('span', { text: '0' });
        this.counts.push(n);
        return el('span', { class: 'hud-count', title: s.plural }, [el('img', { attrs: { src: speciesIcon(s.id, atlas), alt: '' } }), n]);
      }),
      this.total,
    ]);
    const speeds = el(
      'div',
      { class: 'hud-speeds', attrs: { role: 'group', 'aria-label': 'Velocidad del tiempo' } },
      SPEEDS.map((s) => {
        const btn =
          s === 0
            ? iconButton(gridIcon('pause'), 'Pausa (Espacio)', { class: 'btn-speed', onClick: () => actions.setSpeed(s) })
            : el('button', { class: 'btn btn-speed', text: SPEED_LABELS[s], title: `Velocidad ${SPEED_LABELS[s]}`, attrs: { type: 'button' }, onClick: () => actions.setSpeed(s) });
        this.speedButtons.set(s, btn);
        return btn;
      }),
    );
    const fullscreen = document.fullscreenEnabled
      ? iconButton(gridIcon('fullscreen'), 'Pantalla completa (F)', { onClick: () => actions.toggleFullscreen() })
      : null;
    this.root = el('header', { class: 'hud' }, [
      iconButton(gridIcon('menu'), 'Menú', { onClick: () => actions.openMenu() }),
      el('div', { class: 'hud-info' }, [this.date, pop]),
      speeds,
      fullscreen,
    ]);
  }

  setSpeed(speed: Speed): void {
    for (const [s, btn] of this.speedButtons) setPressed(btn, s === speed);
  }

  update(tick: number, speciesCount: Uint32Array, total: number, limit: number): void {
    const d = tickToDate(tick);
    this.date.textContent = `Año ${d.year} · Mes ${d.month}`;
    for (let s = 0; s < this.counts.length; s++) this.counts[s].textContent = String(speciesCount[s]);
    this.total.textContent = `${total}/${limit}`;
    this.total.classList.toggle('is-full', total >= limit);
  }
}
