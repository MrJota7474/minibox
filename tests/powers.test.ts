import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, DeathCause, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { UnitStore } from '../src/entities/units';
import { PowerSystem, type PowerId } from '../src/powers/disasters';
import { HazardSystem } from '../src/powers/hazards';
import { PLAGUE_DURATION, Status, damageMultiplier, damageTakenMultiplier } from '../src/powers/status';
import { StrokeController } from '../src/powers/stroke';
import { toolById } from '../src/powers/tools';
import type { Command } from '../src/sim/commands';
import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { Simulation } from '../src/sim/simulation';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 64;

interface Rig {
  ctx: AiContext;
  hazards: HazardSystem;
  powers: PowerSystem;
  rng: Rng;
}

function rig(forest = false): Rig {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
    w.setGrass(i, 150);
    if (forest) w.flora[i] = Flora.TREE;
  }
  w.computeRegions();
  const units = new UnitStore(200);
  const hazards = new HazardSystem(w);
  const ctx: AiContext = {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, 200),
    rng: new Rng(1),
    tick: 0,
    unitLimit: 200,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards,
  };
  return { ctx, hazards, powers: new PowerSystem(w, units, hazards), rng: new Rng(9) };
}

function sheep(r: Rig, x: number, y: number): number {
  const def = SPECIES[Species.SHEEP];
  return r.ctx.units.spawn(Species.SHEEP, x, y, { sex: 0, ageTicks: def.adultTicks, generation: 0, thinkOffset: 0 });
}

function apply(r: Rig, power: PowerId, x: number, y: number, size = 3): void {
  r.ctx.spatial.rebuild(r.ctx.units);
  r.powers.apply(power, x, y, size, r.ctx, r.rng, r.ctx.civ);
}

function run(r: Rig, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    r.ctx.tick++;
    r.ctx.spatial.rebuild(r.ctx.units);
    r.hazards.step(r.ctx, r.rng, r.ctx.laws.fireSpread, r.ctx.civ);
    r.powers.step(r.ctx, r.rng, r.ctx.civ);
    updateUnits(r.ctx);
  }
}

describe('desastres', () => {
  it('el rayo mata a las criaturas del punto y prende fuego', () => {
    const r = rig(true);
    const s = sheep(r, 20.5, 20.5);
    apply(r, 'lightning', 20, 20, 1);
    expect(r.ctx.units.isAlive(s)).toBe(false);
    expect(r.ctx.stats.deaths[DeathCause.DISASTER]).toBe(1);
    expect(r.hazards.burningCount).toBeGreaterThan(0);
    expect(r.powers.fx.some((f) => f.kind === 'lightning')).toBe(true);
  });

  it('el meteorito abre un cráter, mata y destruye edificios', () => {
    const r = rig();
    const before = r.ctx.world.heightMap[r.ctx.world.idx(32, 32)];
    const s = sheep(r, 32.5, 32.5);
    const members = [0, 1, 2].map((k) => sheep(r, 40 + k, 40));
    r.ctx.spatial.rebuild(r.ctx.units);
    const v = r.ctx.civ.foundVillage(Species.HUMAN, 32, 32, members, r.ctx);
    apply(r, 'meteor', 32, 32, 5);
    expect(r.ctx.world.heightMap[r.ctx.world.idx(32, 32)]).toBeLessThan(before);
    expect(r.ctx.units.isAlive(s)).toBe(false);
    expect(v?.alive).toBe(false);
  });

  it('el fuego se propaga por el bosque y se apaga dejando tierra quemada', () => {
    const r = rig(true);
    apply(r, 'fire', 32, 32, 1);
    run(r, 60);
    expect(r.hazards.burningCount).toBeGreaterThan(3);
    run(r, 4000);
    expect(r.hazards.burningCount).toBe(0);
    let burnt = 0;
    for (let i = 0; i < r.ctx.world.size; i++) if (r.ctx.world.flora[i] === Flora.NONE) burnt++;
    expect(burnt).toBeGreaterThan(10);
  });

  it('con la ley de propagación desactivada el fuego no se extiende', () => {
    const r = rig(true);
    r.ctx.laws.fireSpread = false;
    apply(r, 'fire', 32, 32, 1);
    run(r, 30);
    expect(r.hazards.burningCount).toBeLessThanOrEqual(1);
  });

  it('la lava fluye, impide el paso y se enfría en roca', () => {
    const r = rig();
    apply(r, 'lava', 32, 32, 3);
    const i = r.ctx.world.idx(32, 32);
    expect(r.ctx.world.lava[i]).toBeGreaterThan(0);
    expect(r.ctx.world.isWalkableAt(32.5, 32.5)).toBe(false);
    run(r, 3000);
    expect(r.hazards.lavaCount).toBe(0);
    expect(r.ctx.world.terrain[i]).toBe(Terrain.HILLS);
  });

  it('terremoto, tornado, lluvia ácida y volcán duran un tiempo y terminan', () => {
    const r = rig(true);
    for (const p of ['earthquake', 'tornado', 'acid-rain', 'volcano'] as PowerId[]) apply(r, p, 32, 32, 5);
    expect(r.powers.effects).toHaveLength(4);
    run(r, 600);
    expect(r.powers.effects).toHaveLength(0);
    expect(r.ctx.world.terrain[r.ctx.world.idx(32, 32)]).not.toBe(Terrain.SOIL_LOW);
  });
});

