import type { AiContext } from '../ai/context';
import { hashMix } from '../core/hash';
import { TICKS_PER_YEAR } from '../core/time';
import type { UnitStore } from '../entities/units';
import type { DiplomacyAction } from '../sim/commands';
import type { CivSystem } from './civ-system';
import { runKingdomAi } from './diplomacy';
import { Job, type Village } from './model';
import { personName } from './names';

export const Personality = { AGGRESSIVE: 0, PEACEFUL: 1, GREEDY: 2, WISE: 3 } as const;
export const PERSONALITY_NAMES: readonly string[] = ['Agresivo', 'Pacífico', 'Codicioso', 'Sabio'];

export interface Kingdom {
  readonly id: number;
  readonly name: string;
  readonly race: number;
  readonly colorIndex: number;
  readonly founded: number;
  capital: number;
  /** Rey (handle de criatura) o -1 si el trono está vacío. */
  king: number;
  personality: number;
  alive: boolean;
  /** Agravios contra otros reinos (por guerras pasadas). */
  grievances: Record<number, number>;
  /** Tregua con otro reino hasta el tick indicado. */
  truce: Record<number, number>;
  allies: number[];
  /** true cuando ya ha tenido algún rey (el primero no se anuncia). */
  hadKing: boolean;
  /** Tick de la última rebelión dentro del reino. */
  lastRebellion: number;
}

export interface War {
  readonly id: number;
  readonly start: number;
  attackers: number[];
  defenders: number[];
  /** Bajas de atacantes y defensores. */
  losses: [number, number];
  active: boolean;
}

const CAPTURE_INTERVAL = 10;
const AI_INTERVAL = 300;
const CAPTURE_RADIUS = 7;
const CAPTURE_PER_ATTACKER = 2;
const CAPTURE_DECAY = 4;
const CONQUERED_LOYALTY = 20;
const TRUCE_TICKS = 5 * TICKS_PER_YEAR;
const WAR_GRIEVANCE = 15;
const HOSTILE_KEY = 4096;

/**
 * Reinos y guerras: estado, relaciones y conquista. Las decisiones de cada rey
 * (declarar guerras, firmar paces, aliarse, rebeliones) están en diplomacy.ts.
 */
export class KingdomSystem {
  readonly kingdoms: Kingdom[] = [];
  readonly wars: War[] = [];
  private readonly hostile = new Set<number>();
  /** Reinos con alguna guerra activa (consulta O(1) desde la IA de cada aldeano). */
  private readonly atWar = new Set<number>();

  constructor(
    readonly civ: CivSystem,
    private readonly units: UnitStore,
  ) {}

  update(ctx: AiContext): void {
    if (ctx.tick % CAPTURE_INTERVAL === 3) this.updateCaptures(ctx);
    if (ctx.tick % AI_INTERVAL === 7) runKingdomAi(this, ctx);
  }

  create(capital: Village): Kingdom {
    const id = this.kingdoms.length;
    const k: Kingdom = {
      id,
      name: `Reino de ${capital.name}`,
      race: capital.race,
      colorIndex: id % 12,
      founded: this.civ.tick,
      capital: capital.id,
      king: -1,
      personality: Personality.WISE,
      alive: true,
      grievances: {},
      truce: {},
      allies: [],
      hadKing: false,
      lastRebellion: -1e9,
    };
    this.kingdoms.push(k);
    capital.kingdom = id;
    capital.loyalty = 100;
    return k;
  }

  kingdomOfUnit(i: number): number {
    const v = this.units.village[i];
    return v < 0 ? -1 : this.civ.villages[v].kingdom;
  }

  areHostile(a: number, b: number): boolean {
    return a >= 0 && b >= 0 && this.hostile.has(a * HOSTILE_KEY + b);
  }

  areAllied(a: number, b: number): boolean {
    return a >= 0 && b >= 0 && this.kingdoms[a].allies.includes(b);
  }

  isAtWar(k: number): boolean {
    return this.atWar.has(k);
  }

  villagesOf(k: number): Village[] {
    return this.civ.villages.filter((v) => v.alive && v.kingdom === k);
  }

  activeWarsOf(k: number): War[] {
    return this.wars.filter((w) => w.active && (w.attackers.includes(k) || w.defenders.includes(k)));
  }

  kingName(k: Kingdom): string {
    const i = this.units.resolve(k.king);
    return i < 0 ? 'Trono vacío' : personName(this.units.species[i], this.units.nameSeed[i]);
  }

