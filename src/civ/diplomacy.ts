import type { AiContext } from '../ai/context';
import { TICKS_PER_YEAR } from '../core/time';
import { SPECIES } from '../entities/species';
import { totalStored, Job, type Village } from './model';
import { Personality, type Kingdom, type KingdomSystem } from './kingdoms';
import { personName } from './names';
import { navalReach } from './boats';
import { CultureTrait, DYNASTY_UNREST_TICKS, Tenet, cultureOf, kingdomFaith, stepSociety } from './society';

const WAR_OPINION = -25;
const ALLY_OPINION = 45;
const BREAK_ALLY_OPINION = 5;
const MAX_ALLIES = 2;
const REACH = 110;
const ARMY_REACH = 100;
/** Aldeas enemigas de otras islas que se comprueban como destino de una flota. */
const NAVAL_CANDIDATES = 3;
const MIN_WAR_TICKS = 2 * TICKS_PER_YEAR;
const MAX_WAR_TICKS = 12 * TICKS_PER_YEAR;
const REBEL_LOYALTY = 10;
/** Como mucho una rebelión cada 5 años por reino. */
const REBELLION_COOLDOWN = 5 * TICKS_PER_YEAR;
const REBEL_CHANCE = 0.15;
/** Años de ocupación antes de que una aldea conquistada pueda rebelarse. */
const OCCUPATION_TICKS = 6 * TICKS_PER_YEAR;
/** Un reino necesita asentarse antes de ir a la guerra. */
const MIN_KINGDOM_AGE = 15 * TICKS_PER_YEAR;
const MIN_WAR_ADULTS = 8;
const MIN_WAR_WARRIORS = 3;
/** El heredero preferido es el adulto mayor que no esté al final de su vida. */
const HEIR_MAX_AGE_FRACTION = 0.75;
/** Relación de fuerzas mínima para declarar una guerra, según la personalidad del rey. */
const POWER_RATIO: readonly number[] = [0.8, 2, 1.0, 1.3];

function dist(a: Village, b: Village): number {
  return Math.sqrt((a.cx - b.cx) * (a.cx - b.cx) + (a.cy - b.cy) * (a.cy - b.cy));
}

/** Fuerza militar aproximada: guerreros pesan más que el resto de adultos. */
export function kingdomPower(ks: KingdomSystem, k: number): number {
  let p = 0;
  for (const v of ks.villagesOf(k)) p += v.adults + v.jobCounts[Job.WARRIOR] * 3;
  return p;
}

function wealth(ks: KingdomSystem, k: number): number {
  let w = 0;
  for (const v of ks.villagesOf(k)) w += totalStored(v.resources);
  return w;
}

/** Pares de reinos cuyas fronteras se tocan (se recalcula en cada pasada de IA). */
function touchingPairs(ks: KingdomSystem, ctx: AiContext): Set<number> {
  const w = ctx.world;
  const pairs = new Set<number>();
  const kingdomOfZone = (z: number): number => (w.zoneOwner[z] === 0 ? -1 : ks.civ.villages[w.zoneOwner[z] - 1].kingdom);
  for (let zy = 0; zy < w.zonesY; zy++) {
    for (let zx = 0; zx < w.zonesX; zx++) {
      const a = kingdomOfZone(zy * w.zonesX + zx);
      if (a < 0) continue;
      const right = zx + 1 < w.zonesX ? kingdomOfZone(zy * w.zonesX + zx + 1) : -1;
      const down = zy + 1 < w.zonesY ? kingdomOfZone((zy + 1) * w.zonesX + zx) : -1;
      for (const b of [right, down]) {
        if (b >= 0 && b !== a) {
          pairs.add(a * 4096 + b);
          pairs.add(b * 4096 + a);
        }
      }
    }
  }
  return pairs;
}

/** Opinión del reino a sobre el b (negativa = hostil). */
export function opinion(ks: KingdomSystem, a: number, b: number, touching: Set<number>): number {
  const A = ks.kingdoms[a];
  const B = ks.kingdoms[b];
  let o = A.race === B.race ? 20 : -15;
  if (touching.has(a * 4096 + b)) o -= 25;
  if (A.personality === Personality.AGGRESSIVE) o -= 20;
  else if (A.personality === Personality.PEACEFUL) o += 20;
  else if (A.personality === Personality.WISE) o += 10;
  else if (wealth(ks, b) > wealth(ks, a)) o -= 15;
  o -= A.grievances[b] ?? 0;
  if (A.allies.includes(b)) o += 40;
  if ((A.truce[b] ?? 0) > ks.civ.tick) o += 15;
  if (ks.areHostile(a, b)) o -= 30;
  const ca = ks.civ.villages[A.capital];
  const cb = ks.civ.villages[B.capital];
  if (ca && cb && dist(ca, cb) > 80) o += 10;
  return o + societyOpinion(ks, A, B);
}

