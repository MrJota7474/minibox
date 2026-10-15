import { DeathCause, giveUp, killUnit, type AiContext } from '../ai/context';
import { hashMix } from '../core/hash';
import type { Rng } from '../core/rng';
import { SPECIES } from '../entities/species';
import { NO_UNIT, type UnitStore } from '../entities/units';
import { makeOasis } from '../world/oasis';
import { Flora, TERRAIN_INFO, Terrain, isPlant } from '../world/terrain';
import type { World } from '../world/world';
import type { BuildingHazards, HazardSystem } from './hazards';
import { Status, bless, curse, heal, infect, madden, smite } from './status';
import { fertileRain, fertility, stepBlizzard, stepLocusts, stepSandstorm, tsunami } from './nature-powers';

export type PowerId =
  | 'lightning'
  | 'meteor'
  | 'bomb'
  | 'earthquake'
  | 'tornado'
  | 'acid-rain'
  | 'fire'
  | 'lava'
  | 'volcano'
  | 'plague'
  | 'bless'
  | 'curse'
  | 'madness'
  | 'heal'
  | 'tsunami'
  | 'blizzard'
  | 'sandstorm'
  | 'locusts'
  | 'rain'
  | 'oasis'
  | 'offering'
  | 'fertility'
  | 'peace';

/** Avisos visuales para el render (no forman parte del estado de la simulación). */
export type FxKind = 'lightning' | 'explosion' | 'meteor' | 'wave' | 'rain' | 'offering' | 'fertility' | 'peace' | 'smoke' | 'sparkle' | 'curse' | 'plague' | 'heal' | 'madness';
export interface FxEvent {
  readonly kind: FxKind;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Desastres que duran varios ticks. */
export type EffectKind = 'earthquake' | 'tornado' | 'acid-rain' | 'volcano' | 'blizzard' | 'locusts' | 'sandstorm';
export interface Effect {
  readonly kind: EffectKind;
  x: number;
  y: number;
  readonly r: number;
  ttl: number;
  dx: number;
  dy: number;
}

/** Lo que los desastres necesitan de la civilización para dañar edificios. */
export interface BuildingDamage extends BuildingHazards {
  destroyBuildingsIn(x: number, y: number, r: number): void;
  /** Hace crecer (amount > 0) o arruina (amount < 0) las cosechas del radio. */
  tendFarmsIn(x: number, y: number, r: number, amount: number): void;
  /** Reparte una ofrenda a las aldeas del radio; devuelve cuántas la recibieron. */
  giftVillagesIn(x: number, y: number, r: number): number;
  /** Paz divina: los reinos con aldeas en el radio firman la paz con sus enemigos; devuelve las guerras terminadas. */
  peaceIn(x: number, y: number, r: number): number;
  damageBuildingsIn(x: number, y: number, r: number, chance: number, rng: Rng): void;
  /** Hunde los barcos del radio (con `chance` < 1, sólo a algunos). */
  wreckBoatsIn(x: number, y: number, r: number, chance: number, rng: Rng): void;
}

const MAX_EFFECTS = 24;
const MAX_FX = 200;
const MAX_HELD = 30;
const LIGHTNING_DAMAGE = 60;
const BLAST_DAMAGE = 200;
/** La onda expansiva hiere (sin matar a casi nadie sano) en toda la zona chamuscada. */
const SCORCH_DAMAGE = 25;
/** Radio de la zona chamuscada respecto al cráter. */
const METEOR_SCORCH = 2.5;
const BOMB_SCORCH = 1.4;
/** Probabilidad de que caiga una planta: del 90 % junto al cráter al 30 % en el borde. */
const SCORCH_NEAR = 0.9;
const SCORCH_FAR = 0.3;
/** En el último 15 % de la zona chamuscada prenden llamas pequeñas. */
const SCORCH_EDGE = 0.85;
const EDGE_FIRE_CHANCE = 0.35;
const EDGE_FIRE_STRENGTH = 2;
/** Radios de los poderes de la naturaleza (base + por tamaño de pincel). */
const TSUNAMI_BASE = 5;
const TSUNAMI_PER_BRUSH = 0.7;
const OASIS_BASE = 3;
const OASIS_PER_BRUSH = 0.6;
const RAIN_BASE = 3;
const RAIN_PER_BRUSH = 0.6;
const FERTILITY_BASE = 2;
const FERTILITY_PER_BRUSH = 0.5;
const PEACE_BASE = 3;
const PEACE_PER_BRUSH = 0.6;
const OFFERING_BASE = 2;
const OFFERING_PER_BRUSH = 0.5;
const EFFECT_TTL: Readonly<Record<EffectKind, number>> = { earthquake: 150, tornado: 300, 'acid-rain': 240, volcano: 500, blizzard: 300, locusts: 400, sandstorm: 300 };

/**
 * Poderes de dios y desastres. Todo se aplica mediante comandos de la simulación
 * (deterministas); `fx` sólo alimenta los efectos visuales.
 */
export class PowerSystem {
  readonly effects: Effect[] = [];
  readonly fx: FxEvent[] = [];
  /** Criaturas sujetas con el imán (handles). */
  readonly held: number[] = [];