  // ---------- Guerra y paz ----------

  declareWar(a: number, b: number): War | null {
    const A = this.kingdoms[a];
    const B = this.kingdoms[b];
    if (!A || !B || a === b || !A.alive || !B.alive || this.areHostile(a, b)) return null;
    this.breakAlliance(a, b);
    // Las alianzas son defensivas: los aliados del atacado entran en la guerra.
    const defenders = [b, ...B.allies.filter((x) => x !== a && this.kingdoms[x].alive && !A.allies.includes(x))];
    const war: War = { id: this.wars.length, start: this.civ.tick, attackers: [a], defenders, losses: [0, 0], active: true };
    this.wars.push(war);
    this.rebuildHostility();
    this.civ.addEvent('war', A.capital, `${A.name} declaró la guerra a ${B.name}`);
    return war;
  }

  makePeace(war: War): void {
    if (!war.active) return;
    war.active = false;
    const until = this.civ.tick + TRUCE_TICKS;
    for (const x of war.attackers) {
      for (const y of war.defenders) {
        this.kingdoms[x].truce[y] = until;
        this.kingdoms[y].truce[x] = until;
        this.kingdoms[x].grievances[y] = (this.kingdoms[x].grievances[y] ?? 0) + WAR_GRIEVANCE;
        this.kingdoms[y].grievances[x] = (this.kingdoms[y].grievances[x] ?? 0) + WAR_GRIEVANCE;
      }
    }
    this.rebuildHostility();
    const a = this.kingdoms[war.attackers[0]];
    const d = this.kingdoms[war.defenders[0]];
    if (a && d) this.civ.addEvent('peace', a.capital, `Paz entre ${a.name} y ${d.name}`);
  }

