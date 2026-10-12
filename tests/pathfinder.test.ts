import { describe, expect, it } from 'vitest';
import { PATHS_PER_TICK, Pathfinder } from '../src/ai/pathfinder';
import { TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

function land(size: number): World {
  const w = new World(size, size);
  for (let i = 0; i < w.size; i++) w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
  return w;
}

describe('Pathfinder', () => {
  it('rodea un muro y termina en el destino', () => {
    const w = land(32);
    for (let y = 2; y < 30; y++) w.setHeight(w.idx(16, y), 0);
    const pf = new Pathfinder(w);
    const out = new Int16Array(48);
    const n = pf.find(5, 15, 27, 15, out, 0, 24);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(24);
    expect([out[(n - 1) * 2], out[(n - 1) * 2 + 1]]).toEqual([27, 15]);
    for (let k = 0; k < n; k++) expect(w.isWalkableAt(out[k * 2], out[k * 2 + 1])).toBe(true);
  });

  it('no encuentra ruta a otra isla', () => {
    const w = land(32);
    for (let y = 0; y < 32; y++) w.setHeight(w.idx(16, y), 0);
    const pf = new Pathfinder(w);
    expect(pf.find(5, 5, 27, 5, new Int16Array(48), 0, 24)).toBe(0);
  });

  it('rechaza destinos no pisables o fuera del mapa', () => {
    const w = land(16);
    w.setHeight(w.idx(10, 10), 0);
    const pf = new Pathfinder(w);
    expect(pf.find(1, 1, 10, 10, new Int16Array(48), 0, 24)).toBe(0);
    expect(pf.find(1, 1, 99, 1, new Int16Array(48), 0, 24)).toBe(0);
  });

  it('respeta el presupuesto de búsquedas por tick', () => {
    const w = land(16);
    const pf = new Pathfinder(w);
    for (let k = 0; k < PATHS_PER_TICK; k++) pf.find(1, 1, 10, 10, new Int16Array(48), 0, 24);
    expect(pf.hasBudget()).toBe(false);
    pf.resetBudget();
    expect(pf.hasBudget()).toBe(true);
  });

  it('es determinista', () => {
    const w = land(32);
    for (let y = 4; y < 28; y++) w.setHeight(w.idx(12, y), 0);
    const a = new Int16Array(48);
    const b = new Int16Array(48);
    new Pathfinder(w).find(2, 16, 30, 16, a, 0, 24);
    new Pathfinder(w).find(2, 16, 30, 16, b, 0, 24);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
