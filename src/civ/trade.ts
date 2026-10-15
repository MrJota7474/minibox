import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { clearPath } from '../ai/navigation';
import { SPECIES } from '../entities/species';
import { UnitState } from '../entities/units';
import { Job, Resource, type Village } from './model';

/**
 * Comercio entre aldeas: un mercader lleva a pie lo que a su aldea le sobra a otra aldea
 * alcanzable y no enemiga, y vuelve con lo que allí sobra. Cada entrega deja algo de oro
 * en las dos y, entre reinos distintos, lima los agravios.
 */

/** Distancia máxima (casillas) entre las dos aldeas: lo que aguanta el mercader sin pasar hambre. */
const TRADE_REACH = 45;
/** Unidades que carga un mercader por viaje. */
const TRADE_LOAD = 8;
/** Lo que una aldea se guarda siempre de cada recurso. */
const TRADE_RESERVE = 20;
/** Diferencia mínima entre lo que tiene una y otra para que merezca el viaje. */
const TRADE_GAP = 10;
/** Comida por habitante que no se exporta. */
const FOOD_PER_HEAD = 3;
const TRADE_GOLD = 1;
/** Bandidos: a esta distancia (casillas) de las dos aldeas el camino ya es peligroso, salvo con escolta. */
const BANDIT_FAR = 14;
const ESCORT_RADIUS = 5;
/** Probabilidad de asalto cada vez que el mercader piensa en un tramo peligroso, y la herida que le dejan. */
const BANDIT_CHANCE = 0.004;
const BANDIT_WOUND = 8;
/** Ticks que el mercader asaltado tarda en volver a salir (antes, vuelve a casa). */
const BANDIT_SHOCK_TICKS = 300;
/** Feria: hace falta una aldea así de poblada y próspera (comida por habitante); probabilidad, oro extra y cuánto dura la alegría. */
const FAIR_POP = 8;
const FAIR_FOOD_PER_HEAD = 3;
const FAIR_CHANCE = 0.35;
const FAIR_BONUS = 3;
const FAIR_TICKS = 150;
/** Lo que se comercia (el oro es la ganancia, no la mercancía). */
const GOODS: readonly number[] = [Resource.FOOD, Resource.WOOD, Resource.STONE, Resource.IRON];

/** Lo que una aldea no exporta de un recurso (la comida, según sus bocas). */
function reserveOf(v: Village, good: number): number {
  return good === Resource.FOOD ? Math.max(TRADE_RESERVE, v.population * FOOD_PER_HEAD) : TRADE_RESERVE;
}

/** Diferencia entre lo que tiene una aldea y la otra del recurso que más le sobra a la primera. */
function bestGap(from: Village, to: Village): { good: number; gap: number } {
  let good = -1;
  let gap = TRADE_GAP;
  for (const r of GOODS) {
    if (from.resources[r] < reserveOf(from, r) + 1 || to.resources[r] >= to.storageCap) continue;
    const g = from.resources[r] - to.resources[r];
    if (g > gap) {
      gap = g;
      good = r;
    }
  }
  return { good, gap };
}

/** El recurso que más le sobra a `from` respecto a `to`, o -1 si no hay nada que llevar. */
export function pickGood(from: Village, to: Village): number {
  return bestGap(from, to).good;
}

/** La aldea no enemiga de la misma isla con la que más merece comerciar (a igualdad, la de menor id), o null. */
function bestPartner(ctx: AiContext, v: Village): Village | null {
  const w = ctx.world;
  const region = w.regionAt(v.cx, v.cy);
  let best: Village | null = null;
  let bestScore = 0;
  for (const o of ctx.civ.villages) {
    if (!o.alive || o.id === v.id || w.regionAt(o.cx, o.cy) !== region || ctx.civ.kingdoms.areHostile(v.kingdom, o.kingdom)) continue;
    if ((o.cx - v.cx) * (o.cx - v.cx) + (o.cy - v.cy) * (o.cy - v.cy) > TRADE_REACH * TRADE_REACH) continue;
    const { good, gap } = bestGap(v, o);
    if (good >= 0 && gap > bestScore) {
      bestScore = gap;
      best = o;
    }
  }
  return best;
}

/** Carga hasta TRADE_LOAD (más si la raza es comerciante) sin tocar la reserva de quien vende ni desbordar el almacén de quien compra. */
function load(ctx: AiContext, i: number, from: Village, to: Village, good: number): void {
  const u = ctx.units;
  const spare = Math.floor(from.resources[good] - reserveOf(from, good));
  const room = Math.floor(to.storageCap - to.resources[good]);
  const cap = Math.round(TRADE_LOAD * (SPECIES[u.species[i]].race?.trade ?? 1));
  const amount = Math.max(1, Math.min(cap, spare, room));
  from.resources[good] -= amount;
  u.carry[i] = good + 1;
  u.carryAmount[i] = amount;
}

/** El mercader carga el excedente de su aldea y sale hacia el almacén de la aldea vecina. */
export function startTrade(ctx: AiContext, i: number, v: Village): boolean {
  const u = ctx.units;
  const partner = bestPartner(ctx, v);
  if (!partner) return false;
  const store = ctx.civ.storageFor(partner, u.x[i], u.y[i]);
  const good = pickGood(v, partner);
  if (!store || good < 0) return false;
  ctx.civ.releaseWork(i);
  load(ctx, i, v, partner, good);
  u.work[i] = ctx.world.size + store.id;
  u.tx[i] = store.x + store.w / 2;
  u.ty[i] = store.y + store.h / 2;
  clearPath(ctx, i);
  u.state[i] = UnitState.TRADE;
  return true;
}