  constructor(
    private readonly world: World,
    private readonly units: UnitStore,
    private readonly hazards: HazardSystem,
  ) {}

  private emit(kind: FxKind, x: number, y: number, r: number): void {
    this.fx.push({ kind, x, y, r });
    if (this.fx.length > MAX_FX) this.fx.shift();
  }

  apply(power: PowerId, x: number, y: number, size: number, ctx: AiContext, rng: Rng, civ: BuildingDamage): void {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const brush = Math.max(1, size);
    switch (power) {
      case 'lightning': {
        const r = 1 + brush * 0.25;
        damageInRadius(ctx, cx, cy, r, LIGHTNING_DAMAGE);
        civ.wreckBoatsIn(cx, cy, r, 0.5, rng);
        this.forTiles(x, y, r, (i) => {
          if (rng.chance(0.6)) this.hazards.ignite(i);
        });
        this.emit('lightning', cx, cy, r);
        break;
      }
      case 'meteor':
      case 'bomb': {
        const meteor = power === 'meteor';
        const r = meteor ? 3 + brush * 0.5 : 2 + brush * 0.4;
        this.blast(cx, cy, r, meteor ? 40 : 10, meteor ? METEOR_SCORCH : BOMB_SCORCH, ctx, rng, civ);
        this.emit(meteor ? 'meteor' : 'explosion', cx, cy, r);
        break;
      }
      case 'earthquake':
      case 'tornado':
      case 'acid-rain':
      case 'volcano':
      case 'blizzard':
      case 'locusts':
      case 'sandstorm':
        this.startEffect(power, cx, cy, brush, rng);
        break;
      case 'tsunami': {
        const r = TSUNAMI_BASE + brush * TSUNAMI_PER_BRUSH;
        // Tierra adentro no hay ola: sólo se ve (y suena) si de verdad barre una costa.
        if (tsunami(this.world, cx, cy, r, ctx, rng, civ)) this.emit('wave', cx, cy, r);
        break;
      }
      case 'oasis': {
        const r = OASIS_BASE + brush * OASIS_PER_BRUSH;
        // Sólo se celebra si de verdad brota agua (sobre el agua o entre edificios no hay oasis).
        if (makeOasis(this.world, cx, cy, r, rng) > 0) this.emit('rain', cx, cy, r);
        break;
      }
      case 'rain': {
        const r = RAIN_BASE + brush * RAIN_PER_BRUSH;
        fertileRain(this.world, this.hazards, cx, cy, r, rng, civ);
        this.emit('rain', cx, cy, r);
        break;
      }
      case 'fertility': {
        const r = FERTILITY_BASE + brush * FERTILITY_PER_BRUSH;
        fertility(ctx, cx, cy, r);
        this.emit('fertility', cx, cy, r);
        break;
      }
      case 'peace': {
        const r = PEACE_BASE + brush * PEACE_PER_BRUSH;
        // Si no había guerra que terminar, sólo un soplo de humo: nada de fanfarria de paz.
        this.emit(civ.peaceIn(cx, cy, r) > 0 ? 'peace' : 'smoke', cx, cy, r);
        break;
      }
      case 'offering': {
        const r = OFFERING_BASE + brush * OFFERING_PER_BRUSH;
        civ.giftVillagesIn(cx, cy, r);
        this.emit('offering', cx, cy, r);
        break;
      }
      case 'fire':
        this.forTiles(x, y, brush / 2, (i) => this.hazards.ignite(i));
        break;
      case 'lava':
        this.forTiles(x, y, brush / 2, (i) => this.hazards.pourLava(i));
        break;
      default:
        this.applyToUnits(power, cx, cy, Math.max(1, brush / 2), ctx);
    }
  }

