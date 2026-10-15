import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';
import { makeOasis, placeOases } from '../src/world/oasis';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

function desert(size: number): World {
  const w = new World(size, size);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.DESERT);
  }
  return w;
}

function count(w: World, test: (i: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < w.size; i++) if (test(i)) n++;
  return n;
}

describe('oasis', () => {
  it('brota una charca con pradera, palmeras y sabana alrededor', () => {
    const w = desert(40);
    const water = makeOasis(w, 20, 20, 6, new Rng(4));
    expect(water).toBeGreaterThan(4);
    expect(w.isWaterIdx(w.idx(20, 20))).toBe(true);
    expect(count(w, (i) => w.biome[i] === Biome.GRASS)).toBeGreaterThan(10);
    expect(count(w, (i) => w.biome[i] === Biome.SAVANNA)).toBeGreaterThan(10);
    expect(count(w, (i) => w.flora[i] === Flora.TREE)).toBeGreaterThan(2);
    // Fuera del radio, el desierto sigue igual.
    expect(w.biome[w.idx(2, 2)]).toBe(Biome.DESERT);
  });

  it('en arena o roca no hay hierba ni charca: sólo verdea la tierra fértil', () => {
    const w = desert(40);
    const sand = w.idx(20, 23);
    const rock = w.idx(20, 20);
    w.setHeight(sand, TERRAIN_INFO[Terrain.SAND].paintHeight);
    w.setHeight(rock, TERRAIN_INFO[Terrain.MOUNTAIN].paintHeight);
    makeOasis(w, 20.5, 20.5, 6, new Rng(4));
    expect(w.isWaterIdx(rock)).toBe(false);
    expect(w.grass[sand]).toBe(0);
    expect(w.biome[sand]).toBe(Biome.DESERT);
  });

  it('no pisa edificios ni agua que ya hubiera', () => {
    const w = desert(40);
    w.buildingAt[w.idx(20, 20)] = 1;
    expect(makeOasis(w, 20, 20, 6, new Rng(4))).toBeGreaterThan(0);
    expect(w.isWaterIdx(w.idx(20, 20))).toBe(false);
    // En pleno mar no hay oasis.
    const sea = new World(20, 20);
    for (let i = 0; i < sea.size; i++) sea.setHeight(i, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    expect(makeOasis(sea, 10, 10, 5, new Rng(1))).toBe(0);
  });

  it('el mapa nace con oasis separados en los desiertos grandes, y siempre igual para la misma semilla', () => {
    const a = desert(128);
    const b = desert(128);
    const placed = placeOases(a, new Rng(9));
    placeOases(b, new Rng(9));
    expect(placed).toBeGreaterThan(0);
    expect(Array.from(a.heightMap)).toEqual(Array.from(b.heightMap));
    // En un mapa sin desierto no aparece ninguno.
    const green = new World(64, 64);
    for (let i = 0; i < green.size; i++) green.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    expect(placeOases(green, new Rng(9))).toBe(0);
  });

  it('el poder Oasis crea agua donde se lanza y la partida sigue igual tras guardar y cargar', () => {
    const sim = new Simulation({ seedText: 'oasis', size: 64, capacity: 200, populate: false });
    for (let i = 0; i < sim.world.size; i++) {
      sim.world.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
      sim.world.setBiome(i, Biome.DESERT);
    }
    sim.apply({ type: 'power', power: 'oasis', x: 32, y: 32, size: 3 });
    expect(sim.world.isWaterIdx(sim.world.idx(32, 32))).toBe(true);
    for (let t = 0; t < 20; t++) sim.step();
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Oasis', 1)));
    for (let t = 0; t < 100; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });
});
