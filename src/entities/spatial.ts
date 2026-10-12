import { HELD_FLAG, type UnitStore } from './units';

export const SPATIAL_CELL = 8;

/**
 * Spatial hash de celdas fijas con listas enlazadas en arrays tipados.
 * Se reconstruye cada tick en O(n); las consultas recorren sólo las celdas vecinas.
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private readonly heads: Int32Array;
  private readonly next: Int32Array;

  constructor(worldWidth: number, worldHeight: number, capacity: number) {
    this.cols = Math.ceil(worldWidth / SPATIAL_CELL);
    this.rows = Math.ceil(worldHeight / SPATIAL_CELL);
    this.heads = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(capacity);
  }

  rebuild(units: UnitStore): void {
    this.heads.fill(-1);
    for (let i = 0; i < units.highWater; i++) {
      if (units.alive[i] === 0 || (units.status[i] & HELD_FLAG) !== 0) continue;
      const c = this.cellOf(units.x[i], units.y[i]);
      this.next[i] = this.heads[c];
      this.heads[c] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / SPATIAL_CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / SPATIAL_CELL)));
    return cy * this.cols + cx;
  }

  /**
   * Visita las criaturas dentro del radio. Si `visit` devuelve true, la búsqueda se detiene.
   * El orden es determinista (celdas de arriba-izquierda a abajo-derecha).
   */
  forEachInRadius(units: UnitStore, x: number, y: number, radius: number, visit: (i: number, distSq: number) => boolean | void): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor((x - radius) / SPATIAL_CELL));
    const y0 = Math.max(0, Math.floor((y - radius) / SPATIAL_CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((x + radius) / SPATIAL_CELL));
    const y1 = Math.min(this.rows - 1, Math.floor((y + radius) / SPATIAL_CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.heads[cy * this.cols + cx]; i !== -1; i = this.next[i]) {
          if (units.alive[i] === 0) continue;
          const dx = units.x[i] - x;
          const dy = units.y[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && visit(i, d2) === true) return;
        }
      }
    }
  }

  /** La criatura más cercana que cumple el filtro, o -1. */
  nearest(units: UnitStore, x: number, y: number, radius: number, accept: (i: number) => boolean): number {
    let best = -1;
    let bestD = Infinity;
    this.forEachInRadius(units, x, y, radius, (i, d2) => {
      if (d2 < bestD && accept(i)) {
        best = i;
        bestD = d2;
      }
    });
    return best;
  }
}
