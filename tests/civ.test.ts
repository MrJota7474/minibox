import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { BUILDING_DEFS, BuildingType, Job, Resource, canAfford, pay } from '../src/civ/model';
import { personName, villageName } from '../src/civ/names';
import { canPlace, findBuildSpot, searchTile } from '../src/civ/placement';
import { planVillage } from '../src/civ/planner';
import { Nav, navigateTo } from '../src/ai/navigation';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { NO_VILLAGE, UnitState, UnitStore } from '../src/entities/units';
import { Simulation } from '../src/sim/simulation';
import { BUILDING_TEMPLATES } from '../src/render/civ-sprites';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 96;

function landWorld(): World {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
    w.setGrass(i, 150);
  }
  // Bosque, bayas y rocas alrededor del centro.
  const rng = new Rng(4);
  for (let i = 0; i < w.size; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    if (Math.abs(x - 48) < 6 && Math.abs(y - 48) < 6) continue;
    const r = rng.float();
    if (r < 0.08) w.flora[i] = Flora.TREE;
    else if (r < 0.12) w.flora[i] = Flora.BERRY_BUSH;
    else if (r < 0.13) w.flora[i] = Flora.ROCK;
  }
  w.computeRegions();
  return w;
}

function makeCtx(world: World, capacity = 300): AiContext {
  const units = new UnitStore(capacity);
  return {
    world,
    units,
    spatial: new SpatialHash(world.width, world.height, capacity),
    rng: new Rng(7),
    tick: 0,
    unitLimit: capacity,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(world),
    civ: new CivSystem(world, units),
  };
}

function spawnAdults(ctx: AiContext, n: number, x: number, y: number, species: number = Species.HUMAN): number[] {
  const def = SPECIES[species];
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    out.push(ctx.units.spawn(species as 3, x + (k % 3), y + Math.floor(k / 3), { sex: k % 2, ageTicks: def.adultTicks + 10, generation: 0, thinkOffset: k, nameSeed: k }));
  }
  return out;
}

