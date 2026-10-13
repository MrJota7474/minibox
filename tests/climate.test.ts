import { describe, expect, it } from 'vitest';
import { DeathCause, type AiContext } from '../src/ai/context';
import { moveToward } from '../src/ai/movement';
import { Rng } from '../src/core/rng';
import { TICKS_PER_YEAR } from '../src/core/time';
import { SPECIES, Species } from '../src/entities/species';
import { applyBrush } from '../src/powers/brush';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';
import { Climate, ERA_INFO, ERA_TICKS, Era, SEASON_TICKS, Season, eraAt, neutralClimate } from '../src/world/climate';
import { generateWorld } from '../src/world/generator';
import { BIOME_INFO, Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { VegetationSystem } from '../src/world/vegetation';
import { World } from '../src/world/world';

const SIZE = 64;

/** Mundo llano de tierra baja con un bioma (por defecto, pradera). */
function flatSim(biome: number = Biome.GRASS): Simulation {
  const sim = new Simulation({ seedText: 'clima', size: SIZE, capacity: 200, populate: false, blank: true });
  const w = sim.world;
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, biome as 0);
    w.setGrass(i, 100);
  }
  w.computeRegions();
  return sim;
}

const ctxOf = (sim: Simulation): AiContext => (sim as unknown as { ctx: AiContext }).ctx;
const opts = { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 };

function countBiome(w: World, biome: number): number {
  let n = 0;
  for (let i = 0; i < w.size; i++) if (w.biome[i] === biome) n++;
  return n;
}

describe('biomas', () => {
  it('el generador crea los biomas naturales nuevos y nunca los mágicos', () => {
    const seen = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = generateWorld(seed, 192, 192);
      for (let i = 0; i < w.size; i++) if (TERRAIN_INFO[w.terrain[i]].fertile) seen.add(w.biome[i]);
    }
    for (const b of [Biome.GRASS, Biome.FOREST, Biome.SNOW, Biome.SWAMP, Biome.JUNGLE, Biome.SAVANNA]) expect(seen.has(b)).toBe(true);
    expect(seen.has(Biome.GROVE)).toBe(false);
    expect(seen.has(Biome.BLIGHT)).toBe(false);
  });

  it('cada bioma tiene nombre, descripción y valores coherentes', () => {
    expect(BIOME_INFO).toHaveLength(9);
    for (const b of BIOME_INFO) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.speed).toBeGreaterThan(0);
      expect(b.grassMax).toBeGreaterThanOrEqual(0);
    }
  });

  it('los pinceles pintan los biomas nuevos (pero no sobre el agua)', () => {
    const sim = flatSim();
    const w = sim.world;
    w.setHeight(w.idx(40, 40), TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    const rng = new Rng(1);
    applyBrush(w, rng, 'snow', 10, 10, 3);
    applyBrush(w, rng, 'blight', 40, 40, 3);
    expect(w.biome[w.idx(10, 10)]).toBe(Biome.SNOW);
    expect(w.biome[w.idx(41, 40)]).toBe(Biome.BLIGHT);
    expect(w.biome[w.idx(40, 40)]).not.toBe(Biome.BLIGHT);
    expect(w.grass[w.idx(41, 40)]).toBeLessThanOrEqual(BIOME_INFO[Biome.BLIGHT].grassMax);
  });

  it('en el pantano se camina más despacio que en la pradera', () => {
    const run = (biome: number): number => {
      const sim = flatSim(biome);
      const i = sim.units.spawn(Species.SHEEP, 10.5, 10.5, opts);
      for (let k = 0; k < 20; k++) moveToward(sim.world, sim.units, i, 50.5, 10.5, 0.1);
      return sim.units.x[i] - 10.5;
    };
    expect(run(Biome.SWAMP)).toBeCloseTo(run(Biome.GRASS) * BIOME_INFO[Biome.SWAMP].speed, 3);
  });

  it('en la tundra se pasa más hambre que en la pradera', () => {
    const lost = (biome: number): number => {
      const sim = flatSim(biome);
      sim.laws.seasons = false;
      const i = sim.units.spawn(Species.WOLF, 20.5, 20.5, opts);
      const start = sim.units.hunger[i];
      for (let t = 0; t < 200; t++) sim.step();
      return start - sim.units.hunger[i];
    };
    expect(lost(Biome.SNOW)).toBeGreaterThan(lost(Biome.GRASS));
  });

  it('la arboleda mágica cura y el yermo maldito hiere hasta matar', () => {
    const grove = flatSim(Biome.GROVE);
    const healed = grove.units.spawn(Species.WOLF, 20.5, 20.5, opts);
    grove.units.hp[healed] = 5;
    for (let t = 0; t < 130; t++) grove.step();
    expect(grove.units.hp[healed]).toBeGreaterThan(5);

    const blight = flatSim(Biome.BLIGHT);
    blight.laws.hunger = false;
    const hurt = blight.units.spawn(Species.RABBIT, 20.5, 20.5, opts);
    for (let t = 0; t < 3000 && blight.units.alive[hurt]; t++) blight.step();
    expect(blight.units.alive[hurt]).toBe(0);
    expect(blight.stats.deaths[DeathCause.DISASTER]).toBeGreaterThan(0);
  });

  it('el yermo maldito marchita las plantas y se extiende', () => {
    const sim = flatSim();
    const w = sim.world;
    for (let y = 28; y < 36; y++) for (let x = 28; x < 36; x++) w.setBiome(w.idx(x, y), Biome.BLIGHT);
    w.setFlora(w.idx(30, 30), Flora.TREE);
    const before = countBiome(w, Biome.BLIGHT);
    for (let t = 0; t < 3000; t++) sim.step();
    expect(w.flora[w.idx(30, 30)]).toBe(Flora.NONE);
    expect(countBiome(w, Biome.BLIGHT)).toBeGreaterThan(before);
  });

  it('con la ley desactivada los biomas mágicos no se extienden', () => {
    const sim = flatSim();
    sim.laws.magicSpread = false;
    for (let y = 28; y < 36; y++) for (let x = 28; x < 36; x++) sim.world.setBiome(sim.world.idx(x, y), Biome.GROVE);
    for (let t = 0; t < 3000; t++) sim.step();
    expect(countBiome(sim.world, Biome.GROVE)).toBe(64);
  });
});

