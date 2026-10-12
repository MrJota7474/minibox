import type { World } from '../world/world';

/** Puntos máximos de una ruta marítima ya simplificada. */
export const SEA_ROUTE_MAX_POINTS = 128;
const LOS_STEP = 0.25;

/** Buffers de trabajo reutilizados entre búsquedas (se reinician en cada una: no son estado). */
let buffers: { came: Int32Array; queue: Int32Array } | null = null;

function scratch(size: number): { came: Int32Array; queue: Int32Array } {
  if (!buffers || buffers.came.length !== size) buffers = { came: new Int32Array(size), queue: new Int32Array(size) };
  return buffers;
}

/**
 * Ruta por agua de la casilla `from` a la casilla `to` (ambas de agua y del mismo mar):
 * búsqueda en anchura con 8 vecinos (sin cortar esquinas por tierra) y simplificada por
 * línea de visión. Devuelve las casillas de paso (la última es `to`) o null si no hay ruta.
 * Los barcos zarpan pocas veces, así que no necesita presupuesto por tick.
 */
export function findSeaRoute(world: World, from: number, to: number, maxPoints = SEA_ROUTE_MAX_POINTS): number[] | null {
  if (from < 0 || to < 0 || from >= world.size || to >= world.size) return null;
  const sea = world.sea[from];
  if (sea === 0 || world.sea[to] !== sea) return null;
  if (from === to) return [to];
  const { came, queue } = scratch(world.size);
  came.fill(-1);
  const w = world.width;
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  came[from] = from;
  while (head < tail && came[to] < 0) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!world.inBounds(nx, ny)) continue;
        const n = ny * w + nx;
        if (came[n] >= 0 || world.sea[n] !== sea) continue;
        // En diagonal, las dos casillas laterales también deben ser agua.
        if (dx !== 0 && dy !== 0 && (world.sea[cy * w + nx] !== sea || world.sea[ny * w + cx] !== sea)) continue;
        came[n] = cur;
        queue[tail++] = n;
      }
    }
  }
  if (came[to] < 0) return null;
  const full: number[] = [];
  for (let n = to; n !== from; n = came[n]) full.push(n);
  full.push(from);
  full.reverse();
  return simplify(world, full, maxPoints);
}

/** Deja sólo los puntos donde la línea recta desde el anterior dejaría de ir por agua. */
function simplify(world: World, full: readonly number[], maxPoints: number): number[] | null {
  const out: number[] = [];
  let anchor = full[0];
  for (let k = 1; k < full.length - 1; k++) {
    if (!waterLine(world, anchor, full[k + 1])) {
      out.push(full[k]);
      anchor = full[k];
      if (out.length >= maxPoints) return null;
    }
  }
  out.push(full[full.length - 1]);
  return out;
}

/** ¿Se puede navegar en línea recta del centro de una casilla al de otra? */
export function waterLine(world: World, a: number, b: number): boolean {
  const w = world.width;
  const ax = (a % w) + 0.5;
  const ay = Math.floor(a / w) + 0.5;
  const bx = (b % w) + 0.5;
  const by = Math.floor(b / w) + 0.5;
  const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / LOS_STEP);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(ax + (bx - ax) * t);
    const y = Math.floor(ay + (by - ay) * t);
    if (!world.inBounds(x, y) || !world.isWaterIdx(y * w + x)) return false;
  }
  return true;
}
