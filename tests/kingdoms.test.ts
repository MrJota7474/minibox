import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, killUnit, DeathCause, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { actFight } from '../src/civ/combat';
import { loyaltyOf, runKingdomAi } from '../src/civ/diplomacy';
import { Job } from '../src/civ/model';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { UnitState, UnitStore } from '../src/entities/units';
import { HazardSystem } from '../src/powers/hazards';
import { Simulation } from '../src/sim/simulation';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 128;

function makeCtx(): AiContext {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
  }
  w.computeRegions();
  const units = new UnitStore(400);
  return {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, 400),
    rng: new Rng(3),
    tick: 0,
    unitLimit: 400,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards: new HazardSystem(w),
  };
}

function adults(ctx: AiContext, n: number, x: number, y: number, species: number = Species.HUMAN): number[] {
  const def = SPECIES[species];
  return Array.from({ length: n }, (_, k) =>
    ctx.units.spawn(species as 3, x + (k % 3), y + Math.floor(k / 3), { sex: k % 2, ageTicks: def.adultTicks + 100, generation: 0, thinkOffset: k, nameSeed: k * 31 }),
  );
}

function found(ctx: AiContext, x: number, y: number, species: number = Species.HUMAN, kingdom = -1) {
  const members = adults(ctx, 4, x, y, species);
  ctx.spatial.rebuild(ctx.units);
  const v = ctx.civ.foundVillage(species as 3, x, y, members, ctx, kingdom);
  if (!v) throw new Error('no se pudo fundar');
  return { v, members };
}

