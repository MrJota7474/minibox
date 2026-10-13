import { describe, expect, it } from 'vitest';
import { Species, isCivilized } from '../src/entities/species';
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

    // Que quede un hueco libre tras la partida depende del equilibrio: se libera uno a propósito.
    let animal = -1;
    for (let i = 0; i < u.highWater && animal < 0; i++) if (u.alive[i] && !isCivilized(u.species[i])) animal = i;
    u.kill(animal);
    const { freeTop } = u.getCounters();
    expect(freeTop).toBeGreaterThan(0);
    // La lista de huecos es el penúltimo array (el último es el clan, añadido en la versión 5).
    const free = u.dataViews().at(-2) as Int32Array;
    const saved = free[0];
    free[0] = villager;
    expect(() => deserialize(serialize(sim, meta(sim)))).toThrow(/huecos/);
    free[0] = saved;
    expect(deserialize(serialize(sim, meta(sim))).stateHash()).toBe(sim.stateHash());
  });
});

describe('migración de partidas antiguas', () => {
  it('carga una partida de la versión 1 (sin mares, barcos ni pescadores)', () => {
    const sim = busyWorld();
    const v2 = serialize(sim, meta(sim));
    const v1 = toVersion1(v2);
    const loaded = deserialize(v1);
    expect(loaded.units.count).toBe(sim.units.count);
    expect(loaded.civ.boats).toHaveLength(0);
    expect(loaded.civ.villages.every((v) => v.jobCounts.length === 10)).toBe(true);
    // Los mares se recalculan al cargar.
    expect(Array.from(loaded.world.sea)).toEqual(Array.from(sim.world.sea));
    expect(loaded.world.seaSizes).toEqual(sim.world.seaSizes);
    for (let t = 0; t < 200; t++) loaded.step();
  });

  it('carga una partida de la versión 3 (sin la ley ni el azar de los monstruos)', () => {
    const sim = busyWorld();
    const v3 = patchHeader(serialize(sim, meta(sim)), (h) => {
      const laws = { ...(h.laws as Record<string, boolean>) };
      delete laws.monsters;
      return { ...olderThan5(h), version: 3, laws, rng: (h.rng as number[][]).slice(0, 4) };
    });
    const loaded = deserialize(v3);
    expect(loaded.laws.monsters).toBe(true);
    expect(loaded.laws.rebellions).toBe(false);
    expect(loaded.units.count).toBe(sim.units.count);
    expect(loaded.getRngStates()).toHaveLength(5);
    expect(loaded.getRngStates().slice(0, 4)).toEqual(sim.getRngStates().slice(0, 4));
    for (let t = 0; t < 200; t++) loaded.step();
    // Una partida actual sí debe traer sus cinco flujos de azar.
    const short = patchHeader(serialize(sim, meta(sim)), (h) => ({ ...h, rng: (h.rng as number[][]).slice(0, 4) }));
    expect(() => deserialize(short)).toThrow(/aleatorio/);
  });
});

/** Cabecera sin lo que añadió la versión 5: culturas, religiones, clanes y el array de clanes. */
function olderThan5(h: Record<string, unknown>): Record<string, unknown> {
  const civ = { ...(h.civ as Record<string, unknown>) };
  delete civ.cultures;
  delete civ.religions;
  delete civ.clans;
  const strip = (list: unknown, keys: string[]): unknown[] =>
    (list as Record<string, unknown>[]).map((x) => {
      const copy = { ...x };
      for (const k of keys) delete copy[k];
      return copy;
    });
  civ.villages = strip(civ.villages, ['culture', 'religion']);
  civ.kingdoms = strip(civ.kingdoms, ['clan', 'dynastyTick']);
  return { ...h, civ, views: (h.views as number[]).slice(0, -1) };
}

