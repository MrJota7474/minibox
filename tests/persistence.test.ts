import { describe, expect, it } from 'vitest';
import { Species } from '../src/entities/species';
import { SAVE_VERSION, decodeSave, describe as describeSave, deserialize, encodeSave, readMeta, serialize, unpackSave } from '../src/persistence/snapshot';
import { Simulation } from '../src/sim/simulation';

/** Un mundo con reinos en guerra, fuego, lava y plaga activos. */
function busyWorld(): Simulation {
  const sim = new Simulation({ seedText: 'guardado', size: 128, capacity: 400, populate: true });
  sim.apply({ type: 'spawn', species: Species.HUMAN, x: 50, y: 64, size: 9 });
  sim.apply({ type: 'spawn', species: Species.TUSKER, x: 80, y: 64, size: 9 });
  for (let t = 0; t < 150; t++) sim.step();
  sim.apply({ type: 'diplomacy', action: 'war', a: 0, b: 1 });
  sim.apply({ type: 'law', law: 'rebellions', value: false });
  for (let t = 0; t < 600; t++) sim.step();
  sim.apply({ type: 'power', power: 'fire', x: 56, y: 60, size: 5 });
  sim.apply({ type: 'power', power: 'lava', x: 84, y: 68, size: 3 });
  sim.apply({ type: 'power', power: 'plague', x: 50, y: 64, size: 7 });
  sim.apply({ type: 'power', power: 'tornado', x: 64, y: 40, size: 5 });
  for (let t = 0; t < 7; t++) sim.step();
  return sim;
}

const meta = (sim: Simulation) => describeSave(sim, 'Prueba', 1234);