  /** Bendición, maldición, locura, luz divina y plaga sobre las criaturas del pincel. */
  private applyToUnits(power: PowerId, cx: number, cy: number, r: number, ctx: AiContext): void {
    const u = this.units;
    ctx.spatial.forEachInRadius(u, cx, cy, r, (i) => {
      if (power === 'bless') bless(u, i);
      else if (power === 'curse') curse(u, i);
      else if (power === 'madness') madden(u, i);
      else if (power === 'heal') {
        const def = SPECIES[u.species[i]];
        if (def.monster?.undead) smite(ctx, i, def);
        else heal(u, i, def);
      }
      else if (power === 'plague') infect(u, i);
    });
    const fx: Readonly<Record<string, FxKind>> = { bless: 'sparkle', curse: 'curse', madness: 'madness', heal: 'heal', plague: 'plague' };
    this.emit(fx[power] ?? 'sparkle', cx, cy, r);
  }

  /**
   * Explosión con cráter: mata y destruye edificios en el radio `r`, y alrededor deja una
   * zona chamuscada redonda (hasta `r × scorch`) donde las plantas caen más cuanto más
   * cerca del cráter. Sólo el borde de esa zona prende fuego, y con poca fuerza.
   */
  private blast(cx: number, cy: number, r: number, depth: number, scorch: number, ctx: AiContext, rng: Rng, civ: BuildingDamage): void {
    const w = this.world;
    const outer = r * scorch;
    damageInRadius(ctx, cx, cy, r, BLAST_DAMAGE);
    damageInRadius(ctx, cx, cy, outer, SCORCH_DAMAGE);
    civ.destroyBuildingsIn(cx, cy, r);
    this.forTiles(Math.floor(cx), Math.floor(cy), outer, (i) => {
      const x = (i % w.width) + 0.5;
      const y = Math.floor(i / w.width) + 0.5;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d <= r) {
        w.setHeight(i, w.heightMap[i] - Math.round(depth * (1 - d / (r + 0.5))));
        if (isPlant(w.flora[i])) w.setFlora(i, Flora.NONE);
        w.setGrass(i, 0);
        return;
      }
      // 0 junto al cráter y 1 en el borde de la zona chamuscada.
      const t = Math.min(1, (d - r) / Math.max(0.5, outer - r));
      if (isPlant(w.flora[i]) && rng.chance(SCORCH_NEAR + (SCORCH_FAR - SCORCH_NEAR) * t)) w.setFlora(i, Flora.NONE);
      w.setGrass(i, Math.round(w.grass[i] * t));
      if (t >= SCORCH_EDGE && rng.chance(EDGE_FIRE_CHANCE)) this.hazards.ignite(i, EDGE_FIRE_STRENGTH);
    });
  }

  private startEffect(kind: EffectKind, cx: number, cy: number, brush: number, rng: Rng): void {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift();
    const angle = rng.int(8);
    const dirs: readonly (readonly [number, number])[] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
    const r =
      kind === 'earthquake' ? 10 + brush : kind === 'acid-rain' ? 4 + brush * 0.5 : kind === 'tornado' ? 2.2 : kind === 'blizzard' || kind === 'sandstorm' ? 5 + brush * 0.6 : kind === 'locusts' ? 3 + brush * 0.2 : 3 + brush * 0.3;
    this.effects.push({ kind, x: cx, y: cy, r, ttl: EFFECT_TTL[kind], dx: dirs[angle][0], dy: dirs[angle][1] });
    if (kind === 'volcano') this.raiseCone(cx, cy, r);
    this.emit(kind === 'volcano' ? 'smoke' : 'explosion', cx, cy, kind === 'earthquake' ? 0 : 1);
  }