/** Al llegar: entrega la mercancía, las dos aldeas ganan oro y carga algo para la vuelta. */
export function finishTrade(ctx: AiContext, i: number): void {
  const u = ctx.units;
  const civ = ctx.civ;
  const b = u.work[i] >= ctx.world.size ? civ.building(u.work[i] - ctx.world.size) : null;
  const partner = b ? civ.villages[b.village] : null;
  const home = civ.villageOf(i);
  civ.releaseWork(i);
  // Si la aldea ya no existe o se ha vuelto enemiga, se vuelve a casa con lo que llevaba.
  if (partner && partner.alive && home && u.carry[i] !== 0 && !civ.kingdoms.areHostile(home.kingdom, partner.kingdom)) {
    const good = u.carry[i] - 1;
    partner.resources[good] = Math.min(Math.max(partner.storageCap, partner.resources[good]), partner.resources[good] + u.carryAmount[i]);
    u.carry[i] = 0;
    u.carryAmount[i] = 0;
    for (const v of [home, partner]) v.resources[Resource.GOLD] = Math.min(Math.max(v.storageCap, v.resources[Resource.GOLD]), v.resources[Resource.GOLD] + TRADE_GOLD);
    easeGrievances(ctx, home.kingdom, partner.kingdom);
    if (canHoldFair(partner) && ctx.rng.chance(FAIR_CHANCE)) holdFair(ctx, home, partner);
    const back = pickGood(partner, home);
    if (back >= 0) load(ctx, i, partner, home, back);
  }
  giveUp(u, i);
  u.think[i] = 1;
}

/** ¿Va el mercader por un tramo peligroso: lejos de su aldea y de la de destino, y sin un guerrero de su aldea cerca? */
export function onDangerousRoad(ctx: AiContext, i: number): boolean {
  const u = ctx.units;
  const home = ctx.civ.villageOf(i);
  if (!home) return false;
  const far = (cx: number, cy: number): boolean => {
    const dx = u.x[i] - cx - 0.5;
    const dy = u.y[i] - cy - 0.5;
    return dx * dx + dy * dy > BANDIT_FAR * BANDIT_FAR;
  };
  if (!far(home.cx, home.cy)) return false;
  const b = u.work[i] >= ctx.world.size ? ctx.civ.building(u.work[i] - ctx.world.size) : null;
  const partner = b ? ctx.civ.villages[b.village] : null;
  if (partner && !far(partner.cx, partner.cy)) return false;
  const escort = ctx.spatial.nearest(u, u.x[i], u.y[i], ESCORT_RADIUS, (j) => j !== i && u.job[j] === Job.WARRIOR && u.village[j] === u.village[i]);
  return escort < 0;
}

/** Asalto: el mercader pierde la carga, sale herido y vuelve a casa (tarda en volver a salir); la crónica lo cuenta. */
export function ambush(ctx: AiContext, i: number): void {
  const u = ctx.units;
  const home = ctx.civ.villageOf(i);
  u.carry[i] = 0;
  u.carryAmount[i] = 0;
  ctx.civ.releaseWork(i);
  giveUp(u, i);
  if (home) ctx.civ.addEvent('bandits', home.id, `Unos bandidos asaltan a un mercader de ${home.name}`);
  u.hp[i] -= BANDIT_WOUND;
  if (u.hp[i] <= 0) {
    killUnit(ctx, i, DeathCause.KILLED);
    return;
  }
  // El susto: no busca otro viaje en un rato (si no, saldría otra vez desde el sitio del asalto).
  u.workTimer[i] = BANDIT_SHOCK_TICKS;
  if (!home) return;
  u.tx[i] = home.cx + 0.5;
  u.ty[i] = home.cy + 0.5;
  clearPath(ctx, i);
  u.state[i] = UnitState.WANDER;
}

/**
 * Al pensar en camino: en un tramo peligroso puede haber bandidos. Sólo a la ida (el viaje en
 * estado TRADE), que es cuando el mercader lleva la mercancía al otro pueblo. Devuelve si hubo asalto.
 */
export function checkBandits(ctx: AiContext, i: number): boolean {
  if (!onDangerousRoad(ctx, i) || !ctx.rng.chance(BANDIT_CHANCE)) return false;
  ambush(ctx, i);
  return true;
}

/** ¿Puede la aldea montar una feria cuando llega un mercader? (el oro se gasta en obras: la prosperidad se mide en comida) */
export function canHoldFair(v: Village): boolean {
  return v.population >= FAIR_POP && v.resources[Resource.FOOD] >= v.population * FAIR_FOOD_PER_HEAD;
}

/** Feria: más oro para las dos aldeas, menos agravios entre sus reinos y la aldea anfitriona de fiesta un rato. */
export function holdFair(ctx: AiContext, home: Village, host: Village): void {
  for (const v of [home, host]) v.resources[Resource.GOLD] = Math.min(Math.max(v.storageCap, v.resources[Resource.GOLD]), v.resources[Resource.GOLD] + FAIR_BONUS);
  easeGrievances(ctx, home.kingdom, host.kingdom);
  ctx.civ.markFestive(host.id, ctx.civ.tick + FAIR_TICKS);
  ctx.civ.addEvent('fair', host.id, `Feria en ${host.name}: llegan mercaderes de ${home.name}`);
}

/** El trato entre reinos distintos va borrando los agravios de guerras pasadas. */
function easeGrievances(ctx: AiContext, a: number, b: number): void {
  if (a === b) return;
  const ks = ctx.civ.kingdoms.kingdoms;
  for (const [x, y] of [[a, b], [b, a]]) {
    const K = ks[x];
    if (K && (K.grievances[y] ?? 0) > 0) K.grievances[y]--;
  }
}
