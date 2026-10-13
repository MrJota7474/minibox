import { PERSONALITY_NAMES } from '../civ/kingdoms';
import { BUILDING_DEFS, BuildingType, JOB_NAMES, RESOURCE_NAMES, VILLAGE_COLORS, hallLevelName, type Village } from '../civ/model';
import { BOAT_KIND_NAMES, BOAT_STATE_NAMES } from '../civ/boats';
import { CULTURE_TRAITS, TECHS, TENETS, cultureOf, faithOf } from '../civ/society';
import type { DiplomacyAction } from '../sim/commands';
import { Status, damageMultiplier, damageTakenMultiplier } from '../powers/status';
import { TRAITS, hasTrait, traitMods } from '../entities/traits';
import { personName } from '../civ/names';
import { tickToDate, ticksToYears } from '../core/time';
import { SPECIES } from '../entities/species';
import { STATE_LABELS, Sex } from '../entities/units';
import type { CreatureAtlas } from '../render/creature-art';
import type { Simulation } from '../sim/simulation';
import { BIOME_INFO, FLORA_NAMES, TERRAIN_INFO, isFertileTerrain, isWaterTerrain } from '../world/terrain';
import { el, iconButton, setPressed } from './dom';
import { gridIcon, speciesIcon } from './icons';

export interface InspectorActions {
  close(): void;
  toggleFollow(): void;
  /** Poder de dios sobre la diplomacia. */
  diplomacy(action: DiplomacyAction, a: number, b: number): void;
}

const MAX_DIPLOMACY_ROWS = 6;

type Target = { kind: 'unit'; handle: number } | { kind: 'tile'; index: number } | { kind: 'village'; id: number } | { kind: 'boat'; id: number } | null;
type Row = readonly [string, string | HTMLElement];

/** Panel de inspección: criatura, aldea o casilla. Lateral en PC, hoja inferior en móvil. */
export class Inspector {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly portrait: HTMLImageElement;
  private readonly body: HTMLElement;
  private readonly followBtn: HTMLButtonElement;
  private readonly diplo: HTMLElement;
  private diploKey = '';
  private target: Target = null;

