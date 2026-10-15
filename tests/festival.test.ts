import { describe, expect, it } from 'vitest';
import type { AiContext } from '../src/ai/context';
import { moodFor, styleFor } from '../src/audio/music-theory';
import { NIGHT_LEN, festivalStartFor, inFestival } from '../src/civ/festival';
import { Resource } from '../src/civ/model';
import { SPECIES, Species } from '../src/entities/species';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';
import { Season } from '../src/world/climate';
import { DAY_TICKS, isNight } from '../src/world/daylight';
import { TERRAIN_INFO, Terrain } from '../src/world/terrain';

const SEASON = 3000;

function villageSim(seed: string): Simulation {
  const sim = new Simulation({ seedText: seed, size: 96, capacity: 400, populate: false });
  for (let k = 0; k < sim.world.size; k++) sim.world.setHeight(k, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
  sim.apply({ type: 'spawn', species: Species.HUMAN, x: 48, y: 48, size: 9 });
  for (let t = 0; t < 200; t++) sim.step();
  return sim;
}

const ctxOf = (sim: Simulation): AiContext => (sim as unknown as { ctx: AiContext }).ctx;

describe('cuándo hay fiesta', () => {
  it('la primera noche de cada estación, entera, y sólo esa', () => {
    expect(festivalStartFor(100, SEASON, 0)).toBe(-1);
    const start = festivalStartFor(SEASON + 10, SEASON, 0);
    expect(start).toBeGreaterThanOrEqual(SEASON);
    expect(isNight(start)).toBe(true);
    expect(isNight(start - 1)).toBe(false);
    expect(inFestival(start, SEASON, 0)).toBe(true);
    expect(inFestival(start + NIGHT_LEN - 1, SEASON, 0)).toBe(true);
    expect(inFestival(start + NIGHT_LEN, SEASON, 0)).toBe(false);
    // La noche siguiente ya no es de fiesta.
    expect(inFestival(start + DAY_TICKS, SEASON, 0)).toBe(false);
    // Antes del primer cambio de estación no hay fiestas.
    expect(inFestival(start - SEASON, SEASON, 0)).toBe(false);
  });

  it('con estaciones más cortas que un día, cada fiesta cae dentro de su estación (las que no caben se saltan)', () => {
    const short = 150;
    let count = 0;
    for (let t = 0; t < 3600; t++) {
      if (festivalStartFor(t, short, 0) !== t) continue;
      count++;
      const boundary = Math.floor(t / short) * short;
      expect(t - boundary).toBeLessThan(short);
      expect(isNight(t)).toBe(true);
    }
    expect(count).toBeGreaterThan(3);
  });
});

describe('el banquete', () => {
  it('las aldeas con comida de sobra lo celebran: gastan comida, quedan saciadas y la crónica lo cuenta', () => {
    const sim = villageSim('fiesta');
    const v = sim.civ.villages.find((x) => x.alive);
    expect(v).toBeDefined();
    if (!v) return;
    v.resources[Resource.FOOD] = v.population * 5;
    const food = v.resources[Resource.FOOD];
    const u = sim.units;
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] && u.village[i] === v.id) u.hunger[i] = 10;
    expect(sim.civ.celebrate(ctxOf(sim), 'se recibe la primavera', sim.civ.tick + 50)).toBe(1);
    expect(v.resources[Resource.FOOD]).toBe(food - v.population);
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] && u.village[i] === v.id) expect(u.hunger[i]).toBe(SPECIES[u.species[i]].maxHunger);
    expect(sim.civ.isFestive(v.id)).toBe(true);
    expect(sim.civ.anyFestive()).toBe(true);
    expect(sim.civ.chronicle.at(-1)?.type).toBe('festival');
    expect(sim.civ.chronicle.at(-1)?.text).toContain(v.name);
  });

  it('sin comida de sobra no hay fiesta', () => {
    const sim = villageSim('fiesta-pobre');
    const v = sim.civ.villages.find((x) => x.alive);
    if (!v) throw new Error('sin aldea');
    v.resources[Resource.FOOD] = v.population;
    expect(sim.civ.celebrate(ctxOf(sim), 'se celebra la cosecha', sim.civ.tick + 50)).toBe(0);
    expect(sim.civ.isFestive(v.id)).toBe(false);
  });

  it('con estaciones cortas llega la fiesta sola y la partida sigue igual tras guardar y cargar', () => {
    const sim = villageSim('fiesta-corta');
    sim.apply({ type: 'seasonLength', ticks: 150 });
    const v = sim.civ.villages.find((x) => x.alive);
    if (!v) throw new Error('sin aldea');
    v.resources[Resource.FOOD] = v.population * 8;
    const before = sim.civ.chronicle.filter((e) => e.type === 'festival').length;
    let saved: Simulation | null = null;
    for (let t = 0; t < 2 * DAY_TICKS; t++) {
      sim.step();
      if (t === 10) saved = deserialize(serialize(sim, describeSave(sim, 'Fiesta', 1)));
      else saved?.step();
    }
    expect(sim.civ.chronicle.filter((e) => e.type === 'festival').length).toBeGreaterThan(before);
    expect(saved?.stateHash()).toBe(sim.stateHash());
  });
});

describe('música de fiesta', () => {
  it('suena en las fiestas salvo si hay guerra, con tambor y pandero', () => {
    expect(moodFor({ wars: 0, monsters: 0, season: Season.WINTER, festival: true })).toBe('festival');
    expect(moodFor({ wars: 1, monsters: 0, season: Season.SUMMER, festival: true })).toBe('tension');
    const style = styleFor('festival', null);
    expect(style.drums).toBe(true);
    expect(style.handDrum).toBe(true);
    // Los dunarios la tocan en hijaz.
    expect(styleFor('festival', Species.DUNEFOLK).scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
  });
});