describe('partidas con cultura, religión y clanes', () => {
  /** Un reino con santuario, fe y casa reinante. */
  function society(): Simulation {
    const sim = new Simulation({ seedText: 'guardado', size: 128, capacity: 400, populate: true });
    sim.apply({ type: 'law', law: 'monsters', value: false });
    sim.apply({ type: 'spawn', species: Species.HUMAN, x: 50, y: 64, size: 9 });
    sim.apply({ type: 'spawn', species: Species.TUSKER, x: 80, y: 64, size: 9 });
    for (let t = 0; t < 700; t++) sim.step();
    return sim;
  }

  it('se guardan y continúan exactamente igual', () => {
    const sim = society();
    expect(sim.civ.cultures.length).toBeGreaterThanOrEqual(2);
    expect(sim.civ.clans.length).toBeGreaterThanOrEqual(2);
    expect(sim.units.clan.some((c) => c > 0)).toBe(true);
    const loaded = deserialize(serialize(sim, meta(sim)));
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.civ.cultures).toEqual(sim.civ.cultures);
    expect(loaded.civ.clans).toEqual(sim.civ.clans);
    for (let t = 0; t < 1200; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });

  it('carga una partida de la versión 4: una cultura por reino, sin fe, y reparte los clanes', () => {
    const sim = society();
    const v4 = patchHeader(serialize(sim, meta(sim)), (h) => ({ ...olderThan5(h), version: 4 }));
    const loaded = deserialize(v4);
    const alive = loaded.civ.villages.filter((v) => v.alive);
    expect(alive.length).toBeGreaterThan(0);
    for (const v of alive) {
      expect(loaded.civ.cultures[v.culture]).toBeDefined();
      expect(v.religion).toBe(-1);
    }
    expect(loaded.civ.kingdoms.kingdoms.every((k) => k.clan === -1)).toBe(true);
    expect(loaded.units.clan.every((c) => c === 0)).toBe(true);
    for (let t = 0; t < 400; t++) loaded.step();
    const u = loaded.units;
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] === 1 && u.village[i] >= 0) expect(u.clan[i]).toBeGreaterThan(0);
    expect(loaded.civ.kingdoms.kingdoms.some((k) => k.alive && k.clan >= 0)).toBe(true);
  });

  it('rechaza culturas y clanes fuera de rango (archivo manipulado)', () => {
    const sim = society();
    const good = serialize(sim, meta(sim));
    type Civ = { villages: { culture: number }[]; kingdoms: { clan: number }[] };
    const badCulture = patchHeader(good, (h) => {
      (h.civ as Civ).villages[0].culture = 999;
      return h;
    });
    expect(() => deserialize(badCulture)).toThrow(/cultura/);
    const badHouse = patchHeader(good, (h) => {
      (h.civ as Civ).kingdoms[0].clan = 9999;
      return h;
    });
    expect(() => deserialize(badHouse)).toThrow(/casa reinante/);
    const u = sim.units;
    let someone = -1;
    for (let i = 0; i < u.highWater && someone < 0; i++) if (u.alive[i] === 1) someone = i;
    u.clan[someone] = 60000;
    expect(() => deserialize(serialize(sim, meta(sim)))).toThrow(/clan/);
  });
});

describe('partidas con monstruos', () => {
  function haunted(): Simulation {
    const sim = busyWorld();
    sim.apply({ type: 'brush', tool: 'blight', x: 40, y: 80, size: 15 });
    sim.apply({ type: 'spawn', species: Species.PENANTE, x: 52, y: 66, size: 5 });
    sim.apply({ type: 'spawn', species: Species.ESCORIO, x: 78, y: 62, size: 1 });
    sim.apply({ type: 'spawn', species: Species.CENAGOSO, x: 60, y: 70, size: 1 });
    sim.apply({ type: 'power', power: 'curse', x: 50, y: 64, size: 9 });
    for (let t = 0; t < 120; t++) sim.step();
    return sim;
  }

  it('se guardan y continúan exactamente igual', () => {
    const sim = haunted();
    expect(sim.units.speciesCount[Species.PENANTE] + sim.units.speciesCount[Species.ESCORIO] + sim.units.speciesCount[Species.CENAGOSO]).toBeGreaterThan(0);
    const loaded = deserialize(serialize(sim, meta(sim)));
    expect(loaded.stateHash()).toBe(sim.stateHash());
    for (let t = 0; t < 1200; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
    expect(loaded.civ.chronicle).toEqual(sim.civ.chronicle);
  });

  it('rechaza un monstruo empadronado en una aldea (archivo manipulado)', () => {
    const sim = haunted();
    const u = sim.units;
    let monster = -1;
    for (let i = 0; i < u.highWater && monster < 0; i++) if (u.alive[i] === 1 && u.species[i] >= Species.PENANTE) monster = i;
    u.village[monster] = 0;
    expect(() => deserialize(serialize(sim, meta(sim)))).toThrow(/criaturas/);
  });
});

/** Convierte una partida actual al formato de la versión 1 (Fase E). */
function toVersion1(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const len = view.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len))) as {
    version: number;
    views: number[];
    civ: { boats?: unknown; villages: { jobCounts: number[] }[] };
  };
  const align = (n: number): number => Math.ceil(n / 8) * 8;
  // Trozos de datos de cada array; se quita el 12.º (los mares).
  let off = align(8 + len);
  const chunks = h.views.map((n) => {
    const c = bytes.subarray(off, off + align(n));
    off += align(n);
    return c;
  });
  chunks.splice(11, 1);
  h.views.splice(11, 1);
  // ...y el último (el clan de cada criatura, de la versión 5).
  chunks.pop();
  h.views.pop();
  h.version = 1;
  delete h.civ.boats;
  for (const v of h.civ.villages) v.jobCounts = v.jobCounts.slice(0, 9);
  const json = new TextEncoder().encode(JSON.stringify(h));
  const start = align(8 + json.length);
  const out = new Uint8Array(start + chunks.reduce((n, c) => n + c.length, 0));
  out.set(bytes.subarray(0, 4));
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let p = start;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

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
