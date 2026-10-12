import { Flora, Terrain, isPlant } from '../world/terrain';
import type { World } from '../world/world';

/** Capas sobre las que se puede construir. */
function isBuildableTerrain(t: number): boolean {
  return t === Terrain.SAND || t === Terrain.SOIL_LOW || t === Terrain.SOIL_HIGH || t === Terrain.HILLS;
}

/**
 * ¿Cabe un edificio w×h con esquina superior izquierda en (x,y)?
 * Exige terreno edificable, misma región, sin depósitos, sin otros edificios
 * (con un margen de 1 casilla para dejar paso) y zona propia o libre.
 */
export function canPlace(world: World, x: number, y: number, w: number, h: number, owner: number): boolean {
  if (!world.inBounds(x - 1, y - 1) || !world.inBounds(x + w, y + h)) return false;
  const region = world.region[world.idx(x, y)];
  if (region === 0) return false;
  for (let ty = y - 1; ty <= y + h; ty++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      const i = world.idx(tx, ty);
      if (world.buildingAt[i] !== 0) return false;
      const inside = tx >= x && ty >= y && tx < x + w && ty < y + h;
      if (!inside) continue;
      if (!isBuildableTerrain(world.terrain[i]) || world.region[i] !== region) return false;
      const f = world.flora[i];
      if (f === Flora.ROCK || f === Flora.IRON || f === Flora.GOLD) return false;
      const zoneOwner = world.ownerAt(tx, ty);
      if (zoneOwner !== owner && zoneOwner !== -1) return false;
    }
  }
  return true;
}

/** Despeja plantas y reservas bajo un edificio nuevo. */
export function clearFootprint(world: World, x: number, y: number, w: number, h: number): void {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      const i = world.idx(tx, ty);
      if (isPlant(world.flora[i])) world.setFlora(i, Flora.NONE);
      world.reserved[i] = 0;
    }
  }
}

/** Visita las casillas en anillos crecientes alrededor de (cx,cy), en orden determinista. Se detiene si visit devuelve true. */
export function forEachRing(cx: number, cy: number, maxRadius: number, visit: (x: number, y: number) => boolean): void {
  if (visit(cx, cy)) return;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const edge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r) {
        if (visit(cx + dx, cy + dy)) return;
      }
    }
  }
}

/** Busca un hueco para un edificio w×h cerca de (cx,cy). Devuelve la esquina o null. */
export function findBuildSpot(world: World, cx: number, cy: number, w: number, h: number, owner: number, maxRadius: number): { x: number; y: number } | null {
  let found: { x: number; y: number } | null = null;
  forEachRing(cx, cy, maxRadius, (px, py) => {
    const x = px - Math.floor(w / 2);
    const y = py - Math.floor(h / 2);
    if (canPlace(world, x, y, w, h, owner)) {
      found = { x, y };
      return true;
    }
    return false;
  });
  return found;
}

/** Casilla más cercana a (cx,cy) que cumple `accept`, en la región indicada. -1 si no hay. */
export function searchTile(world: World, cx: number, cy: number, maxRadius: number, region: number, accept: (i: number) => boolean): number {
  let found = -1;
  forEachRing(cx, cy, maxRadius, (x, y) => {
    if (!world.inBounds(x, y)) return false;
    const i = world.idx(x, y);
    if (world.region[i] !== region || !accept(i)) return false;
    found = i;
    return true;
  });
  return found;
}
