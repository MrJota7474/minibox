import { describe, expect, it } from 'vitest';
import type { AiContext } from '../src/ai/context';
import { GATHER_RADIUS, gatherAtFire } from '../src/civ/villager';
import { UnitState } from '../src/entities/units';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { DAY_TICKS, daylight, isNight } from '../src/world/daylight';
import { Species } from '../src/entities/species';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';
import { TERRAIN_INFO, Terrain } from '../src/world/terrain';

describe('día y noche', () => {
  it('de día hay luz plena y en plena noche ninguna', () => {
    expect(daylight(0)).toBe(1);
    expect(daylight(Math.round(DAY_TICKS * 0.3))).toBe(1);
    expect(daylight(Math.round(DAY_TICKS * 0.75))).toBe(0);
    expect(isNight(0)).toBe(false);
    expect(isNight(Math.round(DAY_TICKS * 0.75))).toBe(true);
  });

  it('anochece y amanece poco a poco, y el ciclo se repite', () => {
    const dusk = daylight(Math.round(DAY_TICKS * 0.6));
    const dawn = daylight(Math.round(DAY_TICKS * 0.95));
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
    for (let t = 0; t < DAY_TICKS; t += 7) expect(daylight(t + DAY_TICKS * 3)).toBe(daylight(t));
    // Todo el día está entre 0 y 1, y la luz no da saltos.
    for (let t = 1; t < DAY_TICKS; t++) {
      expect(daylight(t)).toBeGreaterThanOrEqual(0);
      expect(daylight(t)).toBeLessThanOrEqual(1);
      expect(Math.abs(daylight(t) - daylight(t - 1))).toBeLessThan(0.05);
    }
  });

  it('el ciclo se ve por defecto (se puede apagar en los ajustes)', () => {
    expect(DEFAULT_SETTINGS.dayNight).toBe(true);
  });
});

describe('la vida de noche', () => {
  it('cruza el anochecer igual tras guardar y cargar, y los aldeanos se reúnen junto a la hoguera', () => {
    const sim = new Simulation({ seedText: 'noche', size: 128, capacity: 600, populate: true });
    for (let y = 40; y < 90; y++) for (let x = 40; x < 90; x++) sim.world.setHeight(sim.world.idx(x, y), TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    sim.apply({ type: 'spawn', species: Species.HUMAN, x: 64, y: 64, size: 9 });
    // Hasta poco antes del anochecer.
    while (sim.tick < 900 || sim.tick % DAY_TICKS !== Math.round(DAY_TICKS * 0.5)) sim.step();
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Noche', 1)));
    // Hasta plena noche, con las dos partidas a la par.
    for (let t = 0; t < Math.round(DAY_TICKS * 0.3); t++) {
      sim.step();
      loaded.step();
    }
    expect(isNight(sim.tick)).toBe(true);
    expect(loaded.stateHash()).toBe(sim.stateHash());
    const v = sim.civ.villages.find((x) => x.alive);
    expect(v).toBeDefined();
    if (!v) return;
    const u = sim.units;
    // Los que descansan (sin tarea en marcha) lo hacen en el corro de la hoguera.
    let near = 0;
    let idle = 0;
    for (let i = 0; i < u.highWater; i++) {
      if (!u.alive[i] || u.village[i] !== v.id || u.state[i] !== 0) continue;
      idle++;
      if (Math.hypot(u.x[i] - v.cx - 0.5, u.y[i] - v.cy - 0.5) <= 4.5) near++;
    }
    expect(idle).toBeGreaterThan(0);
    expect(near / idle).toBeGreaterThan(0.5);
  });
});

describe('el corro de la hoguera', () => {
  function village(): { sim: Simulation; ctx: AiContext; i: number; cx: number; cy: number } {
    const sim = new Simulation({ seedText: 'corro', size: 64, capacity: 200, populate: false });
    for (let k = 0; k < sim.world.size; k++) sim.world.setHeight(k, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    sim.apply({ type: 'spawn', species: Species.HUMAN, x: 20, y: 32, size: 9 });
    for (let t = 0; t < 150; t++) sim.step();
    const v = sim.civ.villages.find((x) => x.alive);
    if (!v) throw new Error('sin aldea');
    const ctx = (sim as unknown as { ctx: AiContext }).ctx;
    ctx.tick = Math.round(DAY_TICKS * 0.75);
    let i = 0;
    while (!sim.units.alive[i] || sim.units.village[i] !== v.id) i++;
    return { sim, ctx, i, cx: v.cx, cy: v.cy };
  }

  it('de noche, quien está lejos elige un hueco pisable dentro del radio de la hoguera', () => {
    const { sim, ctx, i, cx, cy } = village();
    const u = sim.units;
    const v = sim.civ.villages.find((x) => x.alive);
    if (!v) return;
    for (let k = 0; k < 40; k++) {
      u.x[i] = cx + 9.5;
      u.y[i] = cy + 0.5;
      u.state[i] = UnitState.IDLE;
      gatherAtFire(ctx, i, v);
      expect(u.state[i]).toBe(UnitState.WANDER);
      expect(Math.hypot(u.tx[i] - cx - 0.5, u.ty[i] - cy - 0.5)).toBeLessThanOrEqual(GATHER_RADIUS);
      expect(sim.world.isWalkableAt(u.tx[i], u.ty[i])).toBe(true);
    }
  });

  it('desde la otra orilla no elige un hueco del corro al que no puede llegar', () => {
    const { sim, ctx, i, cx, cy } = village();
    const w = sim.world;
    // Un canal de agua de arriba abajo separa al aldeano de su aldea.
    for (let y = 0; y < w.height; y++) for (const x of [cx + 8, cx + 9]) w.setHeight(w.idx(x, y), TERRAIN_INFO[Terrain.SHALLOW].paintHeight);
    w.computeRegions();
    const u = sim.units;
    const v = sim.civ.villages.find((x) => x.alive);
    if (!v) return;
    for (let k = 0; k < 40; k++) {
      u.x[i] = cx + 14.5;
      u.y[i] = cy + 0.5;
      u.state[i] = UnitState.IDLE;
      gatherAtFire(ctx, i, v);
      // Sin hueco alcanzable, vuelve hacia el centro de la aldea (como cualquier paseo largo).
      expect(u.tx[i]).toBe(cx + 0.5);
      expect(u.ty[i]).toBe(cy + 0.5);
    }
  });
});