  constructor(
    private readonly atlas: CreatureAtlas,
    private readonly actions: InspectorActions,
  ) {
    this.diplo = el('div', { class: 'insp-diplo', attrs: { hidden: '' } });
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
      this.diplo,
      el('div', { class: 'insp-actions' }, [this.followBtn]),
    ]);
  }

  get isOpen(): boolean {
    return this.target !== null;
  }

  showUnit(handle: number): void {
    this.open({ kind: 'unit', handle });
  }

  showTile(index: number): void {
    this.open({ kind: 'tile', index });
  }

  showVillage(id: number): void {
    this.open({ kind: 'village', id });
  }

  showBoat(id: number): void {
    this.open({ kind: 'boat', id });
  }

  private open(target: Target): void {
    this.target = target;
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
    const t = this.target;
    if (!t) return;
    if (t.kind !== 'village') this.hideDiplomacy();
    if (t.kind === 'unit') this.renderUnit(sim, t.handle);
    else if (t.kind === 'village') this.renderVillage(sim, t.id);
    else if (t.kind === 'boat') this.renderBoat(sim, t.id);
    else this.renderTile(sim, t.index);
  }

  private rows(pairs: readonly Row[]): void {
    this.body.replaceChildren(...pairs.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, [v])]));
  }

  private bar(value: number, max: number, cls: string): HTMLElement {
    const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    return el('span', { class: `bar ${cls}`, attrs: { role: 'meter', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' } }, [
      el('span', { class: 'bar-fill', attrs: { style: `width:${pct}%` } }),
      el('span', { class: 'bar-text', text: `${Math.max(0, Math.round(value))}/${max}` }),
    ]);
  }

  private setPortrait(species: number | null): void {
    this.portrait.hidden = species === null;
    if (species !== null) this.portrait.src = speciesIcon(species, this.atlas);
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
    this.setPortrait(def.id);
    const sex = u.sex[i] === Sex.FEMALE ? '♀' : '♂';
    const civilized = def.diet === 'civilized';
    const monster = def.monster;
    // Los monstruos no tienen sexo, ni pasan hambre, ni heredan rasgos.
    this.title.textContent = civilized ? `${personName(def.id, u.nameSeed[i])} ${sex}` : monster ? def.name : `${def.name} ${sex}`;
    const adult = u.age[i] >= def.adultTicks;
    const rows: Row[] = [];
    if (civilized) rows.push(['Raza', def.name]);
    rows.push(['Edad', `${ticksToYears(u.age[i])} años${adult ? '' : ' (cría)'}`], ['Vida', this.bar(u.hp[i], def.maxHp, 'bar-hp')]);
    if (!monster) rows.push(['Saciedad', this.bar(u.hunger[i], def.maxHunger, 'bar-food')]);
    rows.push(['Estado', monster && u.cooldown[i] > 0 ? `${STATE_LABELS[u.state[i]]} (en calma)` : STATE_LABELS[u.state[i]]]);
    if (monster) rows.push(['Naturaleza', monster.trait]);
    if (civilized) {
      const v = sim.civ.villageOf(i);
      const k = sim.civ.kingdoms.kingdomOfUnit(i);
      rows.push(['Aldea', v ? v.name : 'Sin aldea'], ['Reino', k >= 0 ? sim.civ.kingdoms.kingdoms[k].name : '—'], ['Oficio', adult ? JOB_NAMES[u.job[i]] : 'Ninguno (cría)']);
      if (u.gear[i]) rows.push(['Equipo', 'Armas de hierro']);
      if (u.carry[i] !== 0) rows.push(['Carga', `${u.carryAmount[i]} de ${RESOURCE_NAMES[u.carry[i] - 1].toLowerCase()}`]);
      if (def.race) rows.push(['Don racial', def.race.trait]);
      const clan = sim.civ.clans[u.clan[i] - 1];
      if (clan) rows.push(['Clan', k >= 0 && sim.civ.kingdoms.kingdoms[k].clan === clan.id ? `${clan.name} (casa reinante)` : clan.name]);
    }
    const states = [
      u.status[i] & Status.BLESSED ? 'Bendecido' : '',
      u.status[i] & Status.CURSED ? 'Maldito' : '',
      u.plague[i] > 0 ? 'Con plaga' : '',
      u.mad[i] > 0 ? 'Enloquecido' : '',
      u.status[i] & Status.IMMUNE ? 'Inmune a la plaga' : '',
      u.status[i] & Status.ABOARD ? 'A bordo de un barco' : '',
    ].filter(Boolean);
    if (states.length > 0) rows.push(['Condición', states.join(' · ')]);
    if (!monster || u.traits[i] !== 0) rows.push(['Rasgos', this.traitChips(u.traits[i])]);
    rows.push(...this.statRows(sim, i));
    this.rows(rows);
  }

  private traitChips(mask: number): HTMLElement {
    const traits = TRAITS.filter((t) => hasTrait(mask, t.id));
    if (traits.length === 0) return el('span', { class: 'insp-muted', text: 'Ninguno' });
    return el(
      'span',
      { class: 'trait-chips' },
      traits.map((t) => el('span', { class: `chip${t.inheritable ? '' : ' chip-earned'}`, text: t.name, title: t.description })),
    );
  }

  /** Estadísticas: daño y aguante efectivos, esperanza de vida, descendencia y bajas. */
  private statRows(sim: Simulation, i: number): Row[] {
    const u = sim.units;
    const def = SPECIES[u.species[i]];
    const mods = traitMods(u.traits[i]);
    const pct = (m: number): string => `${Math.round(m * 100)} %`;
    const rows: Row[] = [];
    if (def.damage > 0) rows.push(['Fuerza', `${def.damage} · ${pct(damageMultiplier(u, i))}`]);
    rows.push(['Daño recibido', pct(damageTakenMultiplier(u, i))]);
    rows.push(['Esperanza de vida', `${Math.round(ticksToYears(def.lifespanTicks) * mods.lifespan)} años`]);
    const animal = def.diet === 'herbivore' || def.diet === 'carnivore';
    if (!def.monster) rows.push(['Generación', String(u.generation[i])], ['Hijos', String(u.children[i])]);
    if (u.kills[i] > 0) rows.push([animal ? 'Presas' : 'Bajas', String(u.kills[i])]);
    return rows;
  }

  private dockCount(sim: Simulation, v: Village): number {
    return v.buildingIds.filter((id) => sim.civ.buildings[id].type === BuildingType.DOCK && sim.civ.buildings[id].level >= 1).length;
  }

  private renderBoat(sim: Simulation, id: number): void {
    const b = sim.civ.boats[id];
    this.followBtn.hidden = !b || !b.alive;
    this.setPortrait(null);
    if (!b || !b.alive) {
      this.title.textContent = 'Barco';
      this.body.replaceChildren(el('p', { class: 'insp-note', text: 'Este barco ya no navega (llegó a puerto o se hundió).' }));
      return;
    }
    this.title.textContent = BOAT_KIND_NAMES[b.kind];
    const v = sim.civ.villages[b.village];
    const K = b.kingdom >= 0 ? sim.civ.kingdoms.kingdoms[b.kingdom] : null;
    const target = b.target >= 0 ? sim.civ.villages[b.target] : null;
    const aboard = b.passengers.filter((h) => {
      const i = sim.units.resolve(h);
      return i >= 0 && (sim.units.status[i] & Status.ABOARD) !== 0;
    }).length;
    const rows: Row[] = [
      ['Puerto', v.name],
      ['Reino', K ? K.name : '—'],
      ['Estado', BOAT_STATE_NAMES[b.state]],
      ['A bordo', String(aboard)],
    ];
    if (target) rows.push(['Objetivo', target.name]);
    this.rows(rows);
  }

  private renderVillage(sim: Simulation, id: number): void {
    const v = sim.civ.villages[id];
    this.followBtn.hidden = true;
    if (!v || !v.alive) {
      this.setPortrait(null);
      this.title.textContent = v ? v.name : 'Aldea';
      this.body.replaceChildren(el('p', { class: 'insp-note', text: 'Esta aldea fue abandonada.' }));
      return;
    }
    this.setPortrait(v.race);
    this.title.textContent = v.name;
    const hall = sim.civ.building(v.hallId);
    const founded = tickToDate(v.founded);
    const rows: Row[] = [
      ['Raza', SPECIES[v.race].plural],
      ['Nivel', hall ? `${hallLevelName(hall.level)}${hall.underConstruction ? ' (mejorando)' : ''}` : '—'],
      ['Población', this.bar(v.population, Math.max(1, v.housing), 'bar-pop')],
      ...v.resources.map((r, k): Row => [RESOURCE_NAMES[k], `${Math.floor(r)} / ${v.storageCap}`]),
      ['Edificios', `${v.houses} viviendas · ${v.storages} almacenes · ${v.farms} granjas${this.dockCount(sim, v) > 0 ? ' · muelle' : ''}`],
      ['En obras', String(v.sites)],
      ['Territorio', `${v.zones} zonas`],
      ['Fundada', `Año ${founded.year}`],
      ...this.societyRows(sim, v),
    ];
    rows.push(...this.kingdomRows(sim, v));
    this.rows(rows);
    this.renderDiplomacy(sim, v);
  }

  /** Cultura (rasgo y saberes) y religión (precepto) de la aldea. */
  private societyRows(sim: Simulation, v: Village): Row[] {
    const rows: Row[] = [];
    const culture = cultureOf(sim.civ, v);
    if (culture) {
      const trait = CULTURE_TRAITS[culture.trait];
      rows.push(['Cultura', el('span', { text: `${culture.name} · ${trait.name}`, title: trait.description })]);
      const techs = TECHS.slice(0, culture.level);
      rows.push([
        'Saberes',
        techs.length === 0
          ? el('span', { class: 'insp-muted', text: 'Ninguno aún' })
          : el('span', { class: 'trait-chips' }, techs.map((t) => el('span', { class: 'chip', text: t.name, title: t.description }))),
      ]);
    }
    const faith = faithOf(sim.civ, v);
    const tenet = faith ? TENETS[faith.tenet] : null;
    rows.push(['Religión', faith && tenet ? el('span', { text: `${faith.name} · ${tenet.name}`, title: tenet.description }) : el('span', { class: 'insp-muted', text: 'Sin fe' })]);
    return rows;
  }

  private kingdomRows(sim: Simulation, v: Village): Row[] {
    const ks = sim.civ.kingdoms;
    const K = ks.kingdoms[v.kingdom];
    if (!K) return [];
    const leader = sim.units.resolve(v.leader);
    const house = sim.civ.clans[K.clan];
    const rows: Row[] = [
      ['Reino', K.capital === v.id ? `${K.name} (capital)` : K.name],
      ['Rey', `${ks.kingName(K)} · ${PERSONALITY_NAMES[K.personality]}`],
      ['Casa reinante', house ? `${house.name} · ${house.crowns} ${house.crowns === 1 ? 'rey' : 'reyes'}` : '—'],
      ['Líder', leader >= 0 ? personName(sim.units.species[leader], sim.units.nameSeed[leader]) : '—'],
      ['Lealtad', this.bar(v.loyalty, 100, 'bar-pop')],
    ];
    const wars = ks.activeWarsOf(K.id).length;
    if (wars > 0) rows.push(['Guerras', String(wars)]);
    if (v.captureProgress > 0 && v.captureBy >= 0) rows.push(['Asedio', this.bar(v.captureProgress, 100, 'bar-hp')]);
    return rows;
  }

  private hideDiplomacy(): void {
    this.diplo.hidden = true;
    this.diploKey = '';
  }

  /** Relaciones con otros reinos y botones para forzarlas (sólo se reconstruye si cambian). */
  private renderDiplomacy(sim: Simulation, v: Village): void {
    const ks = sim.civ.kingdoms;
    const K = ks.kingdoms[v.kingdom];
    if (!K) return this.hideDiplomacy();
    const others = ks.kingdoms.filter((o) => o.alive && o.id !== K.id).slice(0, MAX_DIPLOMACY_ROWS);
    const status = (o: number): string => (ks.areHostile(K.id, o) ? 'Guerra' : ks.areAllied(K.id, o) ? 'Alianza' : (K.truce[o] ?? 0) > sim.civ.tick ? 'Tregua' : 'Paz');
    const key = `${v.id}|${K.id}|${K.capital}|` + others.map((o) => `${o.id}:${status(o.id)}`).join(',');
    if (key === this.diploKey) return;
    this.diploKey = key;
    this.diplo.hidden = false;
    const button = (label: string, action: DiplomacyAction, a: number, b: number): HTMLButtonElement =>
      el('button', { class: 'btn btn-text btn-mini', text: label, attrs: { type: 'button' }, onClick: () => this.actions.diplomacy(action, a, b) });
    const rows = others.map((o) => {
      const st = status(o.id);
      return el('li', { class: 'diplo-row' }, [
        el('span', { class: 'diplo-name', text: o.name, attrs: { style: `color:${VILLAGE_COLORS[o.colorIndex]}` } }),
        el('span', { class: 'diplo-status', text: st }),
        st === 'Guerra' ? button('Paz', 'peace', K.id, o.id) : button('Guerra', 'war', K.id, o.id),
        st === 'Alianza' ? null : button('Alianza', 'alliance', K.id, o.id),
      ]);
    });
    this.diplo.replaceChildren(
      el('h3', { text: 'Diplomacia (poderes de dios)' }),
      rows.length > 0 ? el('ul', { class: 'diplo-list' }, rows) : el('p', { class: 'insp-note', text: 'No hay otros reinos.' }),
      ...(K.capital === v.id ? [] : [button('Provocar rebelión', 'rebellion', v.id, -1)]),
    );
  }

  private renderTile(sim: Simulation, index: number): void {
    this.hideDiplomacy();
    const w = sim.world;
    const t = w.terrain[index];
    this.followBtn.hidden = true;
    this.setPortrait(null);
    this.title.textContent = TERRAIN_INFO[t].name;
    const rows: Row[] = [['Altura', String(w.heightMap[index])]];
    if (!isWaterTerrain(t)) {
      rows.push(['Bioma', BIOME_INFO[w.biome[index]].name], ['Efecto', BIOME_INFO[w.biome[index]].description]);
      if (isFertileTerrain(t)) rows.push(['Hierba', this.bar(w.grass[index], Math.max(1, BIOME_INFO[w.biome[index]].grassMax), 'bar-food')]);
      rows.push(['Suelo', FLORA_NAMES[w.flora[index]]]);
    }
    const x = index % w.width;
    const owner = w.ownerAt(x, (index - x) / w.width);
    if (owner >= 0) rows.push(['Territorio', sim.civ.villages[owner].name]);
    const b = w.buildingAt[index];
    if (b > 0) {
      const building = sim.civ.buildings[b - 1];
      rows.push(['Edificio', BUILDING_DEFS[building.type].names[Math.max(0, building.level - 1)]]);
    }
    this.rows(rows);
  }
}
