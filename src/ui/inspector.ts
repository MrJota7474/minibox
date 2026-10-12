import { ticksToYears } from '../core/time';
import { SPECIES } from '../entities/species';
import { STATE_LABELS, Sex } from '../entities/units';
import type { SpriteAtlas } from '../render/sprites';
import type { Simulation } from '../sim/simulation';
import { BIOME_INFO, FLORA_NAMES, TERRAIN_INFO, isFertileTerrain, isWaterTerrain } from '../world/terrain';
import { el, iconButton, setPressed } from './dom';
import { gridIcon, speciesIcon } from './icons';

export interface InspectorActions {
  close(): void;
  toggleFollow(): void;
}

type Target = { kind: 'unit'; handle: number } | { kind: 'tile'; index: number } | null;

/** Panel de inspección: criatura (stats básicas) o casilla. Lateral en PC, hoja inferior en móvil. */
export class Inspector {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly portrait: HTMLImageElement;
  private readonly body: HTMLElement;
  private readonly followBtn: HTMLButtonElement;
  private target: Target = null;

  constructor(
    private readonly atlas: SpriteAtlas,
    actions: InspectorActions,
  ) {
    this.title = el('h2', { class: 'insp-title' });
    this.portrait = el('img', { class: 'insp-portrait', attrs: { alt: '' } });
    this.body = el('dl', { class: 'insp-body' });
    this.followBtn = iconButton(gridIcon('follow'), 'Seguir con la cámara', { showLabel: true, onClick: () => actions.toggleFollow() });
    this.root = el('aside', { class: 'inspector', attrs: { 'aria-label': 'Inspector', hidden: '' } }, [
      el('div', { class: 'insp-head' }, [
        this.portrait,
        this.title,
        iconButton(gridIcon('close'), 'Cerrar (Esc)', { class: 'btn-close', onClick: () => actions.close() }),
      ]),
      this.body,
      el('div', { class: 'insp-actions' }, [this.followBtn]),
    ]);
  }

  get isOpen(): boolean {
    return this.target !== null;
  }

  showUnit(handle: number): void {
    this.target = { kind: 'unit', handle };
    this.root.hidden = false;
  }

  showTile(index: number): void {
    this.target = { kind: 'tile', index };
    this.root.hidden = false;
  }

  hide(): void {
    this.target = null;
    this.root.hidden = true;
  }

  setFollowing(on: boolean): void {
    setPressed(this.followBtn, on);
  }

  update(sim: Simulation): void {
    if (!this.target) return;
    if (this.target.kind === 'unit') this.renderUnit(sim, this.target.handle);
    else this.renderTile(sim, this.target.index);
  }

  private rows(pairs: readonly (readonly [string, string | HTMLElement])[]): void {
    this.body.replaceChildren(...pairs.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, [v])]));
  }

  private bar(value: number, max: number, cls: string): HTMLElement {
    const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    return el('span', { class: `bar ${cls}`, attrs: { role: 'meter', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' } }, [
      el('span', { class: 'bar-fill', attrs: { style: `width:${pct}%` } }),
      el('span', { class: 'bar-text', text: `${Math.max(0, value)}/${max}` }),
    ]);
  }

  private renderUnit(sim: Simulation, handle: number): void {
    const u = sim.units;
    const i = u.resolve(handle);
    this.followBtn.hidden = i < 0;
    if (i < 0) {
      this.title.textContent = 'Ha muerto';
      this.body.replaceChildren(el('p', { class: 'insp-note', text: 'Esta criatura ya no forma parte del mundo.' }));
      return;
    }
    const def = SPECIES[u.species[i]];
    this.portrait.src = speciesIcon(def.id, this.atlas);
    this.portrait.hidden = false;
    this.title.textContent = `${def.name} ${u.sex[i] === Sex.FEMALE ? '♀' : '♂'}`;
    const adult = u.age[i] >= def.adultTicks;
    const rows: [string, string | HTMLElement][] = [
      ['Edad', `${ticksToYears(u.age[i])} años${adult ? '' : ' (cría)'}`],
      ['Vida', this.bar(u.hp[i], def.maxHp, 'bar-hp')],
      ['Saciedad', this.bar(u.hunger[i], def.maxHunger, 'bar-food')],
      ['Estado', STATE_LABELS[u.state[i]]],
      ['Generación', String(u.generation[i])],
    ];
    if (def.diet === 'carnivore') rows.push(['Presas', String(u.kills[i])]);
    this.rows(rows);
  }

  private renderTile(sim: Simulation, index: number): void {
    const w = sim.world;
    const t = w.terrain[index];
    this.followBtn.hidden = true;
    this.portrait.hidden = true;
    this.title.textContent = TERRAIN_INFO[t].name;
    const rows: [string, string | HTMLElement][] = [['Altura', String(w.heightMap[index])]];
    if (!isWaterTerrain(t)) {
      rows.push(['Bioma', BIOME_INFO[w.biome[index]].name]);
      if (isFertileTerrain(t)) rows.push(['Hierba', this.bar(w.grass[index], Math.max(1, BIOME_INFO[w.biome[index]].grassMax), 'bar-food')]);
      rows.push(['Vegetación', FLORA_NAMES[w.flora[index]]]);
    }
    this.rows(rows);
  }
}