  peaceBetween(a: number, b: number): void {
    for (const w of this.wars) {
      if (!w.active) continue;
      const opposite = (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a));
      if (opposite) this.makePeace(w);
    }
  }

  formAlliance(a: number, b: number): boolean {
    const A = this.kingdoms[a];
    const B = this.kingdoms[b];
    if (!A || !B || a === b || !A.alive || !B.alive || this.areHostile(a, b) || A.allies.includes(b)) return false;
    A.allies.push(b);
    B.allies.push(a);
    this.civ.addEvent('alliance', A.capital, `${A.name} y ${B.name} firmaron una alianza`);
    return true;
  }

  breakAlliance(a: number, b: number): void {
    const A = this.kingdoms[a];
    const B = this.kingdoms[b];
    if (!A || !B || !A.allies.includes(b)) return;
    A.allies = A.allies.filter((x) => x !== b);
    B.allies = B.allies.filter((x) => x !== a);
  }

  /** Suma una baja al bando del reino caído en todas sus guerras activas. */
  recordLoss(k: number): void {
    for (const w of this.wars) {
      if (!w.active) continue;
      if (w.attackers.includes(k)) w.losses[0]++;
      else if (w.defenders.includes(k)) w.losses[1]++;
    }
  }

  private rebuildHostility(): void {
    this.hostile.clear();
    this.atWar.clear();
    for (const w of this.wars) {
      if (!w.active) continue;
      for (const k of [...w.attackers, ...w.defenders]) this.atWar.add(k);
      for (const x of w.attackers) {
        for (const y of w.defenders) {
          this.hostile.add(x * HOSTILE_KEY + y);
          this.hostile.add(y * HOSTILE_KEY + x);
        }
      }
    }
    for (const v of this.civ.villages) if (v.armyTarget >= 0 && !this.areHostile(v.kingdom, this.civ.villages[v.armyTarget].kingdom)) v.armyTarget = -1;
  }

  // ---------- Conquista ----------

  private updateCaptures(ctx: AiContext): void {
    for (const v of this.civ.villages) {
      if (!v.alive || !this.isAtWar(v.kingdom)) {
        v.captureProgress = 0;
        v.captureBy = -1;
        continue;
      }
      let attackers = 0;
      let defenders = 0;
      const byKingdom: Record<number, number> = {};
      const u = this.units;
      ctx.spatial.forEachInRadius(u, v.cx + 0.5, v.cy + 0.5, CAPTURE_RADIUS, (j) => {
        const kj = this.kingdomOfUnit(j);
        if (kj < 0) return;
        // Sólo los guerreros defienden o conquistan; los civiles cambian de reino con su aldea.
        if (kj === v.kingdom) {
          if (u.job[j] === Job.WARRIOR) defenders++;
        } else if (u.job[j] === Job.WARRIOR && this.areHostile(kj, v.kingdom)) {
          attackers++;
          byKingdom[kj] = (byKingdom[kj] ?? 0) + 1;
        }
      });
      // Encabeza el asedio el reino con más guerreros presentes (a igualdad, el de menor id).
      let by = -1;
      for (const key of Object.keys(byKingdom)) {
        const k = Number(key);
        if (by < 0 || byKingdom[k] > byKingdom[by]) by = k;
      }
      if (attackers > 0 && defenders === 0) {
        if (v.captureBy !== by) {
          v.captureBy = by;
          v.captureProgress = 0;
        }
        v.captureProgress += attackers * CAPTURE_PER_ATTACKER;
        if (v.captureProgress >= 100) this.conquer(v, by);
      } else {
        v.captureProgress = Math.max(0, v.captureProgress - CAPTURE_DECAY);
        if (v.captureProgress === 0) v.captureBy = -1;
      }
    }
  }

  conquer(v: Village, newKingdom: number): void {
    const old = v.kingdom;
    v.kingdom = newKingdom;
    v.capturedTick = this.civ.tick;
    v.captureProgress = 0;
    v.captureBy = -1;
    v.armyTarget = -1;
    v.loyalty = CONQUERED_LOYALTY;
    this.civ.addEvent('conquest', v.id, `${this.kingdoms[newKingdom].name} conquistó ${v.name}`);
    if (this.kingdoms[old].capital === v.id) this.relocateCapital(old);
  }

  /** La capital cayó o fue abandonada: pasa a la aldea más poblada o el reino cae. */
  relocateCapital(k: number): void {
    const K = this.kingdoms[k];
    const rest = this.villagesOf(k);
    if (rest.length === 0) {
      this.fall(k);
      return;
    }
    let best = rest[0];
    for (const v of rest) if (v.population > best.population) best = v;
    K.capital = best.id;
    best.loyalty = 100;
    // El rey conserva el trono si sigue en el reino (ensureKing lo comprueba).
  }

  fall(k: number): void {
    const K = this.kingdoms[k];
    if (!K.alive) return;
    K.alive = false;
    for (const other of K.allies) this.breakAlliance(k, other);
    for (const w of this.wars) {
      if (!w.active) continue;
      w.attackers = w.attackers.filter((x) => x !== k);
      w.defenders = w.defenders.filter((x) => x !== k);
      if (w.attackers.length === 0 || w.defenders.length === 0) w.active = false;
    }
    this.rebuildHostility();
    this.civ.addEvent('fallen', K.capital, `${K.name} ha caído`);
  }

  onVillageAbandoned(v: Village): void {
    if (v.kingdom >= 0 && this.kingdoms[v.kingdom].capital === v.id) this.relocateCapital(v.kingdom);
  }

  /** Una aldea se independiza y declara la guerra a su antiguo reino. */
  rebel(v: Village): boolean {
    if (!v.alive || v.kingdom < 0) return false;
    const old = this.kingdoms[v.kingdom];
    if (old.capital === v.id) return false;
    const k = this.create(v);
    this.civ.addEvent('rebellion', v.id, `${v.name} se rebeló contra ${old.name}`);
    this.declareWar(k.id, old.id);
    return true;
  }

  /** Poderes de dios: forzar guerra, paz, alianza o rebelión. */
  applyGodAction(action: DiplomacyAction, a: number, b: number): void {
    if (action === 'war') this.declareWar(a, b);
    else if (action === 'peace') this.peaceBetween(a, b);
    else if (action === 'alliance') {
      this.peaceBetween(a, b);
      this.formAlliance(a, b);
    } else {
      const v = this.civ.villages[a];
      if (v) this.rebel(v);
    }
  }

  stateHash(): number {
    let h = 0x51ed27;
    for (const k of this.kingdoms) {
      h = hashMix(h, k.alive ? 1 : 0);
      h = hashMix(h, k.capital);
      h = hashMix(h, k.king);
      h = hashMix(h, k.allies.length);
    }
    for (const w of this.wars) {
      h = hashMix(h, w.active ? 1 : 0);
      h = hashMix(h, w.losses[0]);
      h = hashMix(h, w.losses[1]);
    }
    return h;
  }
}