  /** El volcán levanta una montaña en forma de cono. */
  private raiseCone(cx: number, cy: number, r: number): void {
    const w = this.world;
    const base = TERRAIN_INFO[Terrain.MOUNTAIN].paintHeight;
    this.forTiles(Math.floor(cx), Math.floor(cy), r, (i) => {
      const x = (i % w.width) + 0.5;
      const y = Math.floor(i / w.width) + 0.5;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      w.setHeight(i, Math.max(w.heightMap[i], Math.round(base - d * 6)));
      if (isPlant(w.flora[i])) w.setFlora(i, Flora.NONE);
    });
  }

  step(ctx: AiContext, rng: Rng, civ: BuildingDamage): void {
    for (const e of this.effects) {
      e.ttl--;
      if (e.kind === 'earthquake') this.stepQuake(e, ctx, rng, civ);
      else if (e.kind === 'tornado') this.stepTornado(e, ctx, rng, civ);
      else if (e.kind === 'acid-rain') this.stepAcid(e, ctx, rng);
      else if (e.kind === 'blizzard') stepBlizzard(e, ctx, rng, civ, () => this.randomTile(e, rng));
      else if (e.kind === 'locusts') stepLocusts(e, ctx, rng, civ, () => this.randomTile(e, rng));
      else if (e.kind === 'sandstorm') stepSandstorm(e, ctx, rng, civ, () => this.randomTile(e, rng));
      else this.stepVolcano(e, ctx, rng);
    }
    for (let k = this.effects.length - 1; k >= 0; k--) if (this.effects[k].ttl <= 0) this.effects.splice(k, 1);
  }

  private randomTile(e: Effect, rng: Rng): number {
    const x = Math.floor(e.x + rng.range(-Math.floor(e.r), Math.floor(e.r)));
    const y = Math.floor(e.y + rng.range(-Math.floor(e.r), Math.floor(e.r)));
    return this.world.inBounds(x, y) ? this.world.idx(x, y) : -1;
  }

  private stepQuake(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage): void {
    if (ctx.tick % 3 === 0) {
      for (let k = 0; k < 6; k++) {
        const i = this.randomTile(e, rng);
        if (i >= 0) this.world.setHeight(i, this.world.heightMap[i] + rng.range(-8, 8));
      }
    }
    if (ctx.tick % 20 === 0) damageInRadius(ctx, e.x, e.y, e.r, 2);
    civ.damageBuildingsIn(e.x, e.y, e.r, 0.004, rng);
    if (ctx.tick % 10 === 0) this.emit('explosion', e.x, e.y, 0);
  }

  private stepTornado(e: Effect, ctx: AiContext, rng: Rng, civ: BuildingDamage): void {
    const w = this.world;
    if (ctx.tick % 30 === 0) {
      e.dx += (rng.float() - 0.5) * 0.8;
      e.dy += (rng.float() - 0.5) * 0.8;
      const len = Math.sqrt(e.dx * e.dx + e.dy * e.dy) || 1;
      e.dx /= len;
      e.dy /= len;
    }
    e.x += e.dx * 0.25;
    e.y += e.dy * 0.25;
    if (!w.inBounds(Math.floor(e.x), Math.floor(e.y))) {
      e.ttl = 0;
      return;
    }
    const i = this.randomTile(e, rng);
    if (i >= 0 && isPlant(w.flora[i]) && rng.chance(0.4)) w.setFlora(i, Flora.NONE);
    civ.damageBuildingsIn(e.x, e.y, e.r, 0.02, rng);
    if (ctx.tick % 5 !== 0) return;
    // Lanza por los aires a las criaturas que atrapa.
    const u = this.units;
    ctx.spatial.forEachInRadius(u, e.x, e.y, e.r, (j) => {
      if (u.alive[j] === 0 || (u.status[j] & Status.HELD) !== 0) return;
      const nx = Math.min(w.width - 0.5, Math.max(0.5, u.x[j] + rng.range(-5, 5)));
      const ny = Math.min(w.height - 0.5, Math.max(0.5, u.y[j] + rng.range(-5, 5)));
      u.x[j] = nx;
      u.y[j] = ny;
      u.pathLen[j] = 0;
      u.hp[j] -= 3;
      if (u.hp[j] <= 0) killUnit(ctx, j, DeathCause.DISASTER);
    });
  }

