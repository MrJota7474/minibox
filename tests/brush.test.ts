import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Species } from '../src/entities/species';
import { UnitStore } from '../src/entities/units';
import { applyBrush, forEachTileInBrush, spawnCountForSize, spawnInBrush } from '../src/powers/brush';
import { Biome, Flora, SEA_LEVEL, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

function landWorld(size = 32): World {
  const w = new World(size, size);
  for (let i = 0; i < w.size; i++) w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
  return w;
}

describe('forEachTileInBrush', () => {
  it('tamaño 1 es una sola casilla y crece con el tamaño', () => {
    const w = new World(32, 32);
    const count = (size: number): number => {
      let n = 0;
      forEachTileInBrush(w, 16, 16, size, () => n++);
      return n;
    };
    expect(count(1)).toBe(1);
    expect(count(3)).toBeGreaterThan(1);
    expect(count(9)).toBeGreaterThan(count(5));
  });

  it('no se sale del mapa', () => {
    const w = new World(8, 8);
    forEachTileInBrush(w, 0, 0, 15, (i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(w.size);
    });
  });
});

describe('applyBrush', () => {
  it('pinta capas de terreno', () => {
    const w = landWorld();
    const rng = new Rng(1);
    applyBrush(w, rng, 'water', 10, 10, 1);
    expect(w.terrain[w.idx(10, 10)]).toBe(Terrain.SHALLOW);
    applyBrush(w, rng, 'mountain', 12, 12, 1);
    expect(w.terrain[w.idx(12, 12)]).toBe(Terrain.MOUNTAIN);
    applyBrush(w, rng, 'deep', 14, 14, 1);
    expect(w.terrain[w.idx(14, 14)]).toBe(Terrain.DEEP);
  });

  it('la tierra creada sobre el agua empieza sin hierba', () => {
    const w = new World(8, 8);
    applyBrush(w, new Rng(1), 'soil', 3, 3, 1);
    expect(w.terrain[w.idx(3, 3)]).toBe(Terrain.SOIL_LOW);
    expect(w.grass[w.idx(3, 3)]).toBe(0);
  });

  it('elevar y hundir cambian la altura', () => {
    const w = landWorld();
    const i = w.idx(5, 5);
    const h = w.heightMap[i];
    applyBrush(w, new Rng(1), 'raise', 5, 5, 1);
    expect(w.heightMap[i]).toBeGreaterThan(h);
    applyBrush(w, new Rng(1), 'lower', 5, 5, 1);
    applyBrush(w, new Rng(1), 'lower', 5, 5, 1);
    expect(w.heightMap[i]).toBeLessThan(h);
  });

  it('la esponja convierte el agua en arena', () => {
    const w = new World(8, 8);
    applyBrush(w, new Rng(1), 'sponge', 4, 4, 1);
    expect(w.heightMap[w.idx(4, 4)]).toBeGreaterThanOrEqual(SEA_LEVEL);
    expect(w.terrain[w.idx(4, 4)]).toBe(Terrain.SAND);
  });

  it('pinta biomas sólo en tierra; el desierto elimina hierba y arbustos', () => {
    const w = landWorld(8);
    const i = w.idx(2, 2);
    w.setGrass(i, 150);
    w.setFlora(i, Flora.BERRY_BUSH);
    applyBrush(w, new Rng(1), 'desert', 2, 2, 1);
    expect(w.biome[i]).toBe(Biome.DESERT);
    expect(w.grass[i]).toBe(0);
    expect(w.flora[i]).toBe(Flora.NONE);
    applyBrush(w, new Rng(1), 'forest', 2, 2, 1);
    expect(w.biome[i]).toBe(Biome.FOREST);
    const water = new World(4, 4);
    applyBrush(water, new Rng(1), 'forest', 1, 1, 1);
    expect(water.biome[water.idx(1, 1)]).toBe(Biome.GRASS);
  });

  it('planta árboles y arbustos, y la tala los quita', () => {
    const w = landWorld(8);
    applyBrush(w, new Rng(1), 'tree', 1, 1, 1);
    applyBrush(w, new Rng(1), 'bush', 3, 3, 1);
    expect(w.flora[w.idx(1, 1)]).toBe(Flora.TREE);
    expect(w.flora[w.idx(3, 3)]).toBe(Flora.BERRY_BUSH);
    applyBrush(w, new Rng(1), 'clear-flora', 1, 1, 1);
    expect(w.flora[w.idx(1, 1)]).toBe(Flora.NONE);
  });
});

describe('spawnInBrush', () => {
  it('crea criaturas sólo en terreno pisable', () => {
    const w = landWorld();
    const u = new UnitStore(50);
    const r = spawnInBrush(w, u, new Rng(1), Species.SHEEP, 16, 16, 9, 50);
    expect(r.spawned).toBe(spawnCountForSize(9));
    expect(r.limited).toBe(false);
    const water = new World(16, 16);
    const r2 = spawnInBrush(water, u, new Rng(1), Species.SHEEP, 8, 8, 1, 50);
    expect(r2.spawned).toBe(0);
  });

  it('respeta el límite de criaturas', () => {
    const w = landWorld();
    const u = new UnitStore(50);
    const r = spawnInBrush(w, u, new Rng(1), Species.RABBIT, 16, 16, 15, 3);
    expect(r.spawned).toBe(3);
    expect(r.limited).toBe(true);
  });
});
