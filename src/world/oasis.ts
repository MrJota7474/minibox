import type { Rng } from '../core/rng';
import { BIOME_INFO, Biome, Flora, TERRAIN_INFO, Terrain, isFertileTerrain } from './terrain';
import { treeNeighbors } from './vegetation';
import type { World } from './world';

/** Parte del radio que ocupa la charca y parte con pradera (el resto, sabana). */
const POOL_SHARE = 0.35;
const POOL_MIN = 1.2;
const MEADOW_SHARE = 0.6;
/** Probabilidad de palmera (cerca de la charca) y de bayas en cada casilla libre del oasis. */
const PALM_CHANCE = 0.3;
const PALM_SHARE = 0.75;
const BERRY_CHANCE = 0.08;
const MAX_TREE_NEIGHBORS = 3;

/**
 * Crea un oasis: una charca en el centro, pradera con palmeras y bayas alrededor y sabana en
 * el borde. No toca las casillas con edificios ni el agua que ya hubiera. Determinista (el azar
 * llega por `rng`). Devuelve cuántas casillas de agua nuevas hay.
 */
export function makeOasis(w: World, cx: number, cy: number, r: number, rng: Rng): number {
  const pool = Math.max(POOL_MIN, r * POOL_SHARE);
  const shallow = TERRAIN_INFO[Terrain.SHALLOW].paintHeight;
  const ir = Math.ceil(r);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  let water = 0;
  for (let y = y0 - ir; y <= y0 + ir; y++) {
    for (let x = x0 - ir; x <= x0 + ir; x++) {
      if (!w.inBounds(x, y)) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const i = w.idx(x, y);
      if (w.buildingAt[i] !== 0 || w.isWaterIdx(i)) continue;
      const fertile = isFertileTerrain(w.terrain[i]);
      if (d <= pool) {
        // La charca brota en tierra o arena, nunca en la roca de una montaña.
        if (!fertile && w.terrain[i] !== Terrain.SAND) continue;
        w.setFlora(i, Flora.NONE);
        w.setHeight(i, shallow);
        water++;
        continue;
      }
      // En arena o roca no crece la hierba: el oasis sólo verdea la tierra fértil.
      if (!fertile) continue;
      w.setBiome(i, d <= r * MEADOW_SHARE ? Biome.GRASS : Biome.SAVANNA);
      w.setGrass(i, BIOME_INFO[w.biome[i]].grassMax);
      if (w.flora[i] !== Flora.NONE) continue;
      const roll = rng.float();
      if (d <= r * PALM_SHARE && roll < PALM_CHANCE) {
        if (treeNeighbors(w, x, y) < MAX_TREE_NEIGHBORS) w.setFlora(i, Flora.TREE);
      } else if (roll >= PALM_CHANCE && roll < PALM_CHANCE + BERRY_CHANCE) w.setFlora(i, Flora.BERRY_BUSH);
    }
  }
  return water;
}

/** Oasis que nacen con el mapa: radio, distancia entre ellos y desierto que hace falta alrededor. */
const NATURAL_RADIUS = 4;
const NATURAL_SPACING = 28;
const DESERT_AROUND = 7;
const SCAN_STEP = 6;
/** Parte de los sitios posibles que se quedan con oasis (si caben). */
const NATURAL_CHANCE = 0.5;
/** Uno por cada tantas casillas de mapa (256×256 → hasta 4). */
const TILES_PER_OASIS = 16384;

/** ¿Hay sólo desierto de tierra firme en el cuadrado de lado 2·rad alrededor? */
function deepDesert(w: World, x: number, y: number, rad: number): boolean {
  for (let yy = y - rad; yy <= y + rad; yy++) {
    for (let xx = x - rad; xx <= x + rad; xx++) {
      if (!w.inBounds(xx, yy)) return false;
      const i = w.idx(xx, yy);
      if (w.biome[i] !== Biome.DESERT || !isFertileTerrain(w.terrain[i])) return false;
    }
  }
  return true;
}

/**
 * Al generar el mapa: algún oasis en los desiertos grandes, separados entre sí. Los sitios
 * posibles se barajan, para que en un mapa grande no se amontonen todos arriba. Devuelve cuántos.
 */
export function placeOases(w: World, rng: Rng): number {
  const max = Math.max(1, Math.floor(w.size / TILES_PER_OASIS));
  const spots: (readonly [number, number])[] = [];
  for (let y = DESERT_AROUND; y < w.height - DESERT_AROUND; y += SCAN_STEP) {
    for (let x = DESERT_AROUND; x < w.width - DESERT_AROUND; x += SCAN_STEP) if (deepDesert(w, x, y, DESERT_AROUND)) spots.push([x, y]);
  }
  for (let k = spots.length - 1; k > 0; k--) {
    const j = rng.int(k + 1);
    [spots[k], spots[j]] = [spots[j], spots[k]];
  }
  const placed: (readonly [number, number])[] = [];
  for (const [x, y] of spots) {
    if (placed.length >= max) break;
    if (placed.some(([px, py]) => Math.abs(px - x) < NATURAL_SPACING && Math.abs(py - y) < NATURAL_SPACING)) continue;
    if (!rng.chance(NATURAL_CHANCE)) continue;
    makeOasis(w, x + 0.5, y + 0.5, NATURAL_RADIUS, rng);
    placed.push([x, y]);
  }
  return placed.length;
}