describe('poderes sobre criaturas', () => {
  it('la plaga contagia, mata o deja inmunes a los supervivientes', () => {
    const r = rig();
    const herd = [0, 1, 2, 3].map((k) => sheep(r, 30.5 + k * 0.5, 30.5));
    apply(r, 'plague', 30, 30, 1);
    expect(r.ctx.units.plague[herd[0]]).toBe(PLAGUE_DURATION);
    run(r, 200);
    expect(herd.filter((i) => r.ctx.units.plague[i] > 0 || !r.ctx.units.isAlive(i)).length).toBeGreaterThan(1);
    const infected = new Set<number>();
    for (let t = 0; t < PLAGUE_DURATION + 250; t++) {
      for (const i of herd) if (r.ctx.units.plague[i] > 0) infected.add(i);
      run(r, 1);
    }
    for (const i of infected) {
      if (r.ctx.units.isAlive(i)) expect(r.ctx.units.status[i] & Status.IMMUNE).toBeTruthy();
    }
  });

  it('bendición y maldición cambian el daño hecho y recibido; la luz divina cura', () => {
    const r = rig();
    const a = sheep(r, 10.5, 10.5);
    apply(r, 'bless', 10, 10, 1);
    expect(damageMultiplier(r.ctx.units, a)).toBeGreaterThan(1);
    expect(damageTakenMultiplier(r.ctx.units, a)).toBeLessThan(1);
    apply(r, 'curse', 10, 10, 1);
    expect(damageMultiplier(r.ctx.units, a)).toBeLessThan(1);
    r.ctx.units.hp[a] = 1;
    apply(r, 'heal', 10, 10, 1);
    expect(r.ctx.units.hp[a]).toBe(SPECIES[Species.SHEEP].maxHp);
    expect(r.ctx.units.status[a] & Status.CURSED).toBe(0);
  });

  it('una criatura enloquecida ataca a sus vecinas', () => {
    const r = rig();
    const mad = r.ctx.units.spawn(Species.WOLF, 20.5, 20.5, { sex: 0, ageTicks: 2000, generation: 0, thinkOffset: 0 });
    const victim = sheep(r, 22.5, 20.5);
    r.ctx.units.hunger[mad] = 1500;
    apply(r, 'madness', 20, 20, 1);
    run(r, 400);
    expect(r.ctx.units.isAlive(victim)).toBe(false);
  });

  it('el imán coge criaturas y las suelta en otro sitio', () => {
    const r = rig();
    const s = sheep(r, 10.5, 10.5);
    r.ctx.spatial.rebuild(r.ctx.units);
    expect(r.powers.grab(10, 10, 3, r.ctx)).toBe(1);
    expect(r.ctx.units.status[s] & Status.HELD).toBeTruthy();
    run(r, 10);
    r.powers.drop(40, 40);
    expect(Math.floor(r.ctx.units.x[s])).toBeGreaterThan(36);
    expect(r.ctx.units.status[s] & Status.HELD).toBe(0);
  });

  it('el trazo del imán emite coger al empezar y soltar al terminar', () => {
    const out: Command[] = [];
    const ctl = new StrokeController((c) => out.push(c));
    ctl.tool = toolById('magnet') ?? null;
    ctl.start(5, 5, 0);
    ctl.move(20, 9, 10);
    ctl.end();
    expect(out.map((c) => c.type)).toEqual(['grab', 'drop']);
    expect(out[1]).toMatchObject({ x: 20, y: 9 });
  });
});

describe('regresiones de la revisión', () => {
  it('pintar agua sobre lava la apaga y el lago no vuelve a ser roca', () => {
    const r = rig();
    apply(r, 'lava', 20, 20, 1);
    const i = r.ctx.world.idx(20, 20);
    r.ctx.world.setHeight(i, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    expect(r.ctx.world.lava[i]).toBe(0);
    run(r, 400);
    expect(r.ctx.world.terrain[i]).toBe(Terrain.OCEAN);
  });

  it('una criatura sujeta por el imán no puede ser atacada ni encontrada', () => {
    const r = rig();
    const s = sheep(r, 10.5, 10.5);
    r.ctx.spatial.rebuild(r.ctx.units);
    r.powers.grab(10, 10, 1, r.ctx);
    r.ctx.spatial.rebuild(r.ctx.units);
    expect(r.ctx.spatial.nearest(r.ctx.units, 10.5, 10.5, 5, () => true)).toBe(-1);
    apply(r, 'lightning', 10, 10, 3);
    expect(r.ctx.units.isAlive(s)).toBe(true);
  });
});

describe('leyes y determinismo', () => {
  it('sin hambre ni vejez las criaturas no se debilitan', () => {
    const r = rig();
    r.ctx.laws.hunger = false;
    r.ctx.laws.aging = false;
    const s = sheep(r, 30.5, 30.5);
    r.ctx.units.age[s] = SPECIES[Species.SHEEP].lifespanTicks + 10;
    const hunger = r.ctx.units.hunger[s];
    run(r, 3000);
    expect(r.ctx.units.isAlive(s)).toBe(true);
    expect(r.ctx.units.hunger[s]).toBeGreaterThanOrEqual(hunger - 5);
  });

  it('la simulación con desastres es determinista', () => {
    const make = (): Simulation => {
      const sim = new Simulation({ seedText: 'desastres', size: 96, capacity: 300, populate: true });
      sim.apply({ type: 'power', power: 'meteor', x: 48, y: 48, size: 5 });
      sim.apply({ type: 'power', power: 'tornado', x: 30, y: 30, size: 5 });
      sim.apply({ type: 'law', law: 'fireSpread', value: true });
      for (let t = 0; t < 400; t++) sim.step();
      sim.apply({ type: 'power', power: 'fire', x: 40, y: 60, size: 9 });
      for (let t = 0; t < 400; t++) sim.step();
      return sim;
    };
    expect(make().stateHash()).toBe(make().stateHash());
  });
});
