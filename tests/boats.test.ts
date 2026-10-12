import { describe, expect, it } from 'vitest';
import { DeathCause, type AiContext } from '../src/ai/context';
import { findSeaRoute, waterLine } from '../src/ai/sea-route';
import { BoatKind, BoatState, dockWaterTile, findDockSpot, launchSettlers, launchWarFleet, navalReach } from '../src/civ/boats';
import { runKingdomAi } from '../src/civ/diplomacy';
import { BuildingType, FISH_MAX, Job, Resource, type Village } from '../src/civ/model';
import { SPECIES, Species } from '../src/entities/species';
import { ABOARD_FLAG } from '../src/entities/units';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';

const SIZE = 160;
/** Dos islas (izquierda y derecha) separadas por un brazo de mar, y un lago interior en la izquierda. */
const LEFT = { x0: 6, x1: 62 };
const RIGHT = { x0: 100, x1: 154 };
const ISLAND_Y = { y0: 10, y1: 150 };

function makeSim(): Simulation {
  const sim = new Simulation({ seedText: 'barcos', size: SIZE, capacity: 500, populate: false, blank: true });
  const w = sim.world;
  const land = TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight;
  const sea = TERRAIN_INFO[Terrain.OCEAN].paintHeight;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = w.idx(x, y);
      const onLeft = x >= LEFT.x0 && x <= LEFT.x1;
      const onRight = x >= RIGHT.x0 && x <= RIGHT.x1;
      const lake = x >= 14 && x <= 18 && y >= 100 && y <= 104;
      const isLand = (onLeft || onRight) && y >= ISLAND_Y.y0 && y <= ISLAND_Y.y1 && !lake;
      w.setHeight(i, isLand ? land : sea);
      w.setBiome(i, Biome.GRASS);
    }
  }
  w.computeRegions();
  return sim;
}

const ctxOf = (sim: Simulation): AiContext => (sim as unknown as { ctx: AiContext }).ctx;

function adults(sim: Simulation, n: number, x: number, y: number, species: number = Species.HUMAN): number[] {
  const def = SPECIES[species];
  return Array.from({ length: n }, (_, k) =>
    sim.units.spawn(species as 3, x + (k % 4), y + Math.floor(k / 4), { sex: k % 2, ageTicks: def.adultTicks + 100, generation: 0, thinkOffset: k, nameSeed: k * 31 }),
  );
}

function found(sim: Simulation, x: number, y: number, species: number = Species.HUMAN): Village {
  const ctx = ctxOf(sim);
  ctx.tick = sim.tick;
  const members = adults(sim, 4, x, y, species);
  sim.spatial.rebuild(sim.units);
  const v = sim.civ.foundVillage(species as 3, x, y, members, ctx);
  if (!v) throw new Error('no se pudo fundar');
  return v;
}

/** Aldea costera de la isla izquierda con un muelle terminado. */
function portVillage(sim: Simulation): Village {
  const v = found(sim, 54, 60);
  const spot = findDockSpot(sim.world, v);
  if (!spot) throw new Error('sin sitio para el muelle');
  const dock = sim.civ.placeBuilding(v, BuildingType.DOCK, spot.x, spot.y);
  dock.level = 1;
  dock.underConstruction = false;
  dock.growth = FISH_MAX;
  v.resources[Resource.WOOD] = 100;
  v.resources[Resource.FOOD] = 100;
  return v;
}

function step(sim: Simulation, ticks: number): void {
  for (let t = 0; t < ticks; t++) sim.step();
}

describe('mares y rutas marítimas', () => {
  it('etiqueta los mares y distingue un lago del océano', () => {
    const w = makeSim().world;
    const ocean = w.seaAt(80, 80);
    expect(ocean).toBeGreaterThan(0);
    expect(w.seaAt(2, 2)).toBe(ocean);
    const lake = w.seaAt(16, 102);
    expect(lake).toBeGreaterThan(0);
    expect(lake).not.toBe(ocean);
    expect(w.seaSizes[lake]).toBe(25);
    expect(w.seaSizes[ocean]).toBeGreaterThan(1000);
    expect(w.regionAt(30, 30)).not.toBe(w.regionAt(120, 30));
  });

  it('encuentra una ruta por agua entre las dos islas y cada tramo va por agua', () => {
    const w = makeSim().world;
    const from = w.idx(63, 60);
    const to = w.idx(99, 120);
    const route = findSeaRoute(w, from, to);
    expect(route).not.toBeNull();
    const pts = [from, ...(route ?? [])];
    expect(pts[pts.length - 1]).toBe(to);
    for (let k = 1; k < pts.length; k++) expect(waterLine(w, pts[k - 1], pts[k])).toBe(true);
  });

  it('no hay ruta entre el lago y el océano, ni desde tierra', () => {
    const w = makeSim().world;
    expect(findSeaRoute(w, w.idx(16, 102), w.idx(80, 80))).toBeNull();
    expect(findSeaRoute(w, w.idx(30, 30), w.idx(80, 80))).toBeNull();
  });

  it('pintar tierra en el mar marca las regiones para recalcular', () => {
    const w = makeSim().world;
    expect(w.regionsDirty).toBe(false);
    w.setHeight(w.idx(80, 80), TERRAIN_INFO[Terrain.MOUNTAIN].paintHeight);
    expect(w.regionsDirty).toBe(true);
  });
});