describe('estaciones', () => {
  it('el año pasa por primavera, verano, otoño e invierno', () => {
    const c = new Climate(1);
    expect([0, 1, 2, 3].map((k) => c.seasonAt(k * SEASON_TICKS + 5, true))).toEqual([Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER]);
    expect(c.seasonAt(4 * SEASON_TICKS + 5, true)).toBe(Season.SPRING);
    expect(c.seasonAt(3 * SEASON_TICKS + 5, false)).toBe(Season.SUMMER);
  });

  it('en la era glacial el otoño ya es invierno', () => {
    const c = new Climate(1);
    c.setEra(Era.FROST);
    expect(c.seasonAt(2 * SEASON_TICKS + 5, true)).toBe(Season.WINTER);
  });

  it('en invierno la hierba apenas vuelve a crecer y en primavera crece más', () => {
    const regrow = (season: number): number => {
      const sim = flatSim();
      const w = sim.world;
      for (let i = 0; i < w.size; i++) w.setGrass(i, 0);
      const veg = new VegetationSystem(w);
      const mods = new Climate(1).mods(season * SEASON_TICKS + 5, true);
      for (let t = 0; t < 50; t++) veg.step(new Rng(t), mods);
      return w.grass[w.idx(20, 20)];
    };
    expect(regrow(Season.WINTER)).toBeLessThan(regrow(Season.SUMMER));
    expect(regrow(Season.SPRING)).toBeGreaterThan(regrow(Season.SUMMER));
  });

  it('cada estación dura 5 años por defecto y se puede cambiar', () => {
    const sim = flatSim();
    expect(sim.climate.seasonTicks).toBe(5 * TICKS_PER_YEAR);
    expect(sim.climate.seasonAt(4 * TICKS_PER_YEAR, true)).toBe(Season.SPRING);
    expect(sim.climate.seasonAt(5 * TICKS_PER_YEAR, true)).toBe(Season.SUMMER);
    sim.apply({ type: 'seasonLength', ticks: TICKS_PER_YEAR });
    // En el tick 0 era primavera: sigue siéndolo y dura ahora 1 año.
    expect(sim.climate.seasonAt(sim.tick, true)).toBe(Season.SPRING);
    expect(sim.climate.seasonAt(sim.tick + TICKS_PER_YEAR + 5, true)).toBe(Season.SUMMER);
    sim.apply({ type: 'seasonLength', ticks: 123 });
    expect(sim.climate.seasonTicks).toBe(TICKS_PER_YEAR);
    const loaded = deserialize(serialize(sim, describeSave(sim, 'x', 0)));
    expect(loaded.climate.seasonTicks).toBe(TICKS_PER_YEAR);
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });

  it('cambiar la duración a mitad de estación conserva la estación en curso', () => {
    const sim = flatSim();
    sim.tick = 3 * SEASON_TICKS + 1234;
    expect(sim.climate.seasonAt(sim.tick, true)).toBe(Season.WINTER);
    sim.apply({ type: 'seasonLength', ticks: TICKS_PER_YEAR / 4 });
    expect(sim.climate.seasonAt(sim.tick, true)).toBe(Season.WINTER);
    expect(sim.climate.seasonAt(sim.tick + TICKS_PER_YEAR / 4, true)).toBe(Season.SPRING);
    const loaded = deserialize(serialize(sim, describeSave(sim, 'x', 0)));
    expect(loaded.climate.seasonAt(loaded.tick, true)).toBe(Season.WINTER);
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });

  it('en invierno las granjas crecen mucho menos que en verano', () => {
    const growth = (season: number): number => {
      const sim = flatSim();
      const ctx = ctxOf(sim);
      const adult = { ...opts, ageTicks: SPECIES[Species.HUMAN].adultTicks + 10 };
      const members = [0, 1, 2, 3].map((k) => sim.units.spawn(Species.HUMAN, 30 + k, 30, { ...adult, sex: k % 2 }));
      sim.spatial.rebuild(sim.units);
      const v = sim.civ.foundVillage(Species.HUMAN, 30, 30, members, ctx);
      if (!v) throw new Error('sin aldea');
      // Sin aldeanos: nadie la cuida y sólo crece sola.
      for (const i of members) sim.units.kill(i);
      const farm = sim.civ.placeBuilding(v, 3, 40, 40);
      farm.level = 1;
      farm.underConstruction = false;
      sim.tick = season * SEASON_TICKS;
      for (let t = 0; t < 100; t++) sim.step();
      return farm.growth;
    };
    expect(growth(Season.WINTER)).toBeLessThan(growth(Season.SUMMER));
    expect(growth(Season.SUMMER)).toBeGreaterThan(0);
  });
});

