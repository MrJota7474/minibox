import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, type AiContext } from '../src/ai/context';
import { Nav, navigateTo } from '../src/ai/navigation';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { JOB_COUNT, JOB_NAMES, Job, Resource, type Village } from '../src/civ/model';
import { ambush, canHoldFair, finishTrade, holdFair, onDangerousRoad, pickGood, startTrade } from '../src/civ/trade';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { STATE_LABELS, UnitState, UnitStore } from '../src/entities/units';
import { applyBrush } from '../src/powers/brush';
import { HazardSystem } from '../src/powers/hazards';
import { toolById } from '../src/powers/tools';
import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { ROAD_PAVED, World } from '../src/world/world';

const SIZE = 96;
const h = (t: number): number => TERRAIN_INFO[t].paintHeight;

/** Tierra llana con un río vertical de `width` casillas a partir de x = 46 (0 = sin río). */
function land(river = 0, terrain: number = Terrain.SHALLOW): World {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    const x = i % SIZE;
    w.setHeight(i, x >= 46 && x < 46 + river ? h(terrain) : h(Terrain.SOIL_LOW));
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

function adult(ctx: AiContext, x: number, y: number, k = 0): number {
  return ctx.units.spawn(Species.HUMAN, x, y, { sex: k % 2, ageTicks: SPECIES[Species.HUMAN].adultTicks + 10, generation: 0, thinkOffset: k, nameSeed: k });
}

function found(ctx: AiContext, x: number, y: number, kingdom = -1, species: number = Species.HUMAN): Village {
  const ids = [0, 1, 2, 3].map((k) => ctx.units.spawn(species as 3, x + k, y, { sex: k % 2, ageTicks: SPECIES[species].adultTicks + 10, generation: 0, thinkOffset: k, nameSeed: k }));
  ctx.spatial.rebuild(ctx.units);
  const v = ctx.civ.foundVillage(species as 3, x, y, ids, ctx, kingdom);
  if (!v) throw new Error('no se pudo fundar');
  return v;
}

function run(ctx: AiContext, ticks: number, withCiv = false): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick++;
    if (ctx.world.regionsDirty) ctx.world.computeRegions();
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    if (withCiv) ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

describe('puentes', () => {
  it('un puente hace pisable el agua y une las dos orillas en una sola región', () => {
    const w = land(4);
    expect(w.regionAt(40, 50)).not.toBe(w.regionAt(60, 50));
    expect(w.isWalkableAt(47.5, 50.5)).toBe(false);
    for (let x = 46; x < 50; x++) expect(w.buildBridge(w.idx(x, 50))).toBe(true);
    expect(w.regionsDirty).toBe(true);
    w.computeRegions();
    expect(w.isBridge(w.idx(47, 50))).toBe(true);
    expect(w.isWalkableAt(47.5, 50.5)).toBe(true);
    expect(w.regionAt(40, 50)).toBe(w.regionAt(60, 50));
    // Sigue siendo agua para los barcos.
    expect(w.isWaterIdx(w.idx(47, 50))).toBe(true);
    expect(w.seaAt(47, 50)).toBeGreaterThan(0);
  });

  it('no se tiende sobre el abismo ni sobre tierra', () => {
    const w = land(4, Terrain.DEEP);
    expect(w.buildBridge(w.idx(47, 50))).toBe(false);
    expect(w.buildBridge(w.idx(20, 50))).toBe(false);
    expect(w.road[w.idx(47, 50)]).toBe(0);
    expect(w.road[w.idx(20, 50)]).toBe(0);
  });

  it('las criaturas lo cruzan: el A* encuentra la ruta por el puente', () => {
    const w = land(4);
    const ctx = makeCtx(w);
    const walker = adult(ctx, 40.5, 20.5);
    expect(ctx.pathfinder.find(40, 20, 60, 20, ctx.units.path, 0, 24)).toBe(0);
    for (let x = 46; x < 50; x++) w.buildBridge(w.idx(x, 50));
    w.computeRegions();
    let result: number = Nav.MOVING;
    for (let t = 0; t < 3000 && result !== Nav.ARRIVED && result !== Nav.FAILED; t++) {
      ctx.pathfinder.resetBudget();
      result = navigateTo(ctx, walker, 60.5, 20.5, 0.1);
    }
    expect(result).toBe(Nav.ARRIVED);
    expect(ctx.units.x[walker]).toBeCloseTo(60.5, 3);
  });

  it('si el fondo se hunde el puente se pierde; al rellenarlo queda calzada', () => {
    const w = land(4);
    const a = w.idx(46, 50);
    const b = w.idx(47, 50);
    w.buildBridge(a);
    w.buildBridge(b);
    w.computeRegions();
    w.setHeight(a, h(Terrain.DEEP));
    expect(w.road[a]).toBe(0);
    expect(w.regionsDirty).toBe(true);
    w.setHeight(b, h(Terrain.SOIL_LOW));
    expect(w.road[b]).toBe(ROAD_PAVED);
    expect(w.isBridge(b)).toBe(false);
  });

  it('la calzada de una colonia cruza un río estrecho con un puente, pero no un brazo de mar', () => {
    const narrow = makeCtx(land(4));
    const capital = found(narrow, 30, 48);
    const colony = found(narrow, 64, 48, capital.kingdom);
    const w = narrow.world;
    for (let x = 46; x < 50; x++) expect(w.isBridge(w.idx(x, capital.cy))).toBe(true);
    w.computeRegions();
    expect(w.regionAt(capital.cx, capital.cy)).toBe(w.regionAt(colony.cx, colony.cy));

    const wide = makeCtx(land(10));
    const far = found(wide, 30, 48);
    found(wide, 70, 48, far.kingdom);
    let bridges = 0;
    for (let i = 0; i < wide.world.size; i++) if (wide.world.isBridge(i)) bridges++;
    expect(bridges).toBe(0);
    // ...ni se dejan dos trozos de calzada que no unen nada.
    expect(wide.world.road.some((r) => r > 0)).toBe(false);
  });

  it('una calzada en diagonal cruza el río en escalera y une de verdad las dos orillas', () => {
    const w = land(4);
    const ctx = makeCtx(w);
    w.paveLine(30, 30, 66, 52, 8);
    w.computeRegions();
    expect(w.regionAt(30, 30)).toBe(w.regionAt(66, 52));
    // El A* sólo puede pasar por el puente.
    expect(ctx.pathfinder.find(44, 38, 52, 44, ctx.units.path, 0, 24)).toBeGreaterThan(0);
  });

  it('el puente aguanta si el fondo pasa de aguas someras a océano', () => {
    const w = land(4);
    const t = w.idx(47, 50);
    w.buildBridge(t);
    w.setHeight(t, h(Terrain.OCEAN));
    expect(w.isBridge(t)).toBe(true);
    w.setHeight(t, h(Terrain.SHALLOW));
    expect(w.isBridge(t)).toBe(true);
  });

  it('el pincel «Puente» sólo actúa sobre el agua', () => {
    const w = land(4);
    applyBrush(w, new Rng(1), 'bridge', 46, 50, 3);
    expect(w.isBridge(w.idx(46, 50))).toBe(true);
    expect(w.isBridge(w.idx(47, 50))).toBe(true);
    expect(w.road[w.idx(45, 50)]).toBe(0);
    expect(toolById('bridge')).toMatchObject({ tab: 'terreno', kind: 'brush', brush: 'bridge', label: 'Puente' });
  });
});

describe('comercio', () => {
  function pair(): { ctx: AiContext; a: Village; b: Village } {
    const ctx = makeCtx(land());
    const a = found(ctx, 20, 48);
    const b = found(ctx, 60, 48, -1, Species.PETRINO);
    a.resources = [80, 90, 0, 0, 0];
    b.resources = [80, 5, 70, 0, 0];
    return { ctx, a, b };
  }

  it('existe el oficio de mercader y su estado', () => {
    expect(JOB_COUNT).toBe(11);
    expect(JOB_NAMES[Job.MERCHANT]).toBe('Mercader');
    expect(STATE_LABELS[UnitState.TRADE]).toBe('Comerciando');
  });

  it('se lleva lo que más sobra respecto a la otra aldea, guardando una reserva', () => {
    const { a, b } = pair();
    expect(pickGood(a, b)).toBe(Resource.WOOD);
    expect(pickGood(b, a)).toBe(Resource.STONE);
    // Sin excedente no hay viaje; la comida justa para la aldea no se exporta.
    a.resources = [25, 22, 0, 0, 0];
    b.resources = [20, 15, 0, 0, 0];
    expect(pickGood(a, b)).toBe(-1);
    a.resources = [8 * 3 + 5, 0, 0, 0, 0];
    a.population = 10;
    expect(pickGood(a, b)).toBe(-1);
    // Con el almacén del otro lleno tampoco.
    a.resources = [0, 100, 0, 0, 0];
    b.resources = [0, b.storageCap, 0, 0, 0];
    expect(pickGood(a, b)).toBe(-1);
  });

  it('un viaje completo: entrega, oro para las dos aldeas y carga de vuelta', () => {
    const { ctx, a, b } = pair();
    const merchant = adult(ctx, a.cx + 0.5, a.cy + 2.5, 9);
    ctx.civ.joinVillage(merchant, a);
    ctx.units.job[merchant] = Job.MERCHANT;
    const u = ctx.units;
    expect(startTrade(ctx, merchant, a)).toBe(true);
    expect(u.state[merchant]).toBe(UnitState.TRADE);
    expect(u.carry[merchant] - 1).toBe(Resource.WOOD);
    expect(u.carryAmount[merchant]).toBe(8);
    expect(a.resources[Resource.WOOD]).toBe(82);
    // Sólo el mercader se mueve (los demás se quedan sin oficio en casa).
    for (let t = 0; t < 1200 && u.state[merchant] === UnitState.TRADE; t++) run(ctx, 1);
    expect(b.resources[Resource.WOOD]).toBe(13);
    expect(a.resources[Resource.GOLD]).toBe(1);
    expect(b.resources[Resource.GOLD]).toBe(1);
    expect(u.carry[merchant] - 1).toBe(Resource.STONE);
    expect(b.resources[Resource.STONE]).toBe(62);
    for (let t = 0; t < 1500 && u.carry[merchant] !== 0; t++) run(ctx, 1);
    expect(a.resources[Resource.STONE]).toBe(8);
    // El ir y venir deja marcado el camino entre las dos aldeas.
    let worn = 0;
    for (let x = a.cx + 4; x < b.cx - 4; x++) for (let dy = -3; dy <= 3; dy++) if (ctx.world.road[ctx.world.idx(x, a.cy + dy)] > 0) worn++;
    expect(worn).toBeGreaterThan(20);
  });

  it('lejos de las dos aldeas y sin escolta el camino es peligroso; los bandidos se llevan la carga', () => {
    const { ctx, a } = pair();
    const merchant = adult(ctx, a.cx + 0.5, a.cy + 2.5, 9);
    ctx.civ.joinVillage(merchant, a);
    ctx.units.job[merchant] = Job.MERCHANT;
    expect(startTrade(ctx, merchant, a)).toBe(true);
    const u = ctx.units;
    // Junto a casa no hay peligro.
    ctx.spatial.rebuild(u);
    expect(onDangerousRoad(ctx, merchant)).toBe(false);
    // A medio camino (las aldeas están a 40 casillas), sí.
    u.x[merchant] = 40.5;
    ctx.spatial.rebuild(u);
    expect(onDangerousRoad(ctx, merchant)).toBe(true);
    // Con un guerrero de su aldea al lado, no.
    const guard = adult(ctx, 41.5, a.cy + 0.5, 3);
    ctx.civ.joinVillage(guard, a);
    u.job[guard] = Job.WARRIOR;
    ctx.spatial.rebuild(u);
    expect(onDangerousRoad(ctx, merchant)).toBe(false);
    ambush(ctx, merchant);
    expect(u.carry[merchant]).toBe(0);
    expect(u.work[merchant]).toBe(-1);
    expect(u.hp[merchant]).toBeLessThan(SPECIES[Species.HUMAN].maxHp);
    expect(ctx.civ.chronicle.at(-1)?.type).toBe('bandits');
    // Vuelve a casa y tarda en salir de nuevo: no reanuda el viaje desde el sitio del asalto.
    expect(u.state[merchant]).toBe(UnitState.WANDER);
    expect(u.tx[merchant]).toBe(a.cx + 0.5);
    const woodBefore = a.resources[Resource.WOOD];
    run(ctx, 40);
    expect(u.state[merchant]).not.toBe(UnitState.TRADE);
    expect(a.resources[Resource.WOOD]).toBe(woodBefore);
  });

  it('un asalto puede matar a un mercader malherido', () => {
    const { ctx, a } = pair();
    const merchant = adult(ctx, 40.5, a.cy + 0.5, 9);
    ctx.civ.joinVillage(merchant, a);
    ctx.units.job[merchant] = Job.MERCHANT;
    ctx.units.hp[merchant] = 5;
    ambush(ctx, merchant);
    expect(ctx.units.isAlive(merchant)).toBe(false);
  });

  it('en una aldea próspera y poblada puede montarse una feria: oro para las dos y la anfitriona de fiesta', () => {
    const { ctx, a, b } = pair();
    b.population = 10;
    b.resources[Resource.FOOD] = 10;
    expect(canHoldFair(b)).toBe(false);
    b.resources[Resource.FOOD] = 60;
    expect(canHoldFair(b)).toBe(true);
    const goldA = a.resources[Resource.GOLD];
    const goldB = b.resources[Resource.GOLD];
    holdFair(ctx, a, b);
    expect(a.resources[Resource.GOLD]).toBeGreaterThan(goldA);
    expect(b.resources[Resource.GOLD]).toBeGreaterThan(goldB);
    expect(ctx.civ.isFestive(b.id)).toBe(true);
    expect(ctx.civ.chronicle.at(-1)?.type).toBe('fair');
    expect(ctx.civ.chronicle.at(-1)?.text).toContain(b.name);
  });

  it('un mercader dunario carga el doble', () => {
    const { ctx, a, b } = pair();
    const merchant = ctx.units.spawn(Species.DUNEFOLK, a.cx + 0.5, a.cy + 2.5, { sex: 0, ageTicks: SPECIES[Species.DUNEFOLK].adultTicks + 10, generation: 0, thinkOffset: 0, nameSeed: 9 });
    ctx.civ.joinVillage(merchant, a);
    expect(startTrade(ctx, merchant, a)).toBe(true);
    expect(ctx.units.carryAmount[merchant]).toBe(16);
    expect(a.resources[Resource.WOOD]).toBe(74);
    expect(b.resources[Resource.WOOD]).toBe(5);
  });

  it('el comercio entre reinos distintos borra agravios; con el enemigo no se comercia', () => {
    const { ctx, a, b } = pair();
    const ks = ctx.civ.kingdoms;
    ks.kingdoms[a.kingdom].grievances[b.kingdom] = 3;
    ks.kingdoms[b.kingdom].grievances[a.kingdom] = 1;
    // Una aldea pequeña: sin feria, que también limaría agravios.
    b.population = 2;
    const merchant = adult(ctx, b.cx + 0.5, b.cy + 0.5, 9);
    ctx.civ.joinVillage(merchant, a);
    expect(startTrade(ctx, merchant, a)).toBe(true);
    finishTrade(ctx, merchant);
    expect(ks.kingdoms[a.kingdom].grievances[b.kingdom]).toBe(2);
    expect(ks.kingdoms[b.kingdom].grievances[a.kingdom]).toBe(0);

    ks.declareWar(a.kingdom, b.kingdom);
    expect(startTrade(ctx, merchant, a)).toBe(false);
    // Si la guerra estalla con el mercader en camino, vuelve con su carga.
    ks.peaceBetween(a.kingdom, b.kingdom);
    ctx.units.carry[merchant] = 0;
    expect(startTrade(ctx, merchant, a)).toBe(true);
    const wood = b.resources[Resource.WOOD];
    ks.kingdoms[a.kingdom].truce = {};
    ks.kingdoms[b.kingdom].truce = {};
    ks.declareWar(a.kingdom, b.kingdom);
    finishTrade(ctx, merchant);
    expect(b.resources[Resource.WOOD]).toBe(wood);
    expect(ctx.units.carry[merchant] - 1).toBe(Resource.WOOD);
  });

  it('no hay socio al otro lado del agua hasta que un puente une las aldeas', () => {
    const ctx = makeCtx(land(4));
    const a = found(ctx, 20, 48);
    const b = found(ctx, 62, 48);
    a.resources = [80, 90, 0, 0, 0];
    const merchant = adult(ctx, a.cx + 0.5, a.cy + 2.5, 9);
    ctx.civ.joinVillage(merchant, a);
    expect(startTrade(ctx, merchant, a)).toBe(false);
    for (let x = 46; x < 50; x++) ctx.world.buildBridge(ctx.world.idx(x, a.cy));
    ctx.world.computeRegions();
    expect(startTrade(ctx, merchant, a)).toBe(true);
    for (let t = 0; t < 1500 && ctx.units.state[merchant] === UnitState.TRADE; t++) run(ctx, 1);
    expect(b.resources[Resource.WOOD]).toBeGreaterThan(8);
  });

  it('una aldea grande y en paz nombra mercaderes; en guerra, no', () => {
    const ctx = makeCtx(land());
    const ids = Array.from({ length: 20 }, (_, k) => adult(ctx, 40 + (k % 5), 48 + Math.floor(k / 5), k));
    ctx.spatial.rebuild(ctx.units);
    const v = ctx.civ.foundVillage(Species.HUMAN, 40, 48, ids, ctx);
    if (!v) throw new Error('no se pudo fundar');
    v.resources = [400, 50, 0, 0, 0];
    const other = found(ctx, 80, 48, -1, Species.TUSKER);
    run(ctx, 61, true);
    expect(v.jobCounts[Job.MERCHANT]).toBe(1);
    ctx.civ.kingdoms.declareWar(v.kingdom, other.kingdom);
    run(ctx, 60, true);
    expect(v.jobCounts[Job.MERCHANT]).toBe(0);
  });
});
