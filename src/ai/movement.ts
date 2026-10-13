import type { Rng } from '../core/rng';
import type { UnitStore } from '../entities/units';
import { BIOME_INFO } from '../world/terrain';
import type { World } from '../world/world';

const BIOME_SPEED: readonly number[] = BIOME_INFO.map((b) => b.speed);

export const Move = { MOVING: 0, ARRIVED: 1, BLOCKED: 2 } as const;
export type MoveResult = (typeof Move)[keyof typeof Move];

/** Movimiento local voraz con deslizamiento por ejes cuando hay obstáculos. */
export function moveToward(world: World, units: UnitStore, i: number, tx: number, ty: number, baseSpeed: number): MoveResult {
  const x = units.x[i];
  const y = units.y[i];
  // El terreno que se pisa frena o acelera (pantano, nieve, sabana...).
  const speed = baseSpeed * (BIOME_SPEED[world.biome[world.idx(Math.floor(x), Math.floor(y))]] ?? 1);
  const dx = tx - x;
  const dy = ty - y;
  const d2 = dx * dx + dy * dy;
  if (d2 <= speed * speed) {
    if (!world.isWalkableAt(tx, ty)) return Move.BLOCKED;
    units.x[i] = tx;
    units.y[i] = ty;
    return Move.ARRIVED;
  }
  const d = Math.sqrt(d2);
  // Se comprueba con la misma precisión con la que se guarda (Float32).
  const nx = Math.fround(x + (dx / d) * speed);
  const ny = Math.fround(y + (dy / d) * speed);
  if (world.isWalkableAt(nx, ny)) {
    units.x[i] = nx;
    units.y[i] = ny;
    return Move.MOVING;
  }
  // Deslizamiento por ejes, sin pasarse del destino (evita oscilar para siempre).
  const sx = Math.fround(x + Math.sign(dx) * Math.min(speed, Math.abs(dx)));
  if (Math.abs(dx) > 0.01 && world.isWalkableAt(sx, y)) {
    units.x[i] = sx;
    return Move.MOVING;
  }
  const sy = Math.fround(y + Math.sign(dy) * Math.min(speed, Math.abs(dy)));
  if (Math.abs(dy) > 0.01 && world.isWalkableAt(x, sy)) {
    units.y[i] = sy;
    return Move.MOVING;
  }
  return Move.BLOCKED;
}

const WANDER_ATTEMPTS = 5;

/** Elige un destino aleatorio pisable cerca. Devuelve false si no encontró ninguno. */
export function pickWanderTarget(world: World, units: UnitStore, i: number, rng: Rng, radius: number): boolean {
  for (let a = 0; a < WANDER_ATTEMPTS; a++) {
    const tx = Math.floor(units.x[i] + rng.range(-radius, radius)) + 0.5;
    const ty = Math.floor(units.y[i] + rng.range(-radius, radius)) + 0.5;
    if (world.isWalkableAt(tx, ty)) {
      units.tx[i] = tx;
      units.ty[i] = ty;
      return true;
    }
  }
  return false;
}

const ESCAPE_RADIUS = 3;

/**
 * Si la criatura quedó sobre terreno no pisable (p. ej. el jugador pintó agua),
 * la mueve a la casilla pisable más cercana. Devuelve false si no hay ninguna cerca.
 */
export function escapeBlockedTile(world: World, units: UnitStore, i: number): boolean {
  const cx = Math.floor(units.x[i]);
  const cy = Math.floor(units.y[i]);
  for (let r = 1; r <= ESCAPE_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (world.isWalkableAt(nx, ny)) {
          units.x[i] = nx + 0.5;
          units.y[i] = ny + 0.5;
          units.tx[i] = units.x[i];
          units.ty[i] = units.y[i];
          return true;
        }
      }
    }
  }
  return false;
}
