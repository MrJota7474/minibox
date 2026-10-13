import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, type AiContext } from '../src/ai/context';
import { moveToward } from '../src/ai/movement';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { UnitStore } from '../src/entities/units';
import { applyBrush } from '../src/powers/brush';
import { HazardSystem } from '../src/powers/hazards';
import { toolById } from '../src/powers/tools';
import { defaultLaws } from '../src/sim/laws';
import { Simulation } from '../src/sim/simulation';
import { neutralClimate } from '../src/world/climate';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { VEGETATION_PASS_TICKS, VegetationSystem } from '../src/world/vegetation';
import { ROAD_PATH, ROAD_PAVED, ROAD_SPEED, ROAD_WORN, RoadLevel, World, roadLevel } from '../src/world/world';

const SIZE = 96;

function land(): World {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
  }
  w.computeRegions();
  return w;
}

function makeCtx(w: World): AiContext {
  const units = new UnitStore(200);
  const ctx: AiContext = {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, 200),
    rng: new Rng(3),
    tick: 0,
    unitLimit: 200,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards: new HazardSystem(w),
  };
  ctx.laws.hunger = false;
  ctx.laws.aging = false;
  ctx.laws.monsters = false;
  return ctx;
}

function found(ctx: AiContext, x: number, y: number, kingdom = -1) {
  const def = SPECIES[Species.HUMAN];
  const ids = [0, 1, 2, 3].map((k) => ctx.units.spawn(Species.HUMAN, x + k, y, { sex: k % 2, ageTicks: def.adultTicks + 10, generation: 0, thinkOffset: k, nameSeed: k }));
  ctx.spatial.rebuild(ctx.units);
  const v = ctx.civ.foundVillage(Species.HUMAN, x, y, ids, ctx, kingdom);
  if (!v) throw new Error('no se pudo fundar');
  return v;
}

describe('categorías de camino', () => {
  it('el desgaste pasa por sendero y camino; la calzada es el máximo', () => {
    expect(roadLevel(0)).toBe(RoadLevel.NONE);
    expect(roadLevel(ROAD_PATH - 1)).toBe(RoadLevel.NONE);
    expect(roadLevel(ROAD_PATH)).toBe(RoadLevel.PATH);
    expect(roadLevel(ROAD_WORN)).toBe(RoadLevel.WORN);
    expect(roadLevel(ROAD_PAVED - 1)).toBe(RoadLevel.WORN);
    expect(roadLevel(ROAD_PAVED)).toBe(RoadLevel.PAVED);
    expect(ROAD_SPEED[RoadLevel.NONE]).toBe(1);
    expect(ROAD_SPEED[RoadLevel.PATH]).toBeLessThan(ROAD_SPEED[RoadLevel.WORN]);
    expect(ROAD_SPEED[RoadLevel.WORN]).toBeLessThan(ROAD_SPEED[RoadLevel.PAVED]);
  });

  it('pisar desgasta sin llegar nunca a calzada, y no sobre agua ni edificios', () => {
    const w = land();
    const t = w.idx(10, 10);
    for (let k = 0; k < 100; k++) w.wearRoad(t, 10);
    expect(w.road[t]).toBe(ROAD_PAVED - 1);
    const water = w.idx(20, 20);
    w.setHeight(water, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    w.wearRoad(water, 50);
    w.paveRoad(water);
    expect(w.road[water]).toBe(0);
    const built = w.idx(30, 30);
    w.buildingAt[built] = 1;
    w.wearRoad(built, 50);
    expect(w.road[built]).toBe(0);
  });

  it('sólo se repinta el mapa cuando una casilla cambia de categoría', () => {
    const w = land();
    w.consumeDirtyChunks(() => {});
    const dirty = (): number => {
      let n = 0;
      w.consumeDirtyChunks(() => n++);
      return n;
    };
    const t = w.idx(40, 40);
    w.wearRoad(t, ROAD_PATH - 1);
    expect(dirty()).toBe(0);
    w.wearRoad(t, 1);
    expect(dirty()).toBe(1);
    w.wearRoad(t, 5);
    expect(dirty()).toBe(0);
  });
});

describe('senderos por desgaste', () => {
  it('los aldeanos van marcando el suelo de su aldea; los animales no', () => {
    const w = land();
    const ctx = makeCtx(w);
    found(ctx, 48, 48);
    const sheep = ctx.units.spawn(Species.SHEEP, 10.5, 10.5, { sex: 0, ageTicks: 900, generation: 0, thinkOffset: 0 });
    for (let t = 0; t < 1500; t++) {
      ctx.tick++;
      ctx.pathfinder.resetBudget();
      ctx.spatial.rebuild(ctx.units);
      ctx.civ.update(ctx);
      updateUnits(ctx);
    }
    expect(ctx.units.isAlive(sheep)).toBe(true);
    let near = 0;
    let far = 0;
    for (let i = 0; i < w.size; i++) {
      if (w.road[i] === 0) continue;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      if (Math.abs(x - 48) < 30 && Math.abs(y - 48) < 30) near++;
      else far++;
    }
    expect(near).toBeGreaterThan(10);
    expect(far).toBe(0);
  });

  it('sin tránsito, la hierba borra los senderos pero no las calzadas', () => {
    const w = land();
    const worn = w.idx(10, 10);
    const paved = w.idx(12, 10);
    w.wearRoad(worn, ROAD_PATH + 6);
    w.paveRoad(paved);
    const veg = new VegetationSystem(w);
    const rng = new Rng(1);
    for (let t = 0; t < VEGETATION_PASS_TICKS * 5; t++) veg.step(rng);
    expect(w.road[worn]).toBe(ROAD_PATH + 6 - 10);
    expect(roadLevel(w.road[worn])).toBe(RoadLevel.NONE);
    for (let t = 0; t < VEGETATION_PASS_TICKS * 100; t++) veg.step(rng);
    expect(w.road[worn]).toBe(0);
    expect(w.road[paved]).toBe(ROAD_PAVED);
  });

  it('por un camino se anda más deprisa', () => {
    const w = land();
    const u = new UnitStore(4);
    const walk = (y: number): number => {
      const i = u.spawn(Species.HUMAN, 10.5, y + 0.5, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 });
      for (let t = 0; t < 40; t++) moveToward(w, u, i, 60.5, y + 0.5, 0.1);
      return u.x[i] - 10.5;
    };
    for (let x = 0; x < SIZE; x++) {
      w.wearRoad(w.idx(x, 21), ROAD_PATH);
      w.paveRoad(w.idx(x, 22));
    }
    const grass = walk(20);
    expect(walk(21) / grass).toBeCloseTo(ROAD_SPEED[RoadLevel.PATH], 2);
    expect(walk(22) / grass).toBeCloseTo(ROAD_SPEED[RoadLevel.PAVED], 2);
  });
});

