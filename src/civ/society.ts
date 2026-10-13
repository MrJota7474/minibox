import type { AiContext } from '../ai/context';
import { hashMix } from '../core/hash';
import { TICKS_PER_YEAR } from '../core/time';
import { isCivilized } from '../entities/species';
import type { UnitStore } from '../entities/units';
import type { CivSystem } from './civ-system';
import type { Kingdom } from './kingdoms';
import type { Village } from './model';
import { clanName, cultureName, mix, religionName } from './names';

/**
 * Cultura, religión y clanes: tres capas sociales sobre las aldeas y los reinos.
 * Son objetos planos (se guardan tal cual en la partida) y sus nombres y rasgos salen
 * de una mezcla de enteros, sin consumir el azar de la simulación.
 */

export interface Culture {
  readonly id: number;
  readonly name: string;
  readonly race: number;
  readonly founded: number;
  /** Aldea donde nació. */
  readonly origin: number;
  readonly trait: number;
  /** Saber acumulado y tecnologías descubiertas (0-4, en el orden de TECHS). */
  knowledge: number;
  level: number;
}

export interface Religion {
  readonly id: number;
  readonly name: string;
  readonly race: number;
  readonly founded: number;
  readonly origin: number;
  readonly tenet: number;
}

export interface Clan {
  readonly id: number;
  readonly name: string;
  readonly race: number;
  readonly founded: number;
  /** Miembros vivos (se recuenta en cada censo). */
  members: number;
  /** Reyes que ha dado. */
  crowns: number;
}

interface Named {
  readonly name: string;
  readonly description: string;
}

export const CultureTrait = { INDUSTRIOUS: 0, WARLIKE: 1, WELCOMING: 2, SCHOLARLY: 3 } as const;
export const CULTURE_TRAITS: readonly Named[] = [
  { name: 'Laboriosa', description: 'Trabajan un 10 % más rápido' },
  { name: 'Belicosa', description: 'Sus guerreros pegan un 10 % más fuerte, pero se llevan peor con otras culturas' },
  { name: 'Hospitalaria', description: 'Sus aldeas son más leales y caen mejor a los demás reinos' },
  { name: 'Erudita', description: 'Acumula saber un 50 % más deprisa' },
];

/** Tecnologías en el orden en que se descubren; el valor es el nivel de cultura necesario. */
export const Tech = { FARMING: 1, MASONRY: 2, FORGE: 3, MEDICINE: 4 } as const;
export const TECHS: readonly Named[] = [
  { name: 'Agricultura', description: 'Cosechas un 25 % mayores' },
  { name: 'Albañilería', description: 'Las obras avanzan un 30 % más rápido' },
  { name: 'Forja', description: 'Las armas de hierro hacen un 25 % más de daño' },
  { name: 'Medicina', description: 'Las heridas se curan el doble de rápido' },
];
/** Saber necesario para cada tecnología. */
const TECH_KNOWLEDGE: readonly number[] = [40, 120, 280, 520];

export const Tenet = { PEACEFUL: 0, ZEALOUS: 1, DEVOUT: 2 } as const;
export const TENETS: readonly Named[] = [
  { name: 'Pacífica', description: 'Mira mejor a todos los reinos y firma antes la paz' },
  { name: 'Celosa', description: 'Une a sus fieles y detesta a los reinos de otra fe' },
  { name: 'Devota', description: 'Sus aldeas son más leales a un reino de su misma fe' },
];

const ADULTS_PER_KNOWLEDGE = 10;
const SCHOLARLY_BONUS = 1.5;
/** Años bajo otro reino antes de que una aldea pueda adoptar la cultura de la capital. */
const ASSIMILATION_TICKS = 15 * TICKS_PER_YEAR;
const ASSIMILATION_CHANCE = 0.08;
const CONVERSION_CHANCE = 0.1;
/** Distancia a la que la fe de una aldea vecina llega a un santuario nuevo, y probabilidad de adoptarla. */
const FAITH_REACH = 45;
const NEIGHBOR_FAITH_PERCENT = 60;
/** Clanes con los que nace una aldea. */
const CLANS_PER_VILLAGE = 2;
const MAX_CLANS = 60000;
/** Tiempo que dura el descontento tras un cambio de dinastía. */
export const DYNASTY_UNREST_TICKS = 10 * TICKS_PER_YEAR;

// ---------- Creación ----------

export function createCulture(civ: CivSystem, v: Village): Culture {
  const id = civ.cultures.length;
  const seed = mix(id * 7919 + v.id * 131 + v.founded);
  const c: Culture = { id, name: cultureName(v.race, seed), race: v.race, founded: civ.tick, origin: v.id, trait: mix(seed + 5) % CULTURE_TRAITS.length, knowledge: 0, level: 0 };
  civ.cultures.push(c);
  return c;
}