/** Lo que la cultura y la fe de cada reino (las de su capital) pesan en la opinión de A sobre B. */
function societyOpinion(ks: KingdomSystem, A: Kingdom, B: Kingdom): number {
  const civ = ks.civ;
  const ca = cultureOf(civ, civ.villages[A.capital] ?? null);
  const cb = cultureOf(civ, civ.villages[B.capital] ?? null);
  let o = 0;
  if (ca && cb) {
    if (ca.id === cb.id) o += 10;
    else o -= ca.trait === CultureTrait.WARLIKE ? 15 : 5;
  }
  if (cb?.trait === CultureTrait.WELCOMING) o += 10;
  const fa = kingdomFaith(civ, A);
  const fb = kingdomFaith(civ, B);
  if (fa?.tenet === Tenet.PEACEFUL) o += 15;
  if (fa && fb) {
    const zealous = fa.tenet === Tenet.ZEALOUS;
    o += fa.id === fb.id ? (zealous ? 25 : 20) : zealous ? -30 : -15;
  }
  return o;
}

/** Lealtad de una aldea a su reino. */
export function loyaltyOf(ks: KingdomSystem, v: Village): number {
  const K = ks.kingdoms[v.kingdom];
  if (K.capital === v.id) return 100;
  const capital = ks.civ.villages[K.capital];
  let l = 70;
  if (capital) l -= dist(v, capital) / 6;
  if (v.race !== K.race) l -= 25;
  if (v.capturedTick >= 0 && ks.civ.tick - v.capturedTick < 10 * TICKS_PER_YEAR) l -= 30;
  l -= Math.max(0, ks.villagesOf(K.id).length - 8) * 3;
  if (K.personality === Personality.WISE) l += 10;
  else if (K.personality === Personality.AGGRESSIVE) l -= 5;
  // Cultura, fe y linaje: lo que une o separa a la aldea de su capital.
  if (capital) {
    if (v.culture !== capital.culture) l -= 15;
    if (v.religion >= 0 && capital.religion >= 0) {
      if (v.religion !== capital.religion) l -= 15;
      else l += ks.civ.religions[v.religion]?.tenet === Tenet.DEVOUT ? 20 : 10;
    }
  }
  if (cultureOf(ks.civ, v)?.trait === CultureTrait.WELCOMING) l += 10;
  if (K.clan >= 0 && ks.leaderClan(v) === K.clan) l += 10;
  if (ks.civ.tick - K.dynastyTick < DYNASTY_UNREST_TICKS) l -= 15;
  return Math.max(0, Math.min(100, Math.round(l)));
}

/** Pasada periódica de decisiones de todos los reinos (en orden de id: determinista). */
export function runKingdomAi(ks: KingdomSystem, ctx: AiContext): void {
  const touching = touchingPairs(ks, ctx);
  for (const K of ks.kingdoms) {
    if (!K.alive) continue;
    const villages = ks.villagesOf(K.id);
    if (villages.length === 0) {
      ks.fall(K.id);
      continue;
    }
    ensureKing(ks, K, ctx);
    for (const v of villages) v.loyalty = loyaltyOf(ks, v);
    if (ctx.laws.rebellions && handleRebellions(ks, K, villages, ctx)) continue;
    considerPeace(ks, K, ctx);
    if (ctx.laws.wars) considerWar(ks, K, touching, ctx);
    considerAlliances(ks, K, touching);
    assignArmies(ks, K, villages, ctx);
  }
  stepSociety(ks.civ, ctx);
}

/**
 * Si el rey murió, hereda el adulto de más edad de su mismo clan (primero en la capital,
 * luego en el resto del reino). Si el linaje se ha extinguido, sube al trono otro clan
 * (el adulto de más edad de la capital o de la aldea más poblada): cambio de dinastía.
 */
