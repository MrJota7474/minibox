import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/core/rng';
import { hashMix, hashViews } from '../src/core/hash';

describe('Rng', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 50 }, () => a.nextU32());
    const seqB = Array.from({ length: 50 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('produce secuencias distintas con semillas distintas', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it('float queda en [0,1) e int en [0,n)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });

  it('range incluye ambos extremos', () => {
    const r = new Rng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.range(-2, 2));
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('chance respeta los extremos', () => {
    const r = new Rng(3);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it('getState/setState permite reanudar la secuencia', () => {
    const r = new Rng(11);
    r.nextU32();
    const state = r.getState();
    const next = r.nextU32();
    const copy = new Rng(0);
    copy.setState(state);
    expect(copy.nextU32()).toBe(next);
  });

  it('fork crea flujos deterministas e independientes', () => {
    const a = new Rng(5).fork(1);
    const b = new Rng(5).fork(1);
    const c = new Rng(5).fork(2);
    expect(a.nextU32()).toBe(b.nextU32());
    expect(new Rng(5).fork(1).nextU32()).not.toBe(c.nextU32());
  });

  it('fromString es estable', () => {
    expect(hashString('mundo')).toBe(hashString('mundo'));
    expect(hashString('mundo')).not.toBe(hashString('mundos'));
    expect(Rng.fromString('x').nextU32()).toBe(Rng.fromString('x').nextU32());
  });
});

describe('hash', () => {
  it('hashViews depende del contenido', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(hashViews([a])).toBe(hashViews([new Uint8Array([1, 2, 3])]));
    expect(hashViews([a])).not.toBe(hashViews([b]));
  });

  it('hashMix cambia con el valor', () => {
    expect(hashMix(1, 2)).not.toBe(hashMix(1, 3));
  });
});
