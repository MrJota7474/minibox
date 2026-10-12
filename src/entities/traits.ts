import type { Rng } from '../core/rng';

/** Modificadores que aplica un rasgo (multiplicadores; 1 = sin efecto). */
export interface TraitMods {
  damage: number;
  damageTaken: number;
  lifespan: number;
  /** Tiempo de espera entre crías. */
  breedCooldown: number;
  hunger: number;
  work: number;
  heal: number;
  plagueImmune: boolean;
}

export interface TraitDef {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly mods: Partial<TraitMods>;
  /** Se transmite a las crías (si no, sólo se adquiere por hechos). */
  readonly inheritable: boolean;
  /** Rasgo incompatible (no pueden coexistir). */
  readonly opposite?: number;
}

export const Trait = {
  STRONG: 0,
  WEAK: 1,
  STURDY: 2,
  FRAIL: 3,
  LONG_LIVED: 4,
  SHORT_LIVED: 5,
  FERTILE: 6,
  BARREN: 7,
  GLUTTON: 8,
  FRUGAL: 9,
  HARDWORKING: 10,
  LAZY: 11,
  HEALER: 12,
  LUCKY: 13,
  UNLUCKY: 14,
  BRAVE: 15,
  GIANT: 16,
  SMALL: 17,
  IMMUNE: 18,
  VETERAN: 19,
  SURVIVOR: 20,
} as const;

export const TRAITS: readonly TraitDef[] = [
  { id: 0, name: 'Fuerte', description: '+30 % de daño', mods: { damage: 1.3 }, inheritable: true, opposite: 1 },
  { id: 1, name: 'Débil', description: '−30 % de daño', mods: { damage: 0.7 }, inheritable: true, opposite: 0 },
  { id: 2, name: 'Robusto', description: 'Recibe un 25 % menos de daño', mods: { damageTaken: 0.75 }, inheritable: true, opposite: 3 },
  { id: 3, name: 'Frágil', description: 'Recibe un 25 % más de daño', mods: { damageTaken: 1.25 }, inheritable: true, opposite: 2 },
  { id: 4, name: 'Longevo', description: 'Vive un 30 % más', mods: { lifespan: 1.3 }, inheritable: true, opposite: 5 },
  { id: 5, name: 'Efímero', description: 'Vive un 30 % menos', mods: { lifespan: 0.7 }, inheritable: true, opposite: 4 },
  { id: 6, name: 'Fértil', description: 'Tiene crías más a menudo', mods: { breedCooldown: 0.7 }, inheritable: true, opposite: 7 },
  { id: 7, name: 'Poco fértil', description: 'Tarda más en tener crías', mods: { breedCooldown: 1.6 }, inheritable: true, opposite: 6 },
  { id: 8, name: 'Glotón', description: 'Pasa hambre un 30 % antes', mods: { hunger: 1.3 }, inheritable: true, opposite: 9 },
  { id: 9, name: 'Frugal', description: 'Pasa hambre un 25 % más tarde', mods: { hunger: 0.75 }, inheritable: true, opposite: 8 },
  { id: 10, name: 'Trabajador', description: 'Trabaja un 25 % más rápido', mods: { work: 1.25 }, inheritable: true, opposite: 11 },
  { id: 11, name: 'Perezoso', description: 'Trabaja un 25 % más lento', mods: { work: 0.75 }, inheritable: true, opposite: 10 },
  { id: 12, name: 'Sanador', description: 'Se cura el doble de rápido', mods: { heal: 2 }, inheritable: true },
  { id: 13, name: 'Afortunado', description: 'Recibe menos daño y vive algo más', mods: { damageTaken: 0.85, lifespan: 1.1 }, inheritable: true, opposite: 14 },
  { id: 14, name: 'Gafe', description: 'Recibe un 15 % más de daño', mods: { damageTaken: 1.15 }, inheritable: true, opposite: 13 },
  { id: 15, name: 'Valiente', description: '+15 % de daño', mods: { damage: 1.15 }, inheritable: true },
  { id: 16, name: 'Gigante', description: 'Más daño y aguante, pero come más', mods: { damage: 1.2, damageTaken: 0.9, hunger: 1.2 }, inheritable: true, opposite: 17 },
  { id: 17, name: 'Menudo', description: 'Come menos y pega menos', mods: { damage: 0.9, hunger: 0.8 }, inheritable: true, opposite: 16 },
  { id: 18, name: 'Inmune nato', description: 'No contrae la plaga', mods: { plagueImmune: true }, inheritable: true },
  { id: 19, name: 'Veterano', description: 'Curtido en combate: +20 % de daño', mods: { damage: 1.2 }, inheritable: false },
  { id: 20, name: 'Superviviente', description: 'Sobrevivió a la plaga: recibe un 10 % menos de daño', mods: { damageTaken: 0.9 }, inheritable: false },
];

const NEUTRAL: TraitMods = { damage: 1, damageTaken: 1, lifespan: 1, breedCooldown: 1, hunger: 1, work: 1, heal: 1, plagueImmune: false };
const cache = new Map<number, TraitMods>();

/** Modificadores combinados de una máscara de rasgos (memorizados). */
export function traitMods(mask: number): TraitMods {
  if (mask === 0) return NEUTRAL;
  const hit = cache.get(mask);
  if (hit) return hit;
  const m = { ...NEUTRAL };
  for (const t of TRAITS) {
    if ((mask & (1 << t.id)) === 0) continue;
    const mods = t.mods;
    if (mods.damage) m.damage *= mods.damage;
    if (mods.damageTaken) m.damageTaken *= mods.damageTaken;
    if (mods.lifespan) m.lifespan *= mods.lifespan;
    if (mods.breedCooldown) m.breedCooldown *= mods.breedCooldown;
    if (mods.hunger) m.hunger *= mods.hunger;
    if (mods.work) m.work *= mods.work;
    if (mods.heal) m.heal *= mods.heal;
    if (mods.plagueImmune) m.plagueImmune = true;
  }
  cache.set(mask, m);
  return m;
}

export function hasTrait(mask: number, id: number): boolean {
  return (mask & (1 << id)) !== 0;
}

/** Añade un rasgo quitando su opuesto. */
export function addTrait(mask: number, id: number): number {
  const opposite = TRAITS[id].opposite;
  const cleared = opposite === undefined ? mask : mask & ~(1 << opposite);
  return (cleared | (1 << id)) >>> 0;
}

export function traitNames(mask: number): string[] {
  return TRAITS.filter((t) => hasTrait(mask, t.id)).map((t) => t.name);
}

const INHERIT_CHANCE = 0.5;
const MUTATION_CHANCE = 0.12;
const INHERITABLE = TRAITS.filter((t) => t.inheritable).map((t) => t.id);

/** Rasgos aleatorios de una criatura nueva (0 a 2). */
export function randomTraits(rng: Rng): number {
  let mask = 0;
  const n = rng.int(3);
  for (let k = 0; k < n; k++) mask = addTrait(mask, INHERITABLE[rng.int(INHERITABLE.length)]);
  return mask;
}

/** Herencia: cada rasgo heredable de los padres pasa con un 50 %, y a veces muta uno nuevo. */
export function inheritTraits(a: number, b: number, rng: Rng): number {
  let mask = 0;
  for (const id of INHERITABLE) {
    if ((hasTrait(a, id) || hasTrait(b, id)) && rng.chance(INHERIT_CHANCE)) mask = addTrait(mask, id);
  }
  if (rng.chance(MUTATION_CHANCE)) mask = addTrait(mask, INHERITABLE[rng.int(INHERITABLE.length)]);
  return mask;
}
