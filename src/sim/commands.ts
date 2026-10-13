import type { SpeciesId } from '../entities/species';
import type { PowerId } from '../powers/disasters';
import type { LawId } from './laws';

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
  | 'snow'
  | 'swamp'
  | 'jungle'
  | 'savanna'
  | 'grove'
  | 'blight'
  | 'tree'
  | 'bush'
  | 'clear-flora'
  | 'road';

/**
 * Acciones del jugador sobre la simulación. Son datos planos (serializables)
 * para poder grabarlas y reproducir una partida de forma idéntica.
 */
export type Command =
  | { readonly type: 'brush'; readonly tool: BrushToolId; readonly x: number; readonly y: number; readonly size: number }
  | { readonly type: 'spawn'; readonly species: SpeciesId; readonly x: number; readonly y: number; readonly size: number }
  /** Cambia el límite de criaturas (p. ej. el ajuste automático de rendimiento). */
  | { readonly type: 'limit'; readonly value: number }
  /** Poderes de dios sobre la diplomacia: a y b son reinos (en 'rebellion', a es una aldea). */
  | { readonly type: 'diplomacy'; readonly action: DiplomacyAction; readonly a: number; readonly b: number }
  /** Desastres y poderes de dios. */
  | { readonly type: 'power'; readonly power: PowerId; readonly x: number; readonly y: number; readonly size: number }
  /** Imán divino: coger criaturas y soltarlas en otro sitio. */
  | { readonly type: 'grab'; readonly x: number; readonly y: number; readonly size: number }
  | { readonly type: 'drop'; readonly x: number; readonly y: number }
  /** Poder de dios: imponer una era (ver world/climate.ts). */
  | { readonly type: 'era'; readonly era: number }
  /** Duración de cada estación (ticks; ver SEASON_LENGTHS). */
  | { readonly type: 'seasonLength'; readonly ticks: number }
  /** Leyes del mundo. */
  | { readonly type: 'law'; readonly law: LawId; readonly value: boolean };

export type DiplomacyAction = 'war' | 'peace' | 'alliance' | 'rebellion';

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
