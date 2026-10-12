import type { SpeciesId } from '../entities/species';

/** Pinceles que modifican el mapa. */
export type BrushToolId =
  | 'deep'
  | 'ocean'
  | 'water'
  | 'sand'
  | 'soil'
  | 'hills'
  | 'mountain'
  | 'raise'
  | 'lower'
  | 'sponge'
  | 'grass'
  | 'forest'
  | 'desert'
  | 'tree'
  | 'bush'
  | 'clear-flora';

/**
 * Acciones del jugador sobre la simulación. Son datos planos (serializables)
 * para poder grabarlas y reproducir una partida de forma idéntica.
 */
export type Command =
  | { readonly type: 'brush'; readonly tool: BrushToolId; readonly x: number; readonly y: number; readonly size: number }
  | { readonly type: 'spawn'; readonly species: SpeciesId; readonly x: number; readonly y: number; readonly size: number }
  /** Cambia el límite de criaturas (p. ej. el ajuste automático de rendimiento). */
  | { readonly type: 'limit'; readonly value: number };

export interface LoggedCommand {
  readonly tick: number;
  readonly command: Command;
}

export interface CommandResult {
  /** Criaturas creadas (sólo para 'spawn'). */
  spawned: number;
  /** true si no se pudo crear alguna por el límite de criaturas. */
  limited: boolean;
}
