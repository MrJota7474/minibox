import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateWorld } from '../src/world/generator';
import { fbm, valueNoise } from '../src/world/noise';
import { BIOME_INFO, Biome, Flora, SEA_LEVEL, TERRAIN_INFO, Terrain, isDeposit, isPlant, terrainFromHeight } from '../src/world/terrain';
import { VEGETATION_PASS_TICKS, VegetationSystem } from '../src/world/vegetation';
import { CHUNK_SIZE, World } from '../src/world/world';

describe('terrain', () => {
  it('la altura determina la capa', () => {
    expect(terrainFromHeight(0)).toBe(Terrain.DEEP);
    expect(terrainFromHeight(SEA_LEVEL - 1)).toBe(Terrain.SHALLOW);
    expect(terrainFromHeight(SEA_LEVEL)).toBe(Terrain.SAND);
    expect(terrainFromHeight(255)).toBe(Terrain.SUMMIT);
  });

  it('la altura de pintado de cada capa cae dentro de su rango', () => {
    for (let t = 0; t < TERRAIN_INFO.length; t++) {
      expect(terrainFromHeight(TERRAIN_INFO[t].paintHeight)).toBe(t);
      expect(terrainFromHeight(TERRAIN_INFO[t].paintHeight + 2)).toBe(t);
      expect(terrainFromHeight(TERRAIN_INFO[t].paintHeight - 2)).toBe(t);
    }
  });
});

describe('noise', () => {
  it('es determinista y está en [0,1]', () => {
    expect(valueNoise(1.5, 2.25, 9)).toBe(valueNoise(1.5, 2.25, 9));
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.37, i * 0.11, 3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('generateWorld', () => {
  it('la misma semilla genera el mismo mundo', () => {
    expect(generateWorld(123, 96, 96).stateHash()).toBe(generateWorld(123, 96, 96).stateHash());
  });

  it('semillas distintas generan mundos distintos', () => {
    expect(generateWorld(1, 96, 96).stateHash()).not.toBe(generateWorld(2, 96, 96).stateHash());
  });

  it('mantiene una proporción razonable de tierra y agua', () => {
    const w = generateWorld(77, 128, 128);
    let water = 0;
    for (let i = 0; i < w.size; i++) if (w.isWaterIdx(i)) water++;
    const fraction = water / w.size;
    expect(fraction).toBeGreaterThan(0.38);
    expect(fraction).toBeLessThan(0.6);
  });

  it('los bordes del mapa son agua (isla central)', () => {
    const w = generateWorld(5, 128, 128);
    expect(w.isWaterIdx(w.idx(0, 0))).toBe(true);
    expect(w.isWaterIdx(w.idx(127, 127))).toBe(true);
  });

  it('coloca plantas sólo en tierra fértil y minerales en tierras altas', () => {
    const w = generateWorld(8, 128, 128);
    let plants = 0;
    let deposits = 0;
    for (let i = 0; i < w.size; i++) {
      if (isPlant(w.flora[i])) {
        plants++;
        expect(w.isFertileIdx(i)).toBe(true);
      } else if (isDeposit(w.flora[i])) {
        deposits++;
        expect([Terrain.SOIL_HIGH, Terrain.HILLS, Terrain.MOUNTAIN]).toContain(w.terrain[i]);
      }
    }
    expect(plants).toBeGreaterThan(0);
    expect(deposits).toBeGreaterThan(0);
  });

  it('etiqueta las islas: casillas pisables con región y agua sin región', () => {
    const w = generateWorld(8, 96, 96);
    for (let i = 0; i < w.size; i++) {
      if (w.isWaterIdx(i)) expect(w.region[i]).toBe(0);
    }
    const land = w.region.findIndex((r) => r > 0);
    expect(land).toBeGreaterThanOrEqual(0);
    expect(w.regionsDirty).toBe(false);
    w.setHeight(land, 0);
    expect(w.regionsDirty).toBe(true);
  });
});

describe('World', () => {
  it('setHeight actualiza la capa y elimina plantas al inundar', () => {
    const w = new World(8, 8);
    const i = w.idx(2, 2);
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setFlora(i, Flora.TREE);
    w.setGrass(i, 100);
    w.setHeight(i, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    expect(w.terrain[i]).toBe(Terrain.OCEAN);
    expect(w.flora[i]).toBe(Flora.NONE);
    expect(w.grass[i]).toBe(0);
  });

  it('setHeight limita la altura a 0-255', () => {
    const w = new World(4, 4);
    w.setHeight(0, 999);
    expect(w.heightMap[0]).toBe(255);
    w.setHeight(0, -5);
    expect(w.heightMap[0]).toBe(0);
  });

  it('marca y consume chunks modificados', () => {
    const w = new World(CHUNK_SIZE * 2, CHUNK_SIZE * 2);
    expect(w.hasDirtyChunks()).toBe(false);
    w.setFlora(w.idx(CHUNK_SIZE + 1, 1), Flora.TREE);
    const seen: [number, number][] = [];
    w.consumeDirtyChunks((cx, cy) => seen.push([cx, cy]));
    expect(seen).toEqual([[1, 0]]);
    expect(w.hasDirtyChunks()).toBe(false);
    w.markAllDirty();
    let n = 0;
    w.consumeDirtyChunks(() => n++);
    expect(n).toBe(4);
  });

  it('isWalkableAt rechaza agua y fuera del mapa', () => {
    const w = new World(4, 4);
    w.setHeight(w.idx(1, 1), TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    expect(w.isWalkableAt(1.5, 1.5)).toBe(true);
    expect(w.isWalkableAt(0.5, 0.5)).toBe(false);
    expect(w.isWalkableAt(-1, 2)).toBe(false);
  });
});

describe('VegetationSystem', () => {
  it('la hierba vuelve a crecer hasta el máximo del bioma', () => {
    const w = new World(16, 16);
    for (let i = 0; i < w.size; i++) {
      w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
      w.setBiome(i, Biome.GRASS);
    }
    const veg = new VegetationSystem(w);
    const rng = new Rng(1);
    for (let t = 0; t < VEGETATION_PASS_TICKS * 30; t++) veg.step(rng);
    expect(w.grass[w.idx(5, 5)]).toBe(BIOME_INFO[Biome.GRASS].grassMax);
  });

  it('los retoños se convierten en árboles y los arbustos recuperan bayas', () => {
    const w = new World(16, 16);
    for (let i = 0; i < w.size; i++) w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setFlora(w.idx(3, 3), Flora.SAPLING);
    w.setFlora(w.idx(8, 8), Flora.BUSH);
    const veg = new VegetationSystem(w);
    const rng = new Rng(2);
    for (let t = 0; t < VEGETATION_PASS_TICKS * 200; t++) veg.step(rng);
    expect([Flora.TREE, Flora.NONE]).toContain(w.flora[w.idx(3, 3)]);
    expect(w.flora[w.idx(8, 8)]).toBe(Flora.BERRY_BUSH);
    veg.setCursor(5);
    expect(veg.getCursor()).toBe(5);
  });
});
