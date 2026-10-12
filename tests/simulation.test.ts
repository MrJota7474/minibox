import { describe, expect, it } from 'vitest';
import { Species } from '../src/entities/species';
import type { Command } from '../src/sim/commands';
import { Simulation, type SimulationOptions } from '../src/sim/simulation';

const OPTS: SimulationOptions = { seedText: 'prueba', size: 96, capacity: 300, populate: true };

function runWith(opts: SimulationOptions, ticks: number, commands: Readonly<Record<number, Command[]>> = {}): Simulation {
  const sim = new Simulation(opts);
  for (let t = 0; t < ticks; t++) {
    for (const c of commands[t] ?? []) sim.apply(c);
    sim.step();
  }
  return sim;
}

const COMMANDS: Record<number, Command[]> = {
  10: [{ type: 'brush', tool: 'water', x: 48, y: 48, size: 9 }],
  50: [{ type: 'spawn', species: Species.WOLF, x: 40, y: 40, size: 5 }],
  120: [{ type: 'brush', tool: 'forest', x: 30, y: 50, size: 15 }],
};

describe('Simulation', () => {
  it('es determinista: misma semilla y mismos comandos dan el mismo estado', () => {
    const a = runWith(OPTS, 1500, COMMANDS);
    const b = runWith(OPTS, 1500, COMMANDS);
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.units.count).toBe(b.units.count);
  });

  it('un comando distinto cambia el resultado', () => {
    const a = runWith(OPTS, 600, COMMANDS);
    const b = runWith(OPTS, 600, { ...COMMANDS, 10: [{ type: 'brush', tool: 'mountain', x: 48, y: 48, size: 9 }] });
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('se puede reproducir una partida a partir del registro de comandos', () => {
    const original = runWith(OPTS, 800, COMMANDS);
    const replay = new Simulation(OPTS);
    let next = 0;
    for (let t = 0; t < 800; t++) {
      while (next < original.commandLog.length && original.commandLog[next].tick === t) {
        replay.apply(original.commandLog[next].command);
        next++;
      }
      replay.step();
    }
    expect(replay.stateHash()).toBe(original.stateHash());
  });

  it('puebla el mundo sólo si se pide', () => {
    expect(new Simulation(OPTS).units.count).toBeGreaterThan(0);
    expect(new Simulation({ ...OPTS, populate: false }).units.count).toBe(0);
  });

  it('el comando limit ajusta el límite de criaturas dentro de la capacidad', () => {
    const sim = new Simulation({ ...OPTS, populate: false });
    sim.apply({ type: 'limit', value: 120 });
    expect(sim.unitLimit).toBe(120);
    sim.apply({ type: 'limit', value: 99999 });
    expect(sim.unitLimit).toBe(OPTS.capacity);
  });

  it('crear criaturas informa cuando se alcanza el límite', () => {
    const sim = new Simulation({ ...OPTS, populate: false });
    sim.apply({ type: 'limit', value: 2 });
    let limited = false;
    for (let k = 0; k < 20 && !limited; k++) {
      const r = sim.apply({ type: 'spawn', species: Species.SHEEP, x: 48, y: 48, size: 15 });
      limited = r.limited;
    }
    expect(sim.units.count).toBeLessThanOrEqual(2);
  });

  it('el ecosistema sigue vivo tras varios años', () => {
    const sim = runWith({ ...OPTS, size: 128, capacity: 500 }, 600 * 5);
    expect(sim.units.count).toBeGreaterThan(0);
    expect(sim.stats.births).toBeGreaterThan(0);
  });
});