function ensureKing(ks: KingdomSystem, K: Kingdom, ctx: AiContext): void {
  const u = ctx.units;
  const current = u.resolve(K.king);
  if (current >= 0 && ks.kingdomOfUnit(current) === K.id) {
    // El primer rey pudo coronarse antes de que el censo repartiera los clanes.
    const house = K.clan < 0 ? ks.civ.clans[u.clan[current] - 1] : undefined;
    if (house) {
      K.clan = house.id;
      house.crowns++;
    }
    return;
  }
  /** El mejor heredero de una aldea; con `clan` >= 0, sólo de ese clan (y entonces vale también un menor). */
  const pick = (villageId: number, clan: number, minors = false): number => {
    let best = -1;
    let oldest = -1;
    for (let i = 0; i < u.highWater; i++) {
      const def = SPECIES[u.species[i]];
      if (u.alive[i] === 0 || u.village[i] !== villageId || (!minors && u.age[i] < def.adultTicks)) continue;
      if (clan >= 0 && u.clan[i] - 1 !== clan) continue;
      if (oldest < 0 || u.age[i] > u.age[oldest]) oldest = i;
      if (u.age[i] <= def.lifespanTicks * HEIR_MAX_AGE_FRACTION && (best < 0 || u.age[i] > u.age[best])) best = i;
    }
    return best >= 0 ? best : oldest;
  };
  let heir = -1;
  if (K.clan >= 0) {
    // Primero un adulto del linaje; si sólo quedan menores, reina un niño antes que otra casa.
    for (const minors of [false, true]) {
      if (heir < 0) heir = pick(K.capital, K.clan, minors);
      for (const v of ks.villagesOf(K.id)) {
        if (heir >= 0) break;
        heir = pick(v.id, K.clan, minors);
      }
    }
  }
  if (heir < 0) heir = pick(K.capital, -1);
  if (heir < 0) {
    for (const v of ks.villagesOf(K.id)) {
      heir = pick(v.id, -1);
      if (heir >= 0) {
        K.capital = v.id;
        break;
      }
    }
  }
  if (heir < 0) return;
  const first = !K.hadKing;
  K.hadKing = true;
  K.king = u.handleOf(heir);
  K.personality = (u.nameSeed[heir] >>> 3) % 4;
  const name = personName(u.species[heir], u.nameSeed[heir]);
  const clan = ks.civ.clans[u.clan[heir] - 1];
  if (clan) clan.crowns++;
  // También cuenta si el heredero aún no tiene clan (un recién llegado): la casa anterior se acabó.
  const newHouse = K.clan >= 0 && clan?.id !== K.clan;
  if (newHouse) {
    K.dynastyTick = ks.civ.tick;
    ks.civ.addEvent('dynasty', K.capital, `Cambio de dinastía en ${K.name}: sube al trono ${clan ? `el ${clan.name} con ${name}` : name}`);
  } else if (!first) {
    ks.civ.addEvent('king', K.capital, `${name}${clan ? ` (${clan.name})` : ''} es el nuevo rey de ${K.name}`);
  }
  K.clan = clan ? clan.id : -1;
}

function handleRebellions(ks: KingdomSystem, K: Kingdom, villages: Village[], ctx: AiContext): boolean {
  if (villages.length < 2 || ks.civ.tick - K.lastRebellion < REBELLION_COOLDOWN) return false;
  for (const v of villages) {
    const occupied = v.capturedTick >= 0 && ks.civ.tick - v.capturedTick < OCCUPATION_TICKS;
    if (v.id !== K.capital && !occupied && v.loyalty < REBEL_LOYALTY && ctx.rng.chance(REBEL_CHANCE)) {
      K.lastRebellion = ks.civ.tick;
      ks.rebel(v);
      return true;
    }
  }
  return false;
}

function considerPeace(ks: KingdomSystem, K: Kingdom, ctx: AiContext): void {
  for (const w of ks.activeWarsOf(K.id)) {
    // Sólo negocian los reinos que encabezan cada bando.
    if (w.attackers[0] !== K.id && w.defenders[0] !== K.id) continue;
    const duration = ks.civ.tick - w.start;
    if (duration < MIN_WAR_TICKS) continue;
    const ownSide = w.attackers[0] === K.id ? 0 : 1;
    const adults = ks.villagesOf(K.id).reduce((n, v) => n + v.adults, 0);
    let chance = 0.15 + w.losses[ownSide] / (10 + adults);
    if (K.personality === Personality.PEACEFUL) chance += 0.15;
    if (K.personality === Personality.AGGRESSIVE) chance -= 0.05;
    if (kingdomFaith(ks.civ, K)?.tenet === Tenet.PEACEFUL) chance += 0.1;
    chance -= ctx.climate.war / 100;
    if (duration > MAX_WAR_TICKS || ctx.rng.chance(chance)) ks.makePeace(w);
  }
}

