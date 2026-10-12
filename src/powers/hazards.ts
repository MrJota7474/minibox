import { DeathCause, killUnit, type AiContext } from '../ai/context';
import type { Rng } from '../core/rng';
import { Flora, SEA_LEVEL, TERRAIN_INFO, Terrain, isPlant, isWaterTerrain } from '../world/terrain';
import type { World } from '../world/world';
import { damageTakenMultiplier } from './status';

/** Ticks entre pasos del fuego y de la lava. */
const FIRE_STEP = 3;
const LAVA_STEP = 6;
const FIRE_START = 12;
const FIRE_SPREAD_CHANCE = 0.22;
const FIRE_DAMAGE = 4;
const LAVA_START = 60;
const LAVA_FLOW_MIN = 15;
const LAVA_FLOW_CHANCE = 0.35;
const LAVA_DAMAGE = 12;
/** La lava quema los edificios mucho más rápido que el fuego. */
const LAVA_BURN = 4;
const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Daño de fuego o lava sobre un edificio (lo implementa la civilización). */
export interface BuildingHazards {
  burnBuildingAt(tile: number, amount?: number): void;
}

/**
 * Fuego y lava sobre el mapa. Viven en `world.fire` y `world.lava` (intensidad por casilla)
 * con listas de casillas activas para no recorrer todo el mapa.
 */
export class HazardSystem {
  private burning: number[] = [];
  private molten: number[] = [];

  constructor(private readonly world: World) {}

  get burningCount(): number {
    return this.burning.length;
  }

  get lavaCount(): number {
    return this.molten.length;
  }

  /** Casillas en llamas (para el render). */
  burningTiles(): readonly number[] {
    return this.burning;
  }

  isFlammable(i: number): boolean {
    const w = this.world;
    if (w.lava[i] > 0 || w.isWaterIdx(i)) return false;
    return isPlant(w.flora[i]) || w.grass[i] > 40 || w.buildingAt[i] !== 0;
  }

  ignite(i: number, intensity = FIRE_START): void {
    const w = this.world;
    if (w.fire[i] > 0 || w.isWaterIdx(i) || w.lava[i] > 0) return;
    w.fire[i] = intensity;
    w.markDirtyIdx(i);
    this.burning.push(i);
  }

  pourLava(i: number, heat = LAVA_START): void {
    const w = this.world;
    if (w.isWaterIdx(i)) {
      // La lava que cae al agua se solidifica en el acto.
      w.setHeight(i, SEA_LEVEL + 3);
      return;
    }
    if (w.lava[i] === 0) this.molten.push(i);
    w.lava[i] = Math.max(w.lava[i], heat);
    w.fire[i] = 0;
    w.setFlora(i, Flora.NONE);
    w.setGrass(i, 0);
    w.markDirtyIdx(i);
  }

  step(ctx: AiContext, rng: Rng, spread: boolean, buildings: BuildingHazards): void {
    if (ctx.tick % FIRE_STEP === 0 && this.burning.length > 0) this.stepFire(ctx, rng, spread, buildings);
    if (ctx.tick % LAVA_STEP === 0 && this.molten.length > 0) this.stepLava(ctx, rng, buildings);
  }

  private stepFire(ctx: AiContext, rng: Rng, spread: boolean, buildings: BuildingHazards): void {
    const w = this.world;
    const next: number[] = [];
    const current = this.burning;
    this.burning = next;
    for (const i of current) {
      if (w.fire[i] === 0) continue;
      w.fire[i]--;
      damageUnitsOn(ctx, i, FIRE_DAMAGE, DeathCause.DISASTER);
      if (w.buildingAt[i] !== 0) buildings.burnBuildingAt(i);
      if (spread) {
        const x = i % w.width;
        const y = (i - x) / w.width;
        for (const [dx, dy] of NEIGHBORS) {
          if (!w.inBounds(x + dx, y + dy)) continue;
          const j = w.idx(x + dx, y + dy);
          if (w.fire[j] === 0 && this.isFlammable(j) && rng.chance(FIRE_SPREAD_CHANCE)) this.ignite(j);
        }
      }
      if (w.fire[i] > 0) next.push(i);
      else {
        // Lo que ardió queda reducido a tierra quemada.
        if (isPlant(w.flora[i])) w.setFlora(i, Flora.NONE);
        w.setGrass(i, 0);
        w.markDirtyIdx(i);
      }
    }
  }

  private stepLava(ctx: AiContext, rng: Rng, buildings: BuildingHazards): void {
    const w = this.world;
    const current = this.molten;
    this.molten = [];
    for (const i of current) {
      if (w.lava[i] === 0) continue;
      damageUnitsOn(ctx, i, LAVA_DAMAGE, DeathCause.DISASTER);
      if (w.buildingAt[i] !== 0) buildings.burnBuildingAt(i, LAVA_BURN);
      const x = i % w.width;
      const y = (i - x) / w.width;
      for (const [dx, dy] of NEIGHBORS) {
        if (!w.inBounds(x + dx, y + dy)) continue;
        const j = w.idx(x + dx, y + dy);
        if (this.isFlammable(j)) this.ignite(j);
        const downhill = w.heightMap[j] <= w.heightMap[i] + 2;
        if (w.lava[j] === 0 && w.lava[i] > LAVA_FLOW_MIN && downhill && rng.chance(LAVA_FLOW_CHANCE)) this.pourLava(j, w.lava[i] - 12);
      }
      w.lava[i] = Math.max(0, w.lava[i] - 3);
      if (w.lava[i] > 0) this.molten.push(i);
      else this.solidify(i);
    }
  }

  /** La lava fría deja roca volcánica (colinas). */
  private solidify(i: number): void {
    const w = this.world;
    const rock = TERRAIN_INFO[Terrain.HILLS].paintHeight;
    if (w.heightMap[i] < rock && !isWaterTerrain(w.terrain[i])) w.setHeight(i, rock);
    w.markDirtyIdx(i);
  }

  /** Reconstruye las listas activas a partir del mapa (al cargar una partida, en la Fase E). */
  rebuildLists(): void {
    this.burning = [];
    this.molten = [];
    for (let i = 0; i < this.world.size; i++) {
      if (this.world.fire[i] > 0) this.burning.push(i);
      if (this.world.lava[i] > 0) this.molten.push(i);
    }
  }
}

/** Daña a las criaturas que están sobre la casilla. */
export function damageUnitsOn(ctx: AiContext, tile: number, damage: number, cause: (typeof DeathCause)[keyof typeof DeathCause]): void {
  const w = ctx.world;
  const u = ctx.units;
  const cx = (tile % w.width) + 0.5;
  const cy = Math.floor(tile / w.width) + 0.5;
  ctx.spatial.forEachInRadius(u, cx, cy, 0.8, (j) => {
    if (u.alive[j] === 0) return;
    u.hp[j] -= Math.max(1, Math.round(damage * damageTakenMultiplier(u, j)));
    if (u.hp[j] <= 0) killUnit(ctx, j, cause);
  });
}