function run(ctx: AiContext, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick++;
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

describe('reinos', () => {
  it('cada aldea fundada crea un reino del que es capital; las colonias pertenecen a su reino de origen', () => {
    const ctx = makeCtx();
    const { v: a } = found(ctx, 20, 20);
    const ks = ctx.civ.kingdoms;
    expect(ks.kingdoms).toHaveLength(1);
    expect(a.kingdom).toBe(0);
    expect(ks.kingdoms[0].capital).toBe(a.id);
    const { v: colony } = found(ctx, 80, 80, Species.HUMAN, 0);
    expect(colony.kingdom).toBe(0);
    expect(ks.kingdoms).toHaveLength(1);
    expect(ks.villagesOf(0)).toHaveLength(2);
  });

  it('declarar la guerra crea hostilidad mutua y los aliados del atacado se suman', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    found(ctx, 80, 20, Species.TUSKER);
    found(ctx, 20, 80, Species.PETRINO);
    const ks = ctx.civ.kingdoms;
    expect(ks.formAlliance(1, 2)).toBe(true);
    const war = ks.declareWar(0, 1);
    expect(war?.defenders).toEqual([1, 2]);
    expect(ks.areHostile(0, 1) && ks.areHostile(1, 0) && ks.areHostile(0, 2)).toBe(true);
    expect(ks.isAtWar(0)).toBe(true);
    expect(ks.declareWar(0, 1)).toBeNull();
    ks.peaceBetween(0, 1);
    expect(ks.areHostile(0, 1)).toBe(false);
    expect(ks.kingdoms[0].truce[1]).toBeGreaterThan(ctx.civ.tick);
    expect(ctx.civ.chronicle.some((e) => e.type === 'peace')).toBe(true);
  });

  it('los poderes de dios fuerzan guerra, paz, alianza y rebelión', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    found(ctx, 80, 80, Species.TUSKER);
    const { v: colony } = found(ctx, 20, 80, Species.HUMAN, 0);
    const ks = ctx.civ.kingdoms;
    ks.applyGodAction('war', 0, 1);
    expect(ks.areHostile(0, 1)).toBe(true);
    ks.applyGodAction('alliance', 0, 1);
    expect(ks.areHostile(0, 1)).toBe(false);
    expect(ks.areAllied(0, 1)).toBe(true);
    ks.applyGodAction('rebellion', colony.id, -1);
    expect(colony.kingdom).toBe(2);
    expect(ks.areHostile(2, 0)).toBe(true);
    // La capital no puede rebelarse contra sí misma.
    expect(ks.rebel(ctx.civ.villages[0])).toBe(false);
  });

  it('los guerreros conquistan una aldea indefensa; si era su única aldea, el reino cae', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    const { v: target } = found(ctx, 60, 20, Species.TUSKER);
    const ks = ctx.civ.kingdoms;
    ks.declareWar(0, 1);
    const raiders = adults(ctx, 4, target.cx - 2, target.cy - 2);
    for (const i of raiders) {
      ctx.civ.joinVillage(i, ctx.civ.villages[0]);
      ctx.units.job[i] = Job.WARRIOR;
      ctx.units.cooldown[i] = 60000;
    }
    for (let t = 0; t < 400 && target.kingdom === 1; t++) {
      ctx.tick++;
      ctx.spatial.rebuild(ctx.units);
      ks.update(ctx);
    }
    expect(target.kingdom).toBe(0);
    expect(ks.kingdoms[1].alive).toBe(false);
    expect(ks.isAtWar(0)).toBe(false);
    expect(ctx.civ.chronicle.some((e) => e.type === 'conquest')).toBe(true);
  });

  it('en combate, el guerrero armado mata al enemigo y se cuenta la baja', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    found(ctx, 60, 20, Species.TUSKER);
    const ks = ctx.civ.kingdoms;
    const war = ks.declareWar(0, 1);
    const [a] = adults(ctx, 1, 40, 40);
    const [b] = adults(ctx, 1, 40.5, 40, Species.TUSKER);
    ctx.civ.joinVillage(a, ctx.civ.villages[0]);
    ctx.civ.joinVillage(b, ctx.civ.villages[1]);
    ctx.units.gear[a] = 1;
    ctx.units.state[a] = UnitState.FIGHT;
    ctx.units.target[a] = ctx.units.handleOf(b);
    for (let t = 0; t < 400 && ctx.units.isAlive(b); t++) {
      ctx.units.attackCd[a] = 0;
      actFight(ctx, a, SPECIES[Species.HUMAN]);
    }
    expect(ctx.units.isAlive(b)).toBe(false);
    expect(war?.losses[1]).toBe(1);
    expect(ctx.units.kills[a]).toBe(1);
  });

  it('cuando muere el rey hereda otro adulto del reino', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    const ks = ctx.civ.kingdoms;
    runKingdomAi(ks, ctx);
    const king = ctx.units.resolve(ks.kingdoms[0].king);
    expect(king).toBeGreaterThanOrEqual(0);
    killUnit(ctx, king, DeathCause.AGE);
    runKingdomAi(ks, ctx);
    const heir = ctx.units.resolve(ks.kingdoms[0].king);
    expect(heir).toBeGreaterThanOrEqual(0);
    expect(heir).not.toBe(king);
    expect(ks.kingName(ks.kingdoms[0]).length).toBeGreaterThan(2);
  });

  it('la lealtad es máxima en la capital y menor en aldeas lejanas de otra raza', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 10, 10);
    const { v: far } = found(ctx, 110, 110, Species.TUSKER, 0);
    const { v: near } = found(ctx, 40, 10, Species.HUMAN, 0);
    const ks = ctx.civ.kingdoms;
    expect(loyaltyOf(ks, capital)).toBe(100);
    expect(loyaltyOf(ks, near)).toBeLessThan(100);
    expect(loyaltyOf(ks, far)).toBeLessThan(loyaltyOf(ks, near));
  });

  it('la simulación con reinos en guerra es determinista', () => {
    const make = (): Simulation => {
      const sim = new Simulation({ seedText: 'reinos', size: 128, capacity: 400, populate: false });
      sim.apply({ type: 'spawn', species: Species.HUMAN, x: 50, y: 64, size: 9 });
      sim.apply({ type: 'spawn', species: Species.TUSKER, x: 80, y: 64, size: 9 });
      for (let t = 0; t < 100; t++) sim.step();
      sim.apply({ type: 'diplomacy', action: 'war', a: 0, b: 1 });
      for (let t = 0; t < 2000; t++) sim.step();
      return sim;
    };
    expect(make().stateHash()).toBe(make().stateHash());
  });

  it('los aldeanos de un reino en guerra pasan a guerreros', () => {
    const ctx = makeCtx();
    found(ctx, 20, 20);
    found(ctx, 70, 20, Species.TUSKER);
    adults(ctx, 6, 22, 22).forEach((i) => ctx.civ.joinVillage(i, ctx.civ.villages[0]));
    ctx.civ.villages[0].resources[3] = 20;
    ctx.civ.kingdoms.declareWar(0, 1);
    run(ctx, 61);
    expect(ctx.civ.villages[0].jobCounts[Job.WARRIOR]).toBeGreaterThan(0);
  });
});