function considerWar(ks: KingdomSystem, K: Kingdom, touching: Set<number>, ctx: AiContext): void {
  const wars = ks.activeWarsOf(K.id).length;
  if (wars > 0 && (K.personality !== Personality.AGGRESSIVE || wars >= 2)) return;
  if (ks.civ.tick - K.founded < MIN_KINGDOM_AGE) return;
  const mine = ks.villagesOf(K.id);
  const adults = mine.reduce((n, v) => n + v.adults, 0);
  const warriors = mine.reduce((n, v) => n + v.jobCounts[Job.WARRIOR], 0);
  if (adults < MIN_WAR_ADULTS || warriors < MIN_WAR_WARRIORS) return;
  const capital = ks.civ.villages[K.capital];
  const myPower = kingdomPower(ks, K.id);
  let target = -1;
  // En una era de hierro basta con caerse algo mal; en la de concordia hace falta odio.
  let worst = WAR_OPINION + ctx.climate.war;
  for (const B of ks.kingdoms) {
    if (!B.alive || B.id === K.id || ks.areHostile(K.id, B.id) || ks.areAllied(K.id, B.id)) continue;
    if ((K.truce[B.id] ?? 0) > ks.civ.tick) continue;
    const bc = ks.civ.villages[B.capital];
    if (!capital || !bc || dist(capital, bc) > REACH) continue;
    if (myPower < kingdomPower(ks, B.id) * POWER_RATIO[K.personality]) continue;
    const o = opinion(ks, K.id, B.id, touching);
    if (o < worst) {
      worst = o;
      target = B.id;
    }
  }
  if (target >= 0) ks.declareWar(K.id, target);
}

function considerAlliances(ks: KingdomSystem, K: Kingdom, touching: Set<number>): void {
  for (const other of [...K.allies]) {
    if (opinion(ks, K.id, other, touching) < BREAK_ALLY_OPINION) ks.breakAlliance(K.id, other);
  }
  if (K.allies.length >= MAX_ALLIES) return;
  for (const B of ks.kingdoms) {
    if (!B.alive || B.id <= K.id || B.allies.length >= MAX_ALLIES || ks.areAllied(K.id, B.id)) continue;
    if (opinion(ks, K.id, B.id, touching) >= ALLY_OPINION && opinion(ks, B.id, K.id, touching) >= ALLY_OPINION) {
      if (ks.formAlliance(K.id, B.id) && K.allies.length >= MAX_ALLIES) return;
    }
  }
}

/** Cada aldea en guerra envía su ejército a la aldea enemiga más cercana de su misma isla. */
function assignArmies(ks: KingdomSystem, K: Kingdom, villages: Village[], ctx: AiContext): void {
  const atWar = ks.isAtWar(K.id);
  for (const v of villages) {
    if (!atWar) {
      v.armyTarget = -1;
      continue;
    }
    const region = ctx.world.regionAt(v.cx, v.cy);
    let best = -1;
    let bestD = ARMY_REACH;
    const overseas: Village[] = [];
    for (const e of ks.civ.villages) {
      if (!e.alive || !ks.areHostile(K.id, e.kingdom)) continue;
      const d = dist(v, e);
      if (ctx.world.regionAt(e.cx, e.cy) !== region) {
        if (d < ARMY_REACH) overseas.push(e);
        continue;
      }
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    // Sin enemigos en su isla: la aldea enemiga más cercana a la que se pueda llegar por mar.
    if (best < 0 && overseas.length > 0) {
      overseas.sort((a, b) => dist(v, a) - dist(v, b) || a.id - b.id);
      for (const e of overseas.slice(0, NAVAL_CANDIDATES)) {
        if (navalReach(ks.civ, ctx.world, v, e)) {
          best = e.id;
          break;
        }
      }
    }
    v.armyTarget = best;
  }
}
