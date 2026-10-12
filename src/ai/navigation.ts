import { PATH_MAX } from '../entities/units';
import type { AiContext } from './context';
import { Move, moveToward } from './movement';

export const Nav = { MOVING: 0, ARRIVED: 1, FAILED: 2, WAITING: 3 } as const;
export type NavResult = (typeof Nav)[keyof typeof Nav];

/** Olvida la ruta guardada (llamar siempre que cambie el destino). */
export function clearPath(ctx: AiContext, i: number): void {
  ctx.units.pathLen[i] = 0;
  ctx.units.pathIdx[i] = 0;
}

/**
 * Lleva a la criatura hacia (tx,ty): en línea recta mientras se pueda y,
 * si se bloquea, con una ruta A* guardada como waypoints.
 */
export function navigateTo(ctx: AiContext, i: number, tx: number, ty: number, speed: number): NavResult {
  const u = ctx.units;
  if (u.pathLen[i] > 0) return followPath(ctx, i, speed);
  const r = moveToward(ctx.world, u, i, tx, ty, speed);
  if (r === Move.ARRIVED) return Nav.ARRIVED;
  if (r === Move.MOVING) return Nav.MOVING;
  if (!ctx.pathfinder.hasBudget()) return Nav.WAITING;
  const n = ctx.pathfinder.find(Math.floor(u.x[i]), Math.floor(u.y[i]), Math.floor(tx), Math.floor(ty), u.path, i * PATH_MAX * 2, PATH_MAX);
  if (n === 0) return Nav.FAILED;
  u.pathLen[i] = n;
  u.pathIdx[i] = 0;
  return Nav.MOVING;
}

function followPath(ctx: AiContext, i: number, speed: number): NavResult {
  const u = ctx.units;
  const base = i * PATH_MAX * 2 + u.pathIdx[i] * 2;
  const r = moveToward(ctx.world, u, i, u.path[base] + 0.5, u.path[base + 1] + 0.5, speed);
  if (r === Move.BLOCKED) {
    // El terreno cambió o la ruta corta una esquina: se recalcula desde aquí en el siguiente tick.
    // Si nunca se llega, el límite de tiempo del estado acaba abandonando la tarea.
    clearPath(ctx, i);
    return Nav.WAITING;
  }
  if (r === Move.ARRIVED) {
    u.pathIdx[i]++;
    if (u.pathIdx[i] >= u.pathLen[i]) clearPath(ctx, i);
  }
  return Nav.MOVING;
}