function foundReligion(civ: CivSystem, v: Village): Religion {
  const id = civ.religions.length;
  const seed = mix(id * 6007 + v.id * 173 + civ.tick);
  const r: Religion = { id, name: religionName(v.race, seed), race: v.race, founded: civ.tick, origin: v.id, tenet: mix(seed + 9) % TENETS.length };
  civ.religions.push(r);
  return r;
}

function createClan(civ: CivSystem, v: Village): Clan {
  const id = civ.clans.length;
  const c: Clan = { id, name: clanName(v.race, mix(id * 4447 + v.id * 97)), race: v.race, founded: civ.tick, members: 0, crowns: 0 };
  civ.clans.push(c);
  return c;
}

// ---------- Consultas ----------

export function cultureOf(civ: CivSystem, v: Village | null): Culture | null {
  return v ? (civ.cultures[v.culture] ?? null) : null;
}

export function faithOf(civ: CivSystem, v: Village | null): Religion | null {
  return v && v.religion >= 0 ? (civ.religions[v.religion] ?? null) : null;
}

/** La fe de un reino es la de su capital. */
export function kingdomFaith(civ: CivSystem, K: Kingdom): Religion | null {
  return faithOf(civ, civ.villages[K.capital] ?? null);
}

export function hasTech(civ: CivSystem, v: Village | null, tech: number): boolean {
  const c = cultureOf(civ, v);
  return c !== null && c.level >= tech;
}

function hasTrait(civ: CivSystem, v: Village | null, trait: number): boolean {
  return cultureOf(civ, v)?.trait === trait;
}

/** Multiplicadores que la cultura de una aldea da a sus aldeanos (1 = sin efecto). */
export const workBonus = (civ: CivSystem, v: Village | null): number => (hasTrait(civ, v, CultureTrait.INDUSTRIOUS) ? 1.1 : 1);
export const farmBonus = (civ: CivSystem, v: Village | null): number => (hasTech(civ, v, Tech.FARMING) ? 1.25 : 1);
export const buildBonus = (civ: CivSystem, v: Village | null): number => (hasTech(civ, v, Tech.MASONRY) ? 1.3 : 1);
export const gearBonus = (civ: CivSystem, v: Village | null): number => (hasTech(civ, v, Tech.FORGE) ? 1.25 : 1);
export const warriorBonus = (civ: CivSystem, v: Village | null): number => (hasTrait(civ, v, CultureTrait.WARLIKE) ? 1.1 : 1);
export const healBonus = (civ: CivSystem, v: Village | null): number => (hasTech(civ, v, Tech.MEDICINE) ? 2 : 1);

// ---------- Religión ----------

/** Al terminar su santuario, una aldea sin fe adopta la de su capital o la de una vecina, o funda una. */
export function onShrineBuilt(civ: CivSystem, v: Village): void {
  if (v.religion >= 0) return;
  const K = civ.kingdoms.kingdoms[v.kingdom];
  const capital = K ? civ.villages[K.capital] : undefined;
  let faith = capital && capital.religion >= 0 ? capital.religion : -1;
  if (faith < 0 && mix(v.id * 977 + civ.tick) % 100 < NEIGHBOR_FAITH_PERCENT) faith = nearestFaith(civ, v);
  if (faith >= 0) {
    v.religion = faith;
    civ.addEvent('faith', v.id, `${v.name} adopta una fe: ${civ.religions[faith].name}`);
    return;
  }
  const r = foundReligion(civ, v);
  v.religion = r.id;
  civ.addEvent('faith', v.id, `Nace en ${v.name} una religión: ${r.name}`);
}

function nearestFaith(civ: CivSystem, v: Village): number {
  let best = -1;
  let bestD = FAITH_REACH * FAITH_REACH;
  for (const o of civ.villages) {
    if (!o.alive || o.id === v.id || o.religion < 0) continue;
    const d = (o.cx - v.cx) * (o.cx - v.cx) + (o.cy - v.cy) * (o.cy - v.cy);
    if (d < bestD) {
      bestD = d;
      best = o.religion;
    }
  }
  return best;
}

// ---------- Pasada periódica (con la de los reinos) ----------

