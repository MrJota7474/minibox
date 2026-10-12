import type { AiContext } from '../ai/context';
import { TICKS_PER_YEAR } from '../core/time';
import { SPECIES } from '../entities/species';
import { totalStored, Job, type Village } from './model';
import { Personality, type Kingdom, type KingdomSystem } from './kingdoms';
import { personName } from './names';

const WAR_OPINION = -25;
const ALLY_OPINION = 45;
const BREAK_ALLY_OPINION = 5;
const MAX_ALLIES = 2;
const REACH = 110;
const ARMY_REACH = 100;
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
    if (ctx.laws.wars) considerWar(ks, K, touching);
    considerAlliances(ks, K, touching);
    assignArmies(ks, K, villages, ctx);
  }
}

/** Si el rey murió, hereda el adulto de más edad de la capital (o de la aldea más poblada). */
function ensureKing(ks: KingdomSystem, K: Kingdom, ctx: AiContext): void {
  const u = ctx.units;
  const current = u.resolve(K.king);
  if (current >= 0 && ks.kingdomOfUnit(current) === K.id) return;
  const pick = (villageId: number): number => {
    let best = -1;
    let oldest = -1;
    for (let i = 0; i < u.highWater; i++) {
      const def = SPECIES[u.species[i]];
      if (u.alive[i] === 0 || u.village[i] !== villageId || u.age[i] < def.adultTicks) continue;
      if (oldest < 0 || u.age[i] > u.age[oldest]) oldest = i;
      if (u.age[i] <= def.lifespanTicks * HEIR_MAX_AGE_FRACTION && (best < 0 || u.age[i] > u.age[best])) best = i;
    }
    return best >= 0 ? best : oldest;
  };
  let heir = pick(K.capital);
  if (heir < 0) {
    for (const v of ks.villagesOf(K.id)) {
      heir = pick(v.id);
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
  if (!first) ks.civ.addEvent('king', K.capital, `${personName(u.species[heir], u.nameSeed[heir])} es el nuevo rey de ${K.name}`);
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
    if (duration > MAX_WAR_TICKS || ctx.rng.chance(chance)) ks.makePeace(w);
  }
}

function considerWar(ks: KingdomSystem, K: Kingdom, touching: Set<number>): void {
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
  let worst = WAR_OPINION;
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
    for (const e of ks.civ.villages) {
      if (!e.alive || !ks.areHostile(K.id, e.kingdom) || ctx.world.regionAt(e.cx, e.cy) !== region) continue;
      const d = dist(v, e);
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    v.armyTarget = best;
  }
}
