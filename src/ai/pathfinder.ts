import { isWalkableTerrain } from '../world/terrain';
import type { World } from '../world/world';

const SQRT2 = 1.4142135623730951;
/** Nodos máximos que explora una búsqueda (evita picos de CPU). */
export const MAX_NODES = 4000;
/** Búsquedas permitidas por tick; el resto espera al siguiente. */
export const PATHS_PER_TICK = 6;

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * A* sobre la cuadrícula con 8 vecinos (sin cortar esquinas) y montículo binario.
 * Reutiliza sus buffers entre búsquedas mediante sellos de generación.
 */
export class Pathfinder {
  private readonly g: Float32Array;
  private readonly came: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly heap: Int32Array;
  private readonly heapF: Float32Array;
  private heapSize = 0;
  private stamp = 0;
  private budget = PATHS_PER_TICK;
  private readonly scratch: Int32Array;

  constructor(private readonly world: World) {
    const n = world.size;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(MAX_NODES * 8 + 16);
    this.heapF = new Float32Array(MAX_NODES * 8 + 16);
    this.scratch = new Int32Array(MAX_NODES + 1);
  }

  resetBudget(): void {
    this.budget = PATHS_PER_TICK;
  }

  hasBudget(): boolean {
    return this.budget > 0;
  }

  /**
   * Busca una ruta de (sx,sy) a (tx,ty) y escribe hasta `maxPoints` waypoints (x,y)
   * en `out` a partir de `offset`. Devuelve cuántos escribió (0 = sin ruta).
   */
  find(sx: number, sy: number, tx: number, ty: number, out: Int16Array, offset: number, maxPoints: number): number {
    const w = this.world;
    if (!w.inBounds(sx, sy) || !w.inBounds(tx, ty)) return 0;
    const goal = w.idx(tx, ty);
    if (!isWalkableTerrain(w.terrain[goal])) return 0;
    this.budget--;
    this.stamp++;
    this.heapSize = 0;
    const start = w.idx(sx, sy);
    this.g[start] = 0;
    this.seen[start] = this.stamp;
    this.came[start] = -1;
    this.push(start, this.heuristic(sx, sy, tx, ty));
    let expanded = 0;
    while (this.heapSize > 0 && expanded < MAX_NODES) {
      const cur = this.pop();
      if (this.closed[cur] === this.stamp) continue;
      if (cur === goal) return this.writePath(goal, out, offset, maxPoints);
      this.closed[cur] = this.stamp;
      expanded++;
      this.expand(cur, tx, ty);
    }
    return 0;
  }

  private expand(cur: number, tx: number, ty: number): void {
    const w = this.world;
    const cx = cur % w.width;
    const cy = (cur - cx) / w.width;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!w.inBounds(nx, ny)) continue;
      const n = ny * w.width + nx;
      if (!isWalkableTerrain(w.terrain[n]) || this.closed[n] === this.stamp) continue;
      // No cortar esquinas en diagonal.
      if (dx !== 0 && dy !== 0) {
        if (!isWalkableTerrain(w.terrain[cy * w.width + nx]) || !isWalkableTerrain(w.terrain[ny * w.width + cx])) continue;
      }
      const g = this.g[cur] + cost;
      if (this.seen[n] === this.stamp && g >= this.g[n]) continue;
      this.seen[n] = this.stamp;
      this.g[n] = g;
      this.came[n] = cur;
      if (this.heapSize < this.heap.length) this.push(n, g + this.heuristic(nx, ny, tx, ty));
    }
  }

  private heuristic(x: number, y: number, tx: number, ty: number): number {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  }

  /**
   * Reconstruye la ruta y la simplifica ("string pulling"): sólo guarda un waypoint donde
   * la línea recta desde el anterior dejaría de ser pisable. El último es el destino; si hay
   * más de maxPoints, se trunca y la ruta se vuelve a calcular al llegar al final.
   */
  private writePath(goal: number, out: Int16Array, offset: number, maxPoints: number): number {
    let len = 0;
    for (let n = goal; n !== -1 && len < this.scratch.length; n = this.came[n]) this.scratch[len++] = n;
    // scratch va del destino (0) al origen (len - 1).
    if (len <= 1) {
      this.emit(out, offset, 0, goal);
      return 1;
    }
    let written = 0;
    let anchor = this.scratch[len - 1];
    let k = len - 2;
    for (; k >= 1 && written < maxPoints - 1; k--) {
      if (!this.lineOfSight(anchor, this.scratch[k - 1])) {
        this.emit(out, offset, written++, this.scratch[k]);
        anchor = this.scratch[k];
      }
    }
    // Si se truncó, el último waypoint es el siguiente punto de la ruta (visible desde el anterior);
    // si no, el destino.
    this.emit(out, offset, written++, k >= 1 ? this.scratch[k] : goal);
    return written;
  }

  private emit(out: Int16Array, offset: number, k: number, node: number): void {
    const w = this.world.width;
    out[offset + k * 2] = node % w;
    out[offset + k * 2 + 1] = Math.floor(node / w);
  }

  /** ¿Se puede ir en línea recta del centro de una casilla al de otra sin pisar casillas no pisables? */
  private lineOfSight(a: number, b: number): boolean {
    const w = this.world;
    const ax = (a % w.width) + 0.5;
    const ay = Math.floor(a / w.width) + 0.5;
    const bx = (b % w.width) + 0.5;
    const by = Math.floor(b / w.width) + 0.5;
    const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 0.25);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!w.isWalkableAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  private push(node: number, f: number): void {
    let i = this.heapSize++;
    this.heap[i] = node;
    this.heapF[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heapF[p] <= this.heapF[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  private pop(): number {
    const top = this.heap[0];
    this.heapSize--;
    if (this.heapSize > 0) {
      this.heap[0] = this.heap[this.heapSize];
      this.heapF[0] = this.heapF[this.heapSize];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.heapSize && this.heapF[l] < this.heapF[m]) m = l;
        if (r < this.heapSize && this.heapF[r] < this.heapF[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const n = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = n;
    const f = this.heapF[a];
    this.heapF[a] = this.heapF[b];
    this.heapF[b] = f;
  }
}
