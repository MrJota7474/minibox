import { describe, expect, it } from 'vitest';
import { Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { NO_UNIT, UnitStore } from '../src/entities/units';

const opts = { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 };

describe('UnitStore', () => {
  it('crea criaturas y cuenta por especie', () => {
    const u = new UnitStore(10);
    const a = u.spawn(Species.SHEEP, 1, 1, opts);
    const b = u.spawn(Species.WOLF, 2, 2, opts);
    expect(u.count).toBe(2);
    expect(u.speciesCount[Species.SHEEP]).toBe(1);
    expect(u.speciesCount[Species.WOLF]).toBe(1);
    expect(u.isAlive(a)).toBe(true);
    expect(u.isAlive(b)).toBe(true);
  });

  it('respeta la capacidad', () => {
    const u = new UnitStore(2);
    u.spawn(Species.SHEEP, 0, 0, opts);
    u.spawn(Species.SHEEP, 0, 0, opts);
    expect(u.isFull()).toBe(true);
    expect(u.spawn(Species.SHEEP, 0, 0, opts)).toBe(NO_UNIT);
  });

  it('reutiliza huecos y las referencias viejas dejan de resolver', () => {
    const u = new UnitStore(4);
    const a = u.spawn(Species.RABBIT, 0, 0, opts);
    const handle = u.handleOf(a);
    expect(u.resolve(handle)).toBe(a);
    u.kill(a);
    expect(u.isAlive(a)).toBe(false);
    expect(u.resolve(handle)).toBe(NO_UNIT);
    const b = u.spawn(Species.RABBIT, 0, 0, opts);
    expect(b).toBe(a);
    expect(u.resolve(handle)).toBe(NO_UNIT);
    expect(u.resolve(u.handleOf(b))).toBe(b);
    expect(u.resolve(-1)).toBe(NO_UNIT);
  });

  it('kill es idempotente', () => {
    const u = new UnitStore(4);
    const a = u.spawn(Species.SHEEP, 0, 0, opts);
    u.kill(a);
    u.kill(a);
    expect(u.count).toBe(0);
    expect(u.speciesCount[Species.SHEEP]).toBe(0);
  });

  it('stateHash cambia cuando cambia el estado', () => {
    const u = new UnitStore(4);
    const before = u.stateHash();
    u.spawn(Species.SHEEP, 1, 1, opts);
    expect(u.stateHash()).not.toBe(before);
  });
});

describe('SpatialHash', () => {
  it('encuentra criaturas dentro del radio y no fuera', () => {
    const u = new UnitStore(10);
    const near = u.spawn(Species.SHEEP, 10, 10, opts);
    u.spawn(Species.SHEEP, 40, 40, opts);
    const s = new SpatialHash(64, 64, 10);
    s.rebuild(u);
    const found: number[] = [];
    s.forEachInRadius(u, 11, 11, 3, (i) => {
      found.push(i);
    });
    expect(found).toEqual([near]);
  });

  it('nearest devuelve la más cercana que cumple el filtro', () => {
    const u = new UnitStore(10);
    u.spawn(Species.SHEEP, 10, 10, opts);
    const wolf = u.spawn(Species.WOLF, 14, 10, opts);
    const s = new SpatialHash(64, 64, 10);
    s.rebuild(u);
    expect(s.nearest(u, 10, 10, 8, (i) => u.species[i] === Species.WOLF)).toBe(wolf);
    expect(s.nearest(u, 10, 10, 2, (i) => u.species[i] === Species.WOLF)).toBe(-1);
  });

  it('ignora criaturas muertas y permite cortar la búsqueda', () => {
    const u = new UnitStore(10);
    const a = u.spawn(Species.SHEEP, 5, 5, opts);
    u.spawn(Species.SHEEP, 5, 6, opts);
    u.spawn(Species.SHEEP, 6, 5, opts);
    const s = new SpatialHash(32, 32, 10);
    s.rebuild(u);
    u.kill(a);
    let visits = 0;
    s.forEachInRadius(u, 5, 5, 4, () => {
      visits++;
      return true;
    });
    expect(visits).toBe(1);
  });
});