describe('muelles y pesca', () => {
  it('el muelle se coloca en la costa, dentro del territorio, junto al mar grande', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    const dock = sim.civ.buildings.find((b) => b.type === BuildingType.DOCK);
    expect(dock).toBeDefined();
    const water = dockWaterTile(sim.world, dock!);
    expect(water).toBeGreaterThanOrEqual(0);
    expect(sim.world.seaSizes[sim.world.sea[water]]).toBeGreaterThan(1000);
    expect(sim.world.ownerAt(dock!.x, dock!.y)).toBe(v.id);
  });

  it('una aldea del interior no tiene sitio para un muelle', () => {
    const sim = makeSim();
    const v = found(sim, 30, 40);
    expect(findDockSpot(sim.world, v)).toBeNull();
  });

  it('la aldea pone pescadores que traen pescado del muelle', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    adults(sim, 6, 50, 58).forEach((i) => sim.civ.joinVillage(i, v));
    v.resources[Resource.FOOD] = 0;
    const dock = sim.civ.buildings.find((b) => b.type === BuildingType.DOCK)!;
    let fished = false;
    for (let t = 0; t < 1500 && !fished; t++) {
      sim.step();
      if (dock.growth < FISH_MAX - 10) fished = true;
    }
    expect(v.jobCounts[Job.FISHER]).toBeGreaterThan(0);
    expect(fished).toBe(true);
  });

  it('el planificador construye un muelle en una aldea costera próspera', () => {
    const sim = makeSim();
    const v = found(sim, 54, 60);
    adults(sim, 10, 48, 56).forEach((i) => sim.civ.joinVillage(i, v));
    const hall = sim.civ.building(v.hallId)!;
    hall.level = 2;
    v.resources[Resource.WOOD] = 100;
    v.resources[Resource.STONE] = 50;
    v.resources[Resource.FOOD] = 200;
    step(sim, 700);
    expect(sim.civ.buildings.some((b) => b.alive && b.type === BuildingType.DOCK)).toBe(true);
  });
});