describe('partidas guardadas', () => {
  it('cargar reproduce exactamente el estado (mismo hash)', () => {
    const sim = busyWorld();
    // El escenario de prueba tiene de todo en marcha.
    expect(sim.civ.villages.length).toBeGreaterThanOrEqual(2);
    expect(sim.civ.kingdoms.wars.some((w) => w.active)).toBe(true);
    expect(sim.hazards.burningCount + sim.hazards.lavaCount).toBeGreaterThan(0);
    expect(sim.powers.effects.length).toBeGreaterThan(0);
    expect(sim.units.plague.some((p) => p > 0)).toBe(true);
    const loaded = deserialize(serialize(sim, meta(sim)));
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.units.count).toBe(sim.units.count);
    expect(loaded.civ.villages.length).toBe(sim.civ.villages.length);
    expect(loaded.laws.rebellions).toBe(false);
  });

  it('la partida cargada continúa igual que la original', () => {
    const sim = busyWorld();
    const loaded = deserialize(serialize(sim, meta(sim)));
    for (let t = 0; t < 1500; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.civ.chronicle.length).toBe(sim.civ.chronicle.length);
  });

  it('los comandos tras cargar dan el mismo resultado', () => {
    const sim = busyWorld();
    const loaded = deserialize(serialize(sim, meta(sim)));
    for (const s of [sim, loaded]) {
      s.apply({ type: 'spawn', species: Species.WOLF, x: 64, y: 64, size: 5 });
      s.apply({ type: 'power', power: 'meteor', x: 70, y: 60, size: 5 });
      for (let t = 0; t < 300; t++) s.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });

  it('comprime con gzip y descomprime sin pérdidas', async () => {
    const sim = busyWorld();
    const raw = serialize(sim, meta(sim));
    const packed = await encodeSave(sim, meta(sim));
    expect(packed.length).toBeLessThan(raw.length);
    expect(await unpackSave(packed)).toEqual(raw);
    expect((await decodeSave(packed)).stateHash()).toBe(sim.stateHash());
    // También acepta datos sin comprimir.
    expect((await decodeSave(raw)).stateHash()).toBe(sim.stateHash());
  });

  it('lee el resumen sin reconstruir el mundo', () => {
    const sim = busyWorld();
    const m = readMeta(serialize(sim, meta(sim)));
    expect(m).toMatchObject({ name: 'Prueba', seedText: 'guardado', size: 128, tick: sim.tick, savedAt: 1234, population: sim.units.count });
  });

  it('rechaza archivos que no son partidas o están dañados', async () => {
    const sim = new Simulation({ seedText: 'x', size: 64, capacity: 100, populate: true });
    const good = serialize(sim, meta(sim));
    expect(() => deserialize(new TextEncoder().encode('hola, mundo'))).toThrow(/no es un archivo/);
    expect(() => deserialize(good.subarray(0, good.length - 1000))).toThrow(/cortado/);
    const otherVersion = patchHeader(good, (h) => ({ ...h, version: SAVE_VERSION + 1 }));
    expect(() => deserialize(otherVersion)).toThrow(/versión/);
    const badSize = patchHeader(good, (h) => ({ ...h, options: { ...(h.options as object), size: 99999 } }));
    expect(() => deserialize(badSize)).toThrow(/tamaño/);
    const badLaws = patchHeader(good, (h) => ({ ...h, laws: { hunger: 'sí' } }));
    expect(() => deserialize(badLaws)).toThrow(/leyes/);
    const corrupt = new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5]);
    await expect(decodeSave(corrupt)).rejects.toThrow(/dañado/);
    const smaller = patchHeader(good, (h) => ({ ...h, options: { ...(h.options as object), size: 32 } }));
    expect(() => deserialize(smaller)).toThrow(/tamaño de los datos/);
    const noHazards = patchHeader(good, (h) => ({ ...h, hazards: null }));
    expect(() => deserialize(noHazards)).toThrow(/fuego y lava/);
  });

  it('rechaza referencias cruzadas fuera de rango (archivos manipulados)', () => {
    const sim = busyWorld();
    const good = serialize(sim, meta(sim));
    const civ = (h: Record<string, unknown>) => h.civ as Record<string, Record<string, unknown>[]>;
    const badVillage = patchHeader(good, (h) => {
      civ(h).villages[0] = { ...civ(h).villages[0], armyTarget: 999 };
      return h;
    });
    expect(() => deserialize(badVillage)).toThrow(/referencias de aldea/);
    const badAllies = patchHeader(good, (h) => {
      civ(h).kingdoms[0] = { ...civ(h).kingdoms[0], allies: [42] };
      return h;
    });
    expect(() => deserialize(badAllies)).toThrow(/relaciones de reino/);
    const badBuilding = patchHeader(good, (h) => {
      civ(h).buildings[0] = { ...civ(h).buildings[0], village: -5 };
      return h;
    });
    expect(() => deserialize(badBuilding)).toThrow(/edificio/);
    const badEffect = patchHeader(good, (h) => ({ ...h, powers: { effects: [{ kind: 'meteoro', x: 1, y: 1, r: 1, ttl: 1, dx: 0, dy: 0 }], held: [] } }));
    expect(() => deserialize(badEffect)).toThrow(/efecto/);
  });

  it('rechaza criaturas con datos imposibles y huecos libres que pisarían a una viva', () => {
    const sim = busyWorld();
    const u = sim.units;
    let villager = -1;
    for (let i = 0; i < u.highWater && villager < 0; i++) if (u.alive[i] && u.village[i] >= 0) villager = i;
    const original = u.village[villager];
    u.village[villager] = 500;
    expect(() => deserialize(serialize(sim, meta(sim)))).toThrow(/criaturas/);
    u.village[villager] = original;

    const { freeTop } = u.getCounters();
    expect(freeTop).toBeGreaterThan(0);
    const free = u.dataViews().at(-1) as Int32Array;
    const saved = free[0];
    free[0] = villager;
    expect(() => deserialize(serialize(sim, meta(sim)))).toThrow(/huecos/);
    free[0] = saved;
    expect(deserialize(serialize(sim, meta(sim))).stateHash()).toBe(sim.stateHash());
  });
});

/** Reescribe la cabecera JSON de una partida (para probar validaciones). */
function patchHeader(bytes: Uint8Array, fn: (h: Record<string, unknown>) => Record<string, unknown>): Uint8Array {
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len))) as Record<string, unknown>;
  const json = new TextEncoder().encode(JSON.stringify(fn(header)));
  const pad = Math.ceil((8 + json.length) / 8) * 8;
  const rest = bytes.subarray(Math.ceil((8 + len) / 8) * 8);
  const out = new Uint8Array(pad + rest.length);
  out.set(bytes.subarray(0, 4));
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  out.set(rest, pad);
  return out;
}