/** Saber y descubrimientos de cada cultura, asimilación cultural y conversiones religiosas. */
export function stepSociety(civ: CivSystem, ctx: AiContext): void {
  for (const v of civ.villages) {
    const c = v.alive ? cultureOf(civ, v) : null;
    if (c) c.knowledge += (v.adults / ADULTS_PER_KNOWLEDGE) * (c.trait === CultureTrait.SCHOLARLY ? SCHOLARLY_BONUS : 1);
  }
  for (const c of civ.cultures) {
    while (c.level < TECHS.length && c.knowledge >= TECH_KNOWLEDGE[c.level]) {
      c.level++;
      civ.addEvent('culture', c.origin, `La cultura ${c.name} descubre: ${TECHS[c.level - 1].name}`);
    }
  }
  for (const v of civ.villages) {
    if (!v.alive) continue;
    const K = civ.kingdoms.kingdoms[v.kingdom];
    const capital = K ? civ.villages[K.capital] : undefined;
    if (!capital || capital.id === v.id) continue;
    const since = Math.max(v.founded, v.capturedTick);
    if (v.culture !== capital.culture && civ.tick - since >= ASSIMILATION_TICKS && ctx.rng.chance(ASSIMILATION_CHANCE)) {
      v.culture = capital.culture;
      civ.addEvent('culture', v.id, `${v.name} adopta la cultura ${civ.cultures[capital.culture]?.name ?? ''}`);
    }
    if (v.religion >= 0 && capital.religion >= 0 && v.religion !== capital.religion && ctx.rng.chance(CONVERSION_CHANCE)) {
      v.religion = capital.religion;
      civ.addEvent('faith', v.id, `${v.name} se convierte a la fe de su reino: ${civ.religions[capital.religion].name}`);
    }
  }
}

// ---------- Clanes ----------

/**
 * Recuento de clanes (en cada censo): quien vive en una aldea y no tiene clan funda uno
 * si la aldea tiene menos de dos, o entra en el menos numeroso.
 */
export function assignClans(civ: CivSystem, u: UnitStore): void {
  for (const c of civ.clans) c.members = 0;
  const tallies = new Map<number, Map<number, number>>();
  const tallyOf = (village: number): Map<number, number> => {
    let t = tallies.get(village);
    if (!t) {
      t = new Map<number, number>();
      tallies.set(village, t);
    }
    return t;
  };
  const pending: number[] = [];
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0 || !isCivilized(u.species[i])) continue;
    const clan = civ.clans[u.clan[i] - 1];
    const village = u.village[i];
    if (clan) {
      clan.members++;
      if (village >= 0) tallyOf(village).set(clan.id, (tallyOf(village).get(clan.id) ?? 0) + 1);
    } else if (village >= 0 && civ.villages[village]?.alive) {
      pending.push(i);
    }
  }
  for (const i of pending) {
    const village = u.village[i];
    const t = tallyOf(village);
    let pick = -1;
    if (t.size >= CLANS_PER_VILLAGE || civ.clans.length >= MAX_CLANS) {
      // El menos numeroso (a igualdad, el que llegó antes a la aldea: orden estable).
      for (const [id, n] of t) if (pick < 0 || n < (t.get(pick) ?? 0)) pick = id;
    }
    if (pick < 0) {
      if (civ.clans.length >= MAX_CLANS) continue;
      pick = createClan(civ, civ.villages[village]).id;
    }
    u.clan[i] = pick + 1;
    civ.clans[pick].members++;
    t.set(pick, (t.get(pick) ?? 0) + 1);
  }
}

// ---------- Guardado ----------

/** Partidas anteriores a la versión 5: una cultura por reino, sin fe y sin casa reinante. */
export function migrateSociety(civ: CivSystem): void {
  const byKingdom = new Map<number, number>();
  for (const v of civ.villages) {
    if (typeof v.culture !== 'number') {
      let culture = byKingdom.get(v.kingdom);
      if (culture === undefined) {
        const K = civ.kingdoms.kingdoms[v.kingdom];
        culture = createCulture(civ, (K && civ.villages[K.capital]) || v).id;
        byKingdom.set(v.kingdom, culture);
      }
      v.culture = culture;
    }
    if (typeof v.religion !== 'number') v.religion = -1;
  }
  for (const K of civ.kingdoms.kingdoms) {
    if (typeof K.clan !== 'number') K.clan = -1;
    if (typeof K.dynastyTick !== 'number') K.dynastyTick = -1e9;
  }
}

export function societyHash(civ: CivSystem): number {
  let h = 0x50c1e7;
  for (const c of civ.cultures) {
    h = hashMix(h, c.level);
    h = hashMix(h, Math.round(c.knowledge * 10));
  }
  h = hashMix(h, civ.religions.length);
  for (const c of civ.clans) {
    h = hashMix(h, c.members);
    h = hashMix(h, c.crowns);
  }
  return h;
}