  private stepAcid(e: Effect, ctx: AiContext, rng: Rng): void {
    if (ctx.tick % 10 !== 0) return;
    damageInRadius(ctx, e.x, e.y, e.r, 2);
    const w = this.world;
    for (let k = 0; k < 8; k++) {
      const i = this.randomTile(e, rng);
      if (i < 0) continue;
      w.setGrass(i, w.grass[i] - 25);
      if (isPlant(w.flora[i]) && rng.chance(0.08)) w.setFlora(i, Flora.NONE);
    }
  }

  private stepVolcano(e: Effect, ctx: AiContext, rng: Rng): void {
    if (ctx.tick % 8 === 0) {
      const w = this.world;
      const x = Math.floor(e.x) + rng.range(-1, 1);
      const y = Math.floor(e.y) + rng.range(-1, 1);
      if (w.inBounds(x, y)) this.hazards.pourLava(w.idx(x, y));
    }
    if (ctx.tick % 15 === 0) this.emit('smoke', e.x, e.y, 1);
  }

  // ---------- Imán divino ----------

  grab(x: number, y: number, size: number, ctx: AiContext): number {
    const u = this.units;
    ctx.spatial.forEachInRadius(u, x + 0.5, y + 0.5, Math.max(1, size / 2 + 0.5), (i) => {
      if (this.held.length >= MAX_HELD || (u.status[i] & Status.HELD) !== 0) return;
      u.status[i] |= Status.HELD;
      giveUp(u, i);
      ctx.civ.releaseWork(i);
      this.held.push(u.handleOf(i));
    });
    return this.held.length;
  }

  drop(x: number, y: number): void {
    const u = this.units;
    const w = this.world;
    this.held.forEach((h, k) => {
      const i = u.resolve(h);
      if (i === NO_UNIT) return;
      // Se dejan caer en una pequeña espiral alrededor del punto.
      const ring = Math.floor(Math.sqrt(k));
      const ox = ((k * 7) % 5) - 2;
      const oy = ((k * 3) % 5) - 2;
      u.x[i] = Math.min(w.width - 0.5, Math.max(0.5, x + 0.5 + ox * 0.4 * (ring + 1)));
      u.y[i] = Math.min(w.height - 0.5, Math.max(0.5, y + 0.5 + oy * 0.4 * (ring + 1)));
      u.px[i] = u.x[i];
      u.py[i] = u.y[i];
      u.status[i] &= ~Status.HELD;
    });
    this.held.length = 0;
  }

  private forTiles(x: number, y: number, r: number, visit: (i: number) => void): void {
    const w = this.world;
    const ir = Math.ceil(r);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5 || !w.inBounds(x + dx, y + dy)) continue;
        visit(w.idx(x + dx, y + dy));
      }
    }
  }

  stateHash(): number {
    let h = 0x7ab1e;
    for (const e of this.effects) {
      h = hashMix(h, e.ttl);
      h = hashMix(h, Math.round(e.x * 100));
      h = hashMix(h, Math.round(e.y * 100));
    }
    return hashMix(h, this.held.length);
  }
}

/** Daño a todas las criaturas del radio (muerte por desastre). */
export function damageInRadius(ctx: AiContext, x: number, y: number, r: number, damage: number): void {
  const u = ctx.units;
  ctx.spatial.forEachInRadius(u, x, y, r, (j) => {
    if (u.alive[j] === 0 || (u.status[j] & Status.HELD) !== 0) return;
    u.hp[j] -= damage;
    if (u.hp[j] <= 0) killUnit(ctx, j, DeathCause.DISASTER);
  });
}
