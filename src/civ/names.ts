import { Species } from '../entities/species';

/** Sílabas propias de cada raza para nombres de personas y aldeas. */
const SYLLABLES: Readonly<Record<number, readonly string[]>> = {
  [Species.HUMAN]: ['al', 'ber', 'cas', 'dor', 'el', 'fran', 'gal', 'her', 'is', 'lor', 'mar', 'nor', 'ol', 'per', 'ros', 'san', 'ter', 'val', 'mi', 'na'],
  [Species.SILVAN]: ['ae', 'lin', 'thal', 'sil', 'wen', 'ny', 'ri', 'el', 'fae', 'lor', 'mi', 'ra', 'ith', 'van', 'la', 'yn'],
  [Species.PETRINO]: ['dur', 'gar', 'thor', 'bom', 'kaz', 'grim', 'bar', 'dun', 'rok', 'mur', 'brak', 'hil', 'dra', 'gon'],
  [Species.TUSKER]: ['gro', 'zug', 'mak', 'thar', 'ruk', 'gar', 'ok', 'bra', 'zog', 'kru', 'nak', 'ur', 'dash', 'mog'],
  [Species.SCALEFOLK]: ['ssa', 'thi', 'ka', 'lis', 'zeth', 'ish', 'ra', 'sek', 'tha', 'ix', 'sul', 'vash', 'ke', 'ssi'],
};

const VILLAGE_SUFFIX: Readonly<Record<number, readonly string[]>> = {
  [Species.HUMAN]: ['ia', 'ena', 'burgo', 'vado', 'mar'],
  [Species.SILVAN]: ['dor', 'wen', 'thil', 'aris'],
  [Species.PETRINO]: ['heim', 'dum', 'rok', 'garde'],
  [Species.TUSKER]: ['grak', 'ruk', 'zor', 'mash'],
  [Species.SCALEFOLK]: ['ssa', 'ith', 'kesh', 'zal'],
};

const CULTURE_SUFFIX: readonly string[] = ['ana', 'ense', 'ita', 'ica', 'ina'];
const FAITH_FORMS: readonly string[] = ['Culto de', 'Fe de', 'Senda de', 'Orden de'];

/** Mezcla un entero (pseudoaleatorio sin estado, no consume el RNG de la simulación). */
export function mix(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function personName(race: number, seed: number): string {
  const syl = SYLLABLES[race] ?? SYLLABLES[Species.HUMAN];
  const a = syl[mix(seed) % syl.length];
  const b = syl[mix(seed + 1) % syl.length];
  const third = mix(seed + 2) % 3 === 0 ? syl[mix(seed + 3) % syl.length] : '';
  return capitalize(a + b + third);
}

/** Nombre de una cultura («Valdorana»), con las sílabas de su raza. */
export function cultureName(race: number, seed: number): string {
  const syl = SYLLABLES[race] ?? SYLLABLES[Species.HUMAN];
  return capitalize(syl[mix(seed + 21) % syl.length] + syl[mix(seed + 22) % syl.length] + CULTURE_SUFFIX[mix(seed + 23) % CULTURE_SUFFIX.length]);
}

/** Nombre de una religión («Culto de Elmar»). */
export function religionName(race: number, seed: number): string {
  return `${FAITH_FORMS[mix(seed + 31) % FAITH_FORMS.length]} ${personName(race, mix(seed + 32))}`;
}

/** Nombre de un clan («Clan Durgar»). */
export function clanName(race: number, seed: number): string {
  const syl = SYLLABLES[race] ?? SYLLABLES[Species.HUMAN];
  return `Clan ${capitalize(syl[mix(seed + 41) % syl.length] + syl[mix(seed + 42) % syl.length])}`;
}

export function villageName(race: number, seed: number): string {
  const syl = SYLLABLES[race] ?? SYLLABLES[Species.HUMAN];
  const suf = VILLAGE_SUFFIX[race] ?? VILLAGE_SUFFIX[Species.HUMAN];
  return capitalize(syl[mix(seed) % syl.length] + syl[mix(seed + 7) % syl.length] + suf[mix(seed + 11) % suf.length]);
}