let tick = 0;
function run(ctx: AiContext, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick = tick++;
    if (ctx.world.regionsDirty && ctx.tick % 10 === 0) ctx.world.computeRegions();
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

describe('aldeas', () => {
  it('un grupo de 3 o más aldeanos sin aldea funda una', () => {
    const ctx = makeCtx(landWorld());
    const group = spawnAdults(ctx, 6, 47, 47);
    run(ctx, 40);
    expect(ctx.civ.villages).toHaveLength(1);
    const v = ctx.civ.villages[0];
    expect(v.alive).toBe(true);
    expect(v.race).toBe(Species.HUMAN);
    for (const i of group) expect(ctx.units.village[i]).toBe(v.id);
    const hall = ctx.civ.building(v.hallId);
    expect(hall?.level).toBe(1);
    expect(v.zones).toBeGreaterThan(0);
    expect(ctx.world.ownerAt(v.cx, v.cy)).toBe(v.id);
    expect(ctx.civ.events.some((e) => e.type === 'founded')).toBe(true);
  });

  it('una aldea llena no acepta a nadie más', () => {
    const ctx = makeCtx(landWorld());
    spawnAdults(ctx, 4, 47, 47);
    run(ctx, 40);
    const [loner] = spawnAdults(ctx, 1, 60, 47);
    run(ctx, 40);
    expect(ctx.units.village[loner]).toBe(NO_VILLAGE);
  });

  it('un aldeano solo no funda, pero se une a una aldea cercana de su raza si hay sitio', () => {
    const ctx = makeCtx(landWorld());
    // Sin nacimientos, para que quede una plaza libre en la hoguera.
    for (const i of spawnAdults(ctx, 3, 47, 47)) ctx.units.cooldown[i] = 60000;
    run(ctx, 40);
    const [loner] = spawnAdults(ctx, 1, 60, 47);
    run(ctx, 40);
    expect(ctx.civ.villages).toHaveLength(1);
    expect(ctx.units.village[loner]).toBe(0);
  });

  it('los aldeanos trabajan y la aldea acumula recursos y construye', () => {
    const ctx = makeCtx(landWorld());
    spawnAdults(ctx, 8, 47, 47);
    run(ctx, 3000);
    const v = ctx.civ.villages[0];
    expect(v.jobCounts[Job.WOODCUTTER] + v.jobCounts[Job.GATHERER]).toBeGreaterThan(0);
    const built = ctx.civ.buildings.filter((b) => b.alive && b.village === v.id && b.type === BuildingType.HOUSE && b.level >= 1);
    expect(built.length).toBeGreaterThan(0);
    expect(v.housing).toBeGreaterThan(BUILDING_DEFS[BuildingType.HALL].housing[0]);
  });

  it('no nacen más aldeanos de los que caben en las viviendas', () => {
    const ctx = makeCtx(landWorld());
    spawnAdults(ctx, 4, 47, 47);
    run(ctx, 40);
    const v = ctx.civ.villages[0];
    // Sin madera no puede construir casas: la población queda limitada a la hoguera.
    v.resources.fill(0);
    for (let i = 0; i < ctx.world.size; i++) if (ctx.world.flora[i] === Flora.TREE) ctx.world.flora[i] = Flora.NONE;
    run(ctx, 4000);
    expect(v.population).toBeLessThanOrEqual(Math.max(4, v.housing));
  });

  it('si se inunda el ayuntamiento, la aldea queda abandonada y sus aldeanos libres', () => {
    const ctx = makeCtx(landWorld());
    const group = spawnAdults(ctx, 5, 47, 47);
    run(ctx, 40);
    const v = ctx.civ.villages[0];
    const hall = ctx.civ.building(v.hallId);
    expect(hall).not.toBeNull();
    if (!hall) return;
    ctx.world.setHeight(ctx.world.idx(hall.x + 1, hall.y + 1), 0);
    run(ctx, 40);
    expect(v.alive).toBe(false);
    expect(ctx.world.ownerAt(v.cx, v.cy)).not.toBe(v.id);
    expect(ctx.civ.buildings.filter((b) => b.village === v.id).every((b) => !b.alive)).toBe(true);
    for (const i of group) if (ctx.units.isAlive(i)) expect(ctx.units.village[i] === NO_VILLAGE || ctx.units.village[i] !== v.id).toBe(true);
  });

  it('al morir un aldeano se libera la casilla que tenía reservada', () => {
    const ctx = makeCtx(landWorld());
    const [a] = spawnAdults(ctx, 4, 47, 47);
    run(ctx, 200);
    const tile = 10;
    ctx.world.reserved[tile] = 1;
    ctx.units.work[a] = tile;
    ctx.civ.onUnitDeath(a);
    expect(ctx.world.reserved[tile]).toBe(0);
  });
});

describe('colocación', () => {
  it('canPlace exige terreno edificable y libre, y findBuildSpot encuentra hueco', () => {
    const w = landWorld();
    expect(canPlace(w, 40, 40, 2, 2, -1)).toBe(true);
    w.setHeight(w.idx(41, 41), 0);
    expect(canPlace(w, 40, 40, 2, 2, -1)).toBe(false);
    const spot = findBuildSpot(w, 40, 40, 3, 3, -1, 6);
    expect(spot).not.toBeNull();
  });

  it('searchTile encuentra la casilla más cercana en la región', () => {
    const w = landWorld();
    const t = searchTile(w, 48, 48, 20, w.region[w.idx(48, 48)], (i) => w.flora[i] === Flora.TREE);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(w.flora[t]).toBe(Flora.TREE);
  });
});

describe('modelo y nombres', () => {
  it('canAfford y pay', () => {
    const res = [10, 10, 0, 0, 0];
    expect(canAfford(res, [5, 5, 0, 0, 0])).toBe(true);
    expect(canAfford(res, [0, 0, 1, 0, 0])).toBe(false);
    pay(res, [5, 2, 0, 0, 0]);
    expect(res[Resource.FOOD]).toBe(5);
    expect(res[Resource.WOOD]).toBe(8);
  });

  it('los nombres son deterministas y distintos por raza', () => {
    expect(personName(Species.HUMAN, 42)).toBe(personName(Species.HUMAN, 42));
    expect(villageName(Species.PETRINO, 7)).not.toBe(villageName(Species.SILVAN, 7));
    expect(personName(Species.TUSKER, 1).length).toBeGreaterThan(2);
  });

  it('las plantillas de edificios son rectangulares', () => {
    for (const rows of Object.values(BUILDING_TEMPLATES)) {
      for (const row of rows) expect(row.length).toBe(rows[0].length);
    }
  });
});

describe('simulación con aldeas', () => {
  it('es determinista con civilizaciones', () => {
    const make = (): Simulation => {
      const sim = new Simulation({ seedText: 'aldea', size: 128, capacity: 400, populate: true });
      sim.apply({ type: 'spawn', species: Species.HUMAN, x: 64, y: 64, size: 9 });
      sim.apply({ type: 'spawn', species: Species.PETRINO, x: 40, y: 70, size: 9 });
      for (let t = 0; t < 2500; t++) sim.step();
      return sim;
    };
    const a = make();
    const b = make();
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.civ.villages.length).toBe(b.civ.villages.length);
  });

  it('los aldeanos pasan por estados de trabajo', () => {
    const ctx = makeCtx(landWorld());
    const group = spawnAdults(ctx, 8, 47, 47);
    const seen = new Set<number>();
    for (let k = 0; k < 600; k++) {
      run(ctx, 1);
      for (const i of group) if (ctx.units.isAlive(i)) seen.add(ctx.units.state[i]);
    }
    expect(seen.has(UnitState.WORK_GO)).toBe(true);
    expect(seen.has(UnitState.WORK)).toBe(true);
    expect(seen.has(UnitState.DELIVER)).toBe(true);
  });
});

