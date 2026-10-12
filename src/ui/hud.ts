import { SPEEDS, type Speed } from '../core/clock';
import { tickToDate } from '../core/time';
import { Species } from '../entities/species';
import type { SpriteAtlas } from '../render/sprites';
import { el, iconButton, setPressed } from './dom';
import { gridIcon, speciesIcon } from './icons';

export interface HudActions {
  setSpeed(speed: Speed): void;
  openMenu(): void;
  toggleFullscreen(): void;
}

/** Recuento agrupado que muestra la barra superior. */
export interface HudCounts {
  wars: number;
  herbivores: number;
  predators: number;
  people: number;
  villages: number;
  total: number;
  limit: number;
}

const SPEED_LABELS: Readonly<Record<Speed, string>> = { 0: 'Pausa', 1: 'x1', 2: 'x2', 5: 'x5' };

/** Barra superior: fecha, población, velocidad del tiempo y menú. */
export class Hud {
  readonly root: HTMLElement;
  private readonly date: HTMLElement;
  private readonly total: HTMLElement;
  private readonly counts: Record<'herbivores' | 'predators' | 'people' | 'villages' | 'wars', HTMLElement>;
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();

  constructor(atlas: SpriteAtlas, actions: HudActions) {
    this.date = el('span', { class: 'hud-date', text: 'Año 1 · Mes 1' });
    this.total = el('span', { class: 'hud-total' });
    const count = (icon: string, title: string): [HTMLElement, HTMLElement] => {
      const n = el('span', { text: '0' });
      return [el('span', { class: 'hud-count', title }, [el('img', { attrs: { src: icon, alt: '' } }), n]), n];
    };
    const [herbEl, herb] = count(speciesIcon(Species.SHEEP, atlas), 'Herbívoros');
    const [predEl, pred] = count(speciesIcon(Species.WOLF, atlas), 'Depredadores');
    const [peopleEl, people] = count(speciesIcon(Species.HUMAN, atlas), 'Habitantes');
    const [villEl, vill] = count(gridIcon('house'), 'Aldeas');
    const [warEl, war] = count(gridIcon('sword'), 'Guerras activas');
    this.counts = { herbivores: herb, predators: pred, people, villages: vill, wars: war };
    const pop = el('div', { class: 'hud-pop' }, [herbEl, predEl, peopleEl, villEl, warEl, this.total]);
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

  update(tick: number, c: HudCounts): void {
    const d = tickToDate(tick);
    this.date.textContent = `Año ${d.year} · Mes ${d.month}`;
    this.counts.herbivores.textContent = String(c.herbivores);
    this.counts.predators.textContent = String(c.predators);
    this.counts.people.textContent = String(c.people);
    this.counts.villages.textContent = String(c.villages);
    this.counts.wars.textContent = String(c.wars);
    this.total.textContent = `${c.total}/${c.limit}`;
    this.total.classList.toggle('is-full', c.total >= c.limit);
  }
}
