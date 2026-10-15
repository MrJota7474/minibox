import { Job } from '../civ/model';
import { SPECIES } from '../entities/species';
import { UnitState, type UnitStore } from '../entities/units';

/** Distancia (en casillas) a la que el dromedario de carga sigue al mercader. */
export const CARAVAN_GAP = 0.6;
/** Cuánto se acerca la dirección guardada a la nueva en cada fotograma (suaviza los giros). */
const TURN_EASE = 0.2;

/**
 * Los mercaderes de una raza comerciante (los dunarios) viajan con un dromedario de carga,
 * a la ida (en camino) y a la vuelta (con lo que traen). Es sólo dibujo: la carga doble ya es
 * el rasgo `trade` de su raza.
 */
export function leadsCaravan(u: UnitStore, i: number): boolean {
  if (u.job[i] !== Job.MERCHANT || (SPECIES[u.species[i]]?.race?.trade ?? 1) <= 1) return false;
  return u.state[i] === UnitState.TRADE || u.carry[i] !== 0;
}

/** Ticks sin dibujarse tras los que el rumbo guardado ya no vale (salió de la vista, se cargó otra partida...). */
const STALE_TICKS = 30;

/** Posición del dromedario detrás de su mercader, con la dirección de marcha suavizada. */
export class CaravanTrail {
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  /** De quién es el rumbo guardado (los índices de las criaturas muertas se reutilizan) y cuándo se usó. */
  private readonly owner: Float64Array;
  private readonly lastTick: Float64Array;

  constructor(capacity: number) {
    this.dx = new Float32Array(capacity);
    this.dy = new Float32Array(capacity);
    this.owner = new Float64Array(capacity).fill(-1);
    this.lastTick = new Float64Array(capacity);
  }

  /**
   * `(x, y)` es el mercader y `(mx, my)` su último paso; si está quieto se mantiene el rumbo.
   * `handle` identifica a la criatura y `tick` es el del mundo: con otro dueño o un rumbo viejo
   * se empieza de nuevo según hacia dónde camina.
   */
  follow(i: number, handle: number, tick: number, x: number, y: number, mx: number, my: number): { x: number; y: number; flip: boolean } {
    if (this.owner[i] !== handle || Math.abs(tick - this.lastTick[i]) > STALE_TICKS) {
      this.owner[i] = handle;
      this.dx[i] = 0;
      this.dy[i] = 0;
    }
    this.lastTick[i] = tick;
    const len = Math.sqrt(mx * mx + my * my);
    let dx = this.dx[i];
    let dy = this.dy[i];
    if (dx === 0 && dy === 0) {
      dx = len > 0 ? mx / len : 1;
      dy = len > 0 ? my / len : 0;
    } else if (len > 0) {
      // Sin normalizar: en una media vuelta el vector encoge y cambia de signo, y el dromedario
      // pasa al otro lado en unos pasos (normalizado, una vuelta exacta de 180° nunca giraría).
      dx += (mx / len - dx) * TURN_EASE;
      dy += (my / len - dy) * TURN_EASE;
    }
    this.dx[i] = dx;
    this.dy[i] = dy;
    return { x: x - dx * CARAVAN_GAP, y: y - dy * CARAVAN_GAP, flip: dx < 0 };
  }
}