describe('navegación', () => {
  it('rodea un lago siguiendo una ruta A*', () => {
    const w = landWorld();
    for (let y = 30; y < 70; y++) w.setHeight(w.idx(50, y), 0);
    w.computeRegions();
    const ctx = makeCtx(w);
    const [i] = spawnAdults(ctx, 1, 45, 50);
    let result: number = Nav.MOVING;
    for (let t = 0; t < 1500 && result !== Nav.ARRIVED; t++) {
      ctx.pathfinder.resetBudget();
      result = navigateTo(ctx, i, 55.5, 50.5, 0.2);
      expect(result).not.toBe(Nav.FAILED);
    }
    expect(result).toBe(Nav.ARRIVED);
  });
});

describe('planificador', () => {
  function bigVillage(pop: number): { ctx: AiContext; v: ReturnType<CivSystem['foundVillage']> } {
    const ctx = makeCtx(landWorld(), 400);
    const members = spawnAdults(ctx, pop, 40, 40);
    ctx.spatial.rebuild(ctx.units);
    const v = ctx.civ.foundVillage(Species.HUMAN, 47, 47, members, ctx);
    return { ctx, v };
  }

  it('mejora el ayuntamiento cuando hay población y recursos', () => {
    const { ctx, v } = bigVillage(12);
    expect(v).not.toBeNull();
    if (!v) return;
    v.population = 12;
    v.adults = 12;
    v.housing = 30;
    v.resources = [100, 100, 100, 100, 100];
    planVillage(ctx.civ, v, ctx);
    expect(ctx.civ.building(v.hallId)?.underConstruction).toBe(true);
    expect(v.resources[Resource.WOOD]).toBeLessThan(100);
  });

  it('una aldea grande y próspera envía colonos que fundan otra aldea', () => {
    const { ctx, v } = bigVillage(30);
    if (!v) throw new Error('sin aldea');
    v.population = 30;
    v.adults = 30;
    v.housing = 30;
    v.resources = [200, 50, 0, 0, 0];
    v.lastSettlers = -100000;
    planVillage(ctx.civ, v, ctx);
    let settlers = 0;
    for (let i = 0; i < ctx.units.highWater; i++) if (ctx.units.job[i] === Job.SETTLER) settlers++;
    expect(settlers).toBeGreaterThanOrEqual(2);
    run(ctx, 2500);
    expect(ctx.civ.villages.filter((x) => x.alive).length).toBeGreaterThanOrEqual(2);
  });
});
