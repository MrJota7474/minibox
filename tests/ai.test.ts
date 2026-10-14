import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, DeathCause, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { Move, escapeBlockedTile, moveToward, pickWanderTarget } from '../src/ai/movement';
import { Rng } from '../src/core/rng';
import { SPECIES, Species, type SpeciesId } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { Sex, UnitState, UnitStore } from '../src/entities/units';
import { HazardSystem } from '../src/powers/hazards';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 48;

function makeWorld(biome: number = Biome.GRASS, grass = 200): World {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, biome as 0);
    w.setGrass(i, grass);
  }
  return w;
}

function makeCtx(world: World, capacity = 100, limit = capacity): AiContext {
  world.computeRegions();
  const units = new UnitStore(capacity);
  return {
    world,
    units,
    pathfinder: new Pathfinder(world),
    civ: new CivSystem(world, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards: new HazardSystem(world),
    spatial: new SpatialHash(world.width, world.height, capacity),
    rng: new Rng(1),
    tick: 0,
    unitLimit: limit,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
  };
}

function spawn(ctx: AiContext, species: SpeciesId, x: number, y: number, sex: number = Sex.FEMALE, adult = true): number {
  const def = SPECIES[species];
  return ctx.units.spawn(species, x, y, { sex, ageTicks: adult ? def.adultTicks : 0, generation: 0, thinkOffset: 0 });
}

function run(ctx: AiContext, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick = t;
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

describe('herbívoros', () => {
  it('comen hierba cuando tienen hambre', () => {
    const ctx = makeCtx(makeWorld());
    const s = spawn(ctx, Species.SHEEP, 20.5, 20.5);
    ctx.units.hunger[s] = 100;
    run(ctx, 60);
    expect(ctx.units.hunger[s]).toBeGreaterThan(100);
    expect(ctx.world.grass[ctx.world.idx(20, 20)]).toBeLessThan(200);
  });

  it('mueren de hambre sin comida', () => {
    const ctx = makeCtx(makeWorld(Biome.DESERT, 0));
    const s = spawn(ctx, Species.RABBIT, 20.5, 20.5);
    ctx.units.hunger[s] = 0;
    run(ctx, 1200);
    expect(ctx.units.isAlive(s)).toBe(false);
    expect(ctx.stats.deaths[DeathCause.HUNGER]).toBe(1);
  });

  it('huyen de los lobos', () => {
    const ctx = makeCtx(makeWorld());
    const s = spawn(ctx, Species.SHEEP, 20.5, 20.5);
    const wolf = spawn(ctx, Species.WOLF, 24.5, 20.5);
    ctx.units.hunger[wolf] = SPECIES[Species.WOLF].maxHunger;
    run(ctx, 2);
    expect(ctx.units.state[s]).toBe(UnitState.FLEE);
    run(ctx, 10);
    expect(ctx.units.x[s]).toBeLessThan(20.5);
  });

  it('se reproducen si son adultos, están saciados y hay pareja', () => {
    const ctx = makeCtx(makeWorld());
    const a = spawn(ctx, Species.SHEEP, 20.5, 20.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 22.5, 20.5, Sex.MALE);
    ctx.units.hunger[a] = ctx.units.hunger[b] = SPECIES[Species.SHEEP].maxHunger;
    run(ctx, 200);
    expect(ctx.stats.births).toBeGreaterThan(0);
    expect(ctx.units.count).toBeGreaterThan(2);
  });

  it('no nacen crías si se alcanzó el límite', () => {
    const ctx = makeCtx(makeWorld(), 10, 2);
    const a = spawn(ctx, Species.SHEEP, 20.5, 20.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 21.5, 20.5, Sex.MALE);
    ctx.units.hunger[a] = ctx.units.hunger[b] = SPECIES[Species.SHEEP].maxHunger;
    run(ctx, 300);
    expect(ctx.stats.births).toBe(0);
  });

  it('los depredadores no ocupan las plazas de cría de los herbívoros', () => {
    // Límite 100: 2 ovejas + 90 lobeznos lejos. Si el cupo de las ovejas contara a todos, ya no podrían criar.
    const ctx = makeCtx(makeWorld(), 120, 100);
    const a = spawn(ctx, Species.SHEEP, 8.5, 8.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 9.5, 8.5, Sex.MALE);
    for (let k = 0; k < 90; k++) spawn(ctx, Species.WOLF, 30.5 + (k % 15), 34.5 + Math.floor(k / 15), Sex.FEMALE, false);
    ctx.units.hunger[a] = ctx.units.hunger[b] = SPECIES[Species.SHEEP].maxHunger;
    run(ctx, 200);
    expect(ctx.units.speciesCount[Species.SHEEP]).toBeGreaterThan(2);
  });

  it('las crías no se reproducen', () => {
    const ctx = makeCtx(makeWorld());
    spawn(ctx, Species.SHEEP, 20.5, 20.5, Sex.FEMALE, false);
    spawn(ctx, Species.SHEEP, 21.5, 20.5, Sex.MALE, false);
    run(ctx, 100);
    expect(ctx.stats.births).toBe(0);
  });
});

describe('depredadores', () => {
  it('los lobos hambrientos cazan presas', () => {
    const ctx = makeCtx(makeWorld());
    const wolf = spawn(ctx, Species.WOLF, 20.5, 20.5);
    spawn(ctx, Species.SHEEP, 22.5, 20.5);
    // Más ovejas lejos: de una especie casi extinguida nadie caza (refugio).
    for (let k = 0; k < 10; k++) spawn(ctx, Species.SHEEP, 38.5 + (k % 5), 44.5 + Math.floor(k / 5));
    ctx.units.hunger[wolf] = 100;
    run(ctx, 600);
    expect(ctx.stats.deaths[DeathCause.KILLED]).toBeGreaterThanOrEqual(1);
    expect(ctx.units.kills[wolf]).toBeGreaterThanOrEqual(1);
    expect(ctx.units.hunger[wolf]).toBeGreaterThan(100);
  });

  it('los lobos sólo crían si hay suficientes presas por lobo', () => {
    const breedWolves = (prey: number): number => {
      // Con un límite realista: con uno pequeño, el cupo de cada depredador no daría ni para criar.
      const ctx = makeCtx(makeWorld(), 400);
      const a = spawn(ctx, Species.WOLF, 20.5, 20.5, Sex.FEMALE);
      const b = spawn(ctx, Species.WOLF, 21.5, 20.5, Sex.MALE);
      ctx.units.hunger[a] = ctx.units.hunger[b] = SPECIES[Species.WOLF].maxHunger;
      // Corderos lejos, fuera de la vista de los lobos.
      for (let k = 0; k < prey; k++) spawn(ctx, Species.SHEEP, 2.5 + (k % 8), 40.5 + Math.floor(k / 8), Sex.FEMALE, false);
      run(ctx, 300);
      return ctx.units.speciesCount[Species.WOLF];
    };
    expect(breedWolves(5)).toBe(2);
    expect(breedWolves(40)).toBeGreaterThan(2);
  });
});

describe('persecuciones imposibles', () => {
  function splitByWater(ctx: AiContext): void {
    for (let y = 0; y < SIZE; y++) for (let x = 22; x <= 24; x++) ctx.world.setHeight(ctx.world.idx(x, y), 0);
  }

  it('un lobo abandona una presa al otro lado del agua', () => {
    const ctx = makeCtx(makeWorld());
    splitByWater(ctx);
    const wolf = spawn(ctx, Species.WOLF, 20.5, 20.5);
    const sheep = spawn(ctx, Species.SHEEP, 26.5, 20.5);
    ctx.units.hunger[wolf] = 100;
    ctx.units.hunger[sheep] = SPECIES[Species.SHEEP].maxHunger;
    run(ctx, 400);
    expect(ctx.units.isAlive(sheep)).toBe(true);
    expect(ctx.units.state[wolf]).not.toBe(UnitState.HUNT);
  });

  it('una pareja separada por el agua deja de buscarse', () => {
    const ctx = makeCtx(makeWorld());
    splitByWater(ctx);
    const a = spawn(ctx, Species.SHEEP, 20.5, 20.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 26.5, 20.5, Sex.MALE);
    ctx.units.hunger[a] = ctx.units.hunger[b] = SPECIES[Species.SHEEP].maxHunger;
    let stuck = 0;
    for (let t = 0; t < 600; t++) {
      run(ctx, 1);
      stuck = ctx.units.state[a] === UnitState.MATE ? stuck + 1 : 0;
      expect(stuck).toBeLessThan(320);
    }
  });

  it('el objetivo es una referencia con generación: un hueco reutilizado no se confunde', () => {
    const ctx = makeCtx(makeWorld());
    const wolf = spawn(ctx, Species.WOLF, 20.5, 20.5);
    const sheep = spawn(ctx, Species.SHEEP, 30.5, 20.5);
    // Más ovejas lejos: de una especie casi extinguida nadie caza (refugio).
    for (let k = 0; k < 10; k++) spawn(ctx, Species.SHEEP, 38.5 + (k % 5), 44.5 + Math.floor(k / 5));
    ctx.units.hunger[wolf] = 100;
    run(ctx, 6);
    expect(ctx.units.resolve(ctx.units.target[wolf])).toBe(sheep);
    ctx.units.kill(sheep);
    const cub = spawn(ctx, Species.WOLF, 30.5, 20.5, Sex.MALE, false);
    expect(cub).toBe(sheep);
    expect(ctx.units.resolve(ctx.units.target[wolf])).toBe(-1);
  });
});

describe('ciclo de vida', () => {
  it('las criaturas mueren de viejas', () => {
    const ctx = makeCtx(makeWorld());
    const s = spawn(ctx, Species.RABBIT, 20.5, 20.5);
    ctx.units.age[s] = SPECIES[Species.RABBIT].lifespanTicks + 1;
    ctx.units.hunger[s] = SPECIES[Species.RABBIT].maxHunger;
    run(ctx, 8000);
    expect(ctx.stats.deaths[DeathCause.AGE]).toBeGreaterThanOrEqual(1);
  });

  it('se ahogan si quedan en el agua lejos de la orilla', () => {
    const w = new World(SIZE, SIZE);
    const ctx = makeCtx(w);
    const s = spawn(ctx, Species.SHEEP, 20.5, 20.5);
    run(ctx, 200);
    expect(ctx.units.isAlive(s)).toBe(false);
    expect(ctx.stats.deaths[DeathCause.DROWNED]).toBe(1);
  });
});

describe('movimiento', () => {
  it('moveToward avanza, llega y se bloquea ante el agua', () => {
    const w = makeWorld();
    const u = new UnitStore(4);
    const i = u.spawn(Species.SHEEP, 5.5, 5.5, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 });
    expect(moveToward(w, u, i, 10.5, 5.5, 1)).toBe(Move.MOVING);
    expect(moveToward(w, u, i, 6.6, 5.5, 1)).toBe(Move.ARRIVED);
    for (let y = 0; y < SIZE; y++) w.setHeight(w.idx(8, y), 0);
    u.x[i] = 7.5;
    expect(moveToward(w, u, i, 9.5, 5.5, 0.5)).toBe(Move.BLOCKED);
  });

  it('pickWanderTarget elige destinos pisables', () => {
    const w = makeWorld();
    const u = new UnitStore(4);
    const i = u.spawn(Species.SHEEP, 20.5, 20.5, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 });
    expect(pickWanderTarget(w, u, i, new Rng(3), 5)).toBe(true);
    expect(w.isWalkableAt(u.tx[i], u.ty[i])).toBe(true);
  });

  it('escapeBlockedTile saca a la criatura a la orilla cercana', () => {
    const w = makeWorld();
    w.setHeight(w.idx(10, 10), 0);
    const u = new UnitStore(4);
    const i = u.spawn(Species.SHEEP, 10.5, 10.5, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 });
    expect(escapeBlockedTile(w, u, i)).toBe(true);
    expect(w.isWalkableAt(u.x[i], u.y[i])).toBe(true);
  });
});