describe('barcos', () => {
  it('los colonos cruzan el mar y fundan una aldea del mismo reino en la otra isla', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    const group = adults(sim, 4, 50, 58);
    group.forEach((i) => sim.civ.joinVillage(i, v));
    const ctx = ctxOf(sim);
    ctx.tick = sim.tick;
    expect(launchSettlers(sim.civ, v, group, ctx)).toBe(true);
    const boat = sim.civ.boats[0];
    expect(boat.kind).toBe(BoatKind.SETTLERS);
    expect(v.resources[Resource.WOOD]).toBeLessThan(100);
    let sailed = false;
    for (let t = 0; t < 4000 && sim.civ.villages.length < 2; t++) {
      sim.step();
      if (boat.state === BoatState.SAILING) {
        sailed = true;
        // Durante la travesía, el pasaje va a bordo y fuera del mundo.
        for (const h of boat.passengers) expect(sim.units.status[sim.units.resolve(h)] & ABOARD_FLAG).toBe(ABOARD_FLAG);
      }
    }
    expect(sailed).toBe(true);
    expect(sim.civ.villages).toHaveLength(2);
    const colony = sim.civ.villages[1];
    expect(colony.kingdom).toBe(v.kingdom);
    expect(sim.world.regionAt(colony.cx, colony.cy)).not.toBe(sim.world.regionAt(v.cx, v.cy));
    // El barco vuelve a puerto y se desarma.
    step(sim, 2000);
    expect(boat.alive).toBe(false);
  });

  it('sin muelle no zarpa ningún barco', () => {
    const sim = makeSim();
    const v = found(sim, 54, 60);
    const group = adults(sim, 4, 50, 58);
    expect(launchSettlers(sim.civ, v, group, ctxOf(sim))).toBe(false);
    expect(sim.civ.boats).toHaveLength(0);
  });

  it('sin madera no zarpa ningún barco', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    v.resources[Resource.WOOD] = 0;
    const group = adults(sim, 4, 50, 58);
    expect(launchSettlers(sim.civ, v, group, ctxOf(sim))).toBe(false);
    expect(sim.civ.boats).toHaveLength(0);
  });

  it('en guerra, el ejército cruza el mar hacia la aldea enemiga de la otra isla', () => {
    const sim = makeSim();
    const a = portVillage(sim);
    const b = found(sim, 120, 60, Species.TUSKER);
    const warriors = adults(sim, 6, 48, 56);
    warriors.forEach((i) => {
      sim.civ.joinVillage(i, a);
      sim.units.job[i] = Job.WARRIOR;
    });
    const ks = sim.civ.kingdoms;
    ks.declareWar(a.kingdom, b.kingdom);
    const ctx = ctxOf(sim);
    ctx.tick = sim.tick;
    expect(navalReach(sim.civ, sim.world, a, b)).toBe(true);
    runKingdomAi(ks, ctx);
    expect(a.armyTarget).toBe(b.id);
    expect(launchWarFleet(sim.civ, a, ctx)).toBe(true);
    expect(sim.civ.boats[0].kind).toBe(BoatKind.WAR);
    const enemyIsland = sim.world.regionAt(b.cx, b.cy);
    let landed = 0;
    for (let t = 0; t < 4000 && landed === 0; t++) {
      sim.step();
      landed = warriors.filter((i) => sim.units.alive[i] && sim.world.regionAt(sim.units.x[i], sim.units.y[i]) === enemyIsland && (sim.units.status[i] & ABOARD_FLAG) === 0).length;
    }
    expect(landed).toBeGreaterThanOrEqual(2);
  });

  it('los soldados varados en la isla enemiga no se unen a la aldea enemiga', () => {
    const sim = makeSim();
    const a = found(sim, 30, 60);
    const b = found(sim, 120, 60);
    // La aldea enemiga tiene casas libres y está cerca: sin la regla, se unirían a ella.
    sim.civ.building(b.hallId)!.level = 2;
    sim.civ.kingdoms.declareWar(a.kingdom, b.kingdom);
    const stranded = adults(sim, 2, 114, 78);
    for (const i of stranded) sim.units.homeKingdom[i] = a.kingdom;
    step(sim, 200);
    for (const i of stranded) if (sim.units.alive[i]) expect(sim.units.village[i]).not.toBe(b.id);
  });

  it('los colonos o soldados varados fundan una aldea para su reino de origen', () => {
    const sim = makeSim();
    const a = found(sim, 30, 60);
    const b = found(sim, 120, 60);
    sim.civ.kingdoms.declareWar(a.kingdom, b.kingdom);
    const farAway = adults(sim, 4, 112, 125);
    for (const i of farAway) sim.units.homeKingdom[i] = a.kingdom;
    step(sim, 200);
    const colony = sim.civ.villages.find((v) => v.id !== a.id && v.id !== b.id);
    expect(colony?.kingdom).toBe(a.kingdom);
  });

  it('un desastre hunde el barco y el pasaje se ahoga', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    const group = adults(sim, 4, 50, 58);
    group.forEach((i) => sim.civ.joinVillage(i, v));
    const ctx = ctxOf(sim);
    ctx.tick = sim.tick;
    launchSettlers(sim.civ, v, group, ctx);
    const boat = sim.civ.boats[0];
    for (let t = 0; t < 2000 && boat.state !== BoatState.SAILING; t++) sim.step();
    step(sim, 60);
    const aboard = boat.passengers.length;
    expect(aboard).toBeGreaterThanOrEqual(2);
    const drownedBefore = sim.stats.deaths[DeathCause.DROWNED];
    sim.civ.destroyBuildingsIn(boat.x, boat.y, 2);
    sim.step();
    expect(boat.alive).toBe(false);
    expect(sim.stats.deaths[DeathCause.DROWNED] - drownedBefore).toBe(aboard);
    expect(sim.civ.chronicle.some((c) => c.type === 'shipwreck')).toBe(true);
  });

  it('una partida guardada en plena travesía continúa igual al cargarla', () => {
    const sim = makeSim();
    const v = portVillage(sim);
    const group = adults(sim, 4, 50, 58);
    group.forEach((i) => sim.civ.joinVillage(i, v));
    const ctx = ctxOf(sim);
    ctx.tick = sim.tick;
    launchSettlers(sim.civ, v, group, ctx);
    const boat = sim.civ.boats[0];
    for (let t = 0; t < 2000 && boat.state !== BoatState.SAILING; t++) sim.step();
    step(sim, 40);
    const loaded = deserialize(serialize(sim, describeSave(sim, 'x', 0)));
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.civ.boats[0].state).toBe(BoatState.SAILING);
    step(sim, 1500);
    step(loaded, 1500);
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.civ.villages.length).toBe(sim.civ.villages.length);
  });
});
