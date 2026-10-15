import { describe, expect, it } from 'vitest';
import { moveToward } from '../src/ai/movement';
import { personName, villageName } from '../src/civ/names';
import { RACE_IDS, SPECIES, Species, isCivilized } from '../src/entities/species';
import { Sex, UnitStore } from '../src/entities/units';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { infect } from '../src/powers/status';
import { Simulation } from '../src/sim/simulation';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

describe('especies', () => {
  it('cada especie está en la posición de su número (las partidas guardan el número)', () => {
    SPECIES.forEach((s, k) => expect(s.id).toBe(k));
  });
});

describe('escamados', () => {
  const def = SPECIES[Species.SCALEFOLK];

  it('son una raza civilizada más, con su rasgo', () => {
    expect(isCivilized(Species.SCALEFOLK)).toBe(true);
    expect(RACE_IDS).toContain(Species.SCALEFOLK);
    expect(def.race?.trait).toMatch(/pantanos/);
    // Pescan mejor de lo que recolectan.
    expect(def.race?.fish ?? 0).toBeGreaterThan(def.race?.gather ?? 0);
  });

  it('no enferman de plaga', () => {
    const u = new UnitStore(4);
    const s = u.spawn(Species.SCALEFOLK, 5, 5, { sex: Sex.MALE, ageTicks: def.adultTicks, generation: 0, thinkOffset: 0 });
    const h = u.spawn(Species.HUMAN, 6, 5, { sex: Sex.MALE, ageTicks: SPECIES[Species.HUMAN].adultTicks, generation: 0, thinkOffset: 0 });
    expect(infect(u, s)).toBe(false);
    expect(infect(u, h)).toBe(true);
  });

  it('el barro del pantano no los frena; a un humano sí', () => {
    const w = new World(32, 32);
    for (let i = 0; i < w.size; i++) {
      w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
      w.setBiome(i, Biome.SWAMP);
    }
    const u = new UnitStore(4);
    const s = u.spawn(Species.SCALEFOLK, 5.5, 5.5, { sex: 0, ageTicks: def.adultTicks, generation: 0, thinkOffset: 0 });
    const h = u.spawn(Species.HUMAN, 5.5, 10.5, { sex: 0, ageTicks: SPECIES[Species.HUMAN].adultTicks, generation: 0, thinkOffset: 0 });
    moveToward(w, u, s, 20.5, 5.5, 0.1);
    moveToward(w, u, h, 20.5, 10.5, 0.1);
    expect(u.x[s] - 5.5).toBeCloseTo(0.1, 5);
    expect(u.x[h] - 5.5).toBeLessThan(0.09);
  });

  it('tienen nombres propios', () => {
    const name = personName(Species.SCALEFOLK, 42);
    expect(name.length).toBeGreaterThan(2);
    expect(villageName(Species.SCALEFOLK, 7)).not.toBe(villageName(Species.HUMAN, 7));
  });

  it('fundan aldeas que se guardan y continúan exactamente igual', () => {
    const sim = new Simulation({ seedText: 'escamados', size: 128, capacity: 600, populate: false });
    // Una tierra llana para que la aldea se funde seguro.
    for (let y = 50; y < 80; y++) for (let x = 50; x < 80; x++) sim.world.setHeight(sim.world.idx(x, y), TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    sim.apply({ type: 'spawn', species: Species.SCALEFOLK, x: 64, y: 64, size: 9 });
    for (let t = 0; t < 900; t++) sim.step();
    expect(sim.civ.villages.some((v) => v.alive && v.race === Species.SCALEFOLK)).toBe(true);
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Escamados', 1)));
    for (let t = 0; t < 300; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });
});