describe('calzadas', () => {
  it('una colonia nueva queda unida a su capital por una calzada', () => {
    const w = land();
    const ctx = makeCtx(w);
    const capital = found(ctx, 20, 48);
    const colony = found(ctx, 70, 48, capital.kingdom);
    let paved = 0;
    for (let x = capital.cx + 3; x < colony.cx - 2; x++) if (w.road[w.idx(x, capital.cy)] === ROAD_PAVED) paved++;
    expect(paved).toBe(colony.cx - 2 - (capital.cx + 3));
    // Bajo los edificios no hay calzada.
    expect(w.road[w.idx(capital.cx, capital.cy)]).toBe(0);
  });

  it('no se tiende hasta una capital lejana ni entre reinos distintos', () => {
    const w = land();
    const ctx = makeCtx(w);
    const capital = found(ctx, 8, 8);
    found(ctx, 88, 88, capital.kingdom);
    found(ctx, 48, 8);
    expect(w.road.some((r) => r > 0)).toBe(false);
  });

  it('el pincel «Calzada» empiedra la tierra y despeja la vegetación', () => {
    const w = land();
    w.flora[w.idx(30, 30)] = Flora.TREE;
    w.setHeight(w.idx(31, 30), TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    applyBrush(w, new Rng(1), 'road', 30, 30, 3);
    expect(w.road[w.idx(30, 30)]).toBe(ROAD_PAVED);
    expect(w.flora[w.idx(30, 30)]).toBe(Flora.NONE);
    expect(w.road[w.idx(31, 30)]).toBe(0);
    expect(toolById('road')).toMatchObject({ tab: 'terreno', kind: 'brush', brush: 'road', label: 'Calzada' });
  });

  it('una calzada inundada desaparece y no vuelve al secar; tampoco se planta sobre ella', () => {
    const w = land();
    const t = w.idx(30, 30);
    w.paveRoad(t);
    applyBrush(w, new Rng(1), 'tree', 30, 30, 1);
    expect(w.flora[t]).toBe(Flora.NONE);
    w.setHeight(t, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    expect(w.road[t]).toBe(0);
    w.setHeight(t, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    expect(w.road[t]).toBe(0);
    applyBrush(w, new Rng(1), 'tree', 30, 30, 1);
    expect(w.flora[t]).toBe(Flora.TREE);
  });

  it('los retoños no brotan sobre un camino', () => {
    const w = land();
    for (let i = 0; i < w.size; i++) {
      w.setBiome(i, Biome.JUNGLE);
      if (i % 3 === 0) w.flora[i] = Flora.TREE;
      else w.paveRoad(i);
    }
    const veg = new VegetationSystem(w);
    const rng = new Rng(2);
    for (let t = 0; t < VEGETATION_PASS_TICKS * 40; t++) veg.step(rng);
    let saplings = 0;
    // (Donde muere un árbol sí puede brotar otro: esas casillas no son camino.)
    for (let i = 0; i < w.size; i++) if (w.flora[i] === Flora.SAPLING && w.road[i] > 0) saplings++;
    expect(saplings).toBe(0);
  });
});

describe('simulación con caminos', () => {
  it('es determinista y los caminos entran en el hash del estado', () => {
    const make = (road: number): Simulation => {
      const sim = new Simulation({ seedText: 'caminos', size: 96, capacity: 300, populate: true });
      sim.apply({ type: 'spawn', species: Species.HUMAN, x: 48, y: 48, size: 9 });
      if (road >= 0) sim.apply({ type: 'brush', tool: 'road', x: road % 96, y: Math.floor(road / 96), size: 1 });
      for (let t = 0; t < 600; t++) sim.step();
      return sim;
    };
    const a = make(-1);
    expect(a.stateHash()).toBe(make(-1).stateHash());
    // Una sola casilla de calzada en tierra firme (lejos de todo) cambia el hash.
    let spot = -1;
    for (let i = 0; i < a.world.size && spot < 0; i++) if (a.world.isWalkableAt(i % 96, Math.floor(i / 96)) && a.world.road[i] === 0 && a.world.buildingAt[i] === 0) spot = i;
    const b = make(spot);
    expect(b.world.road[spot]).toBe(ROAD_PAVED);
    expect(b.world.stateHash()).not.toBe(a.world.stateHash());
  });
});