describe('eras', () => {
  it('la primera era es templada, son deterministas y nunca se repiten seguidas', () => {
    expect(eraAt(42, 0)).toBe(Era.TEMPERATE);
    for (let k = 1; k < 30; k++) {
      expect(eraAt(42, k)).toBe(eraAt(42, k));
      expect(eraAt(42, k)).not.toBe(eraAt(42, k - 1));
      expect(eraAt(42, k)).toBeLessThan(ERA_INFO.length);
    }
  });

  it('al pasar ERA_TICKS empieza una era nueva y queda en la crónica', () => {
    const sim = flatSim();
    sim.tick = ERA_TICKS - 1;
    sim.step();
    sim.step();
    expect(sim.climate.eraIndex).toBe(1);
    expect(sim.climate.era).toBe(eraAt(sim.seed, 1));
    expect(sim.civ.chronicle.some((c) => c.type === 'era')).toBe(true);
  });

  it('el jugador puede imponer una era; cambia el clima y el hash', () => {
    const sim = flatSim();
    const h = sim.stateHash();
    sim.apply({ type: 'era', era: Era.PLENTY });
    expect(sim.climate.era).toBe(Era.PLENTY);
    expect(sim.stateHash()).not.toBe(h);
    expect(sim.climate.mods(SEASON_TICKS + 5, true).grass).toBeGreaterThan(neutralClimate().grass);
    sim.apply({ type: 'era', era: 99 });
    expect(sim.climate.era).toBe(Era.PLENTY);
  });

  it('la era de hierro facilita la guerra y la de concordia la dificulta', () => {
    const c = new Climate(1);
    c.setEra(Era.IRON);
    expect(c.mods(5, true).war).toBeGreaterThan(0);
    c.setEra(Era.CONCORD);
    expect(c.mods(5, true).war).toBeLessThan(0);
  });
});

describe('guardado del clima', () => {
  it('la era viaja en la partida y la continuación es idéntica', () => {
    const sim = flatSim();
    sim.apply({ type: 'era', era: Era.ARCANE });
    sim.apply({ type: 'brush', tool: 'grove', x: 20, y: 20, size: 5 });
    for (let t = 0; t < 400; t++) sim.step();
    const loaded = deserialize(serialize(sim, describeSave(sim, 'x', 0)));
    expect(loaded.climate.era).toBe(Era.ARCANE);
    expect(loaded.stateHash()).toBe(sim.stateHash());
    for (let t = 0; t < 800; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });

  it('una partida de la versión 2 (sin eras ni leyes nuevas) se migra', () => {
    const sim = flatSim();
    sim.tick = ERA_TICKS + 50;
    const bytes = serialize(sim, describeSave(sim, 'x', 0));
    const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
    const h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len))) as Record<string, unknown> & { laws: Record<string, boolean> };
    h.version = 2;
    // Sin los arrays de caminos (versión 6) ni de clanes (versión 5); el mundo de prueba no tiene aldeas ni reinos.
    (h.views as number[]).splice(-2, 2);
    delete h.climate;
    delete h.laws.seasons;
    delete h.laws.magicSpread;
    const json = new TextEncoder().encode(JSON.stringify(h));
    const align = (n: number): number => Math.ceil(n / 8) * 8;
    const rest = bytes.subarray(align(8 + len));
    const out = new Uint8Array(align(8 + json.length) + rest.length);
    out.set(bytes.subarray(0, 4));
    new DataView(out.buffer).setUint32(4, json.length, true);
    out.set(json, 8);
    out.set(rest, align(8 + json.length));
    const loaded = deserialize(out);
    expect(loaded.laws.seasons).toBe(true);
    expect(loaded.laws.magicSpread).toBe(true);
    expect(loaded.climate.eraIndex).toBe(1);
    expect(loaded.climate.era).toBe(eraAt(loaded.seed, 1));
  });
});
