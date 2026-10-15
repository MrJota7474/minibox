import type { CivEventType } from '../civ/civ-system';
import type { Command } from '../sim/commands';

/**
 * Qué sonido corresponde a cada cosa que pasa en el juego y cada cuánto puede repetirse.
 * Es lógica pura (sin WebAudio) para poder probarla; el motor está en sound.ts.
 */
export type SoundId =
  | 'click'
  | 'brush'
  | 'spawn'
  | 'lightning'
  | 'explosion'
  | 'rumble'
  | 'fire'
  | 'heal'
  | 'sparkle'
  | 'curse'
  | 'plague'
  | 'madness'
  | 'hit'
  | 'chop'
  | 'mine'
  | 'founded'
  | 'war'
  | 'peace'
  | 'crown'
  | 'monster'
  | 'faith'
  | 'discovery'
  | 'fallen'
  | 'meteor'
  | 'open'
  | 'close'
  | 'tab'
  | 'wave';

/** Intervalo mínimo (ms) entre dos repeticiones del mismo sonido. */
export const MIN_INTERVAL_MS: Readonly<Record<SoundId, number>> = {
  click: 40,
  brush: 90,
  spawn: 90,
  lightning: 120,
  explosion: 150,
  rumble: 900,
  fire: 250,
  heal: 250,
  sparkle: 250,
  curse: 300,
  plague: 300,
  madness: 300,
  hit: 110,
  chop: 160,
  mine: 160,
  founded: 800,
  war: 1200,
  peace: 1200,
  crown: 1200,
  monster: 1500,
  faith: 1200,
  discovery: 1000,
  fallen: 1200,
  meteor: 200,
  open: 120,
  close: 120,
  tab: 60,
  wave: 600,
};

/** Cuánto de cada sonido va al eco (0-1): mucho en los grandes, casi nada en la interfaz. */
export const REVERB_SEND: Readonly<Record<SoundId, number>> = {
  click: 0,
  brush: 0.05,
  spawn: 0.1,
  lightning: 0.55,
  explosion: 0.45,
  rumble: 0.35,
  fire: 0.15,
  heal: 0.4,
  sparkle: 0.35,
  curse: 0.4,
  plague: 0.2,
  madness: 0.3,
  hit: 0.1,
  chop: 0.15,
  mine: 0.2,
  founded: 0.35,
  war: 0.4,
  peace: 0.4,
  crown: 0.45,
  monster: 0.45,
  faith: 0.6,
  discovery: 0.35,
  fallen: 0.4,
  meteor: 0.5,
  open: 0.05,
  close: 0.05,
  tab: 0,
  wave: 0.5,
};

/** Volumen relativo de lo que ocurre fuera de la pantalla. */
export const OFFSCREEN_GAIN = 0.3;
/** Lo que baja el volumen en el borde de la pantalla respecto al centro. */
const EDGE_FALLOFF = 0.35;
/** Panorámica máxima (1 = todo a un lado). */
const MAX_PAN = 0.75;

/** Vista de la cámara en casillas (esquina superior izquierda y tamaño). */
export interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Panorámica (-1 izquierda, 1 derecha) y volumen de un sonido según dónde ocurre: en el
 * centro de la pantalla suena entero, hacia los bordes algo más bajo y fuera, muy bajo.
 */
export function spatialMix(x: number, y: number, view: ViewRect): { pan: number; gain: number } {
  const halfW = Math.max(1e-6, view.width / 2);
  const halfH = Math.max(1e-6, view.height / 2);
  const nx = (x - (view.left + halfW)) / halfW;
  const ny = (y - (view.top + halfH)) / halfH;
  const pan = Math.max(-1, Math.min(1, nx)) * MAX_PAN;
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return { pan, gain: OFFSCREEN_GAIN };
  const dist = Math.min(1, Math.sqrt(nx * nx + ny * ny) / Math.SQRT2);
  return { pan, gain: 1 - EDGE_FALLOFF * dist };
}

/** Avisos visuales de la simulación y partículas de trabajo o combate (ver render/fx.ts). */
const FX_SOUNDS: Readonly<Record<string, SoundId>> = {
  lightning: 'lightning',
  explosion: 'explosion',
  meteor: 'meteor',
  wave: 'wave',
  rain: 'heal',
  offering: 'discovery',
  fertility: 'heal',
  peace: 'peace',
  quake: 'rumble',
  sparkle: 'sparkle',
  curse: 'curse',
  plague: 'plague',
  heal: 'heal',
  madness: 'madness',
  hit: 'hit',
  debris: 'hit',
  chips: 'chop',
  sparks: 'mine',
};

export function soundForFx(kind: string): SoundId | null {
  return FX_SOUNDS[kind] ?? null;
}

const EVENT_SOUNDS: Readonly<Partial<Record<CivEventType, SoundId>>> = {
  founded: 'founded',
  upgraded: 'founded',
  war: 'war',
  rebellion: 'war',
  conquest: 'war',
  peace: 'peace',
  alliance: 'peace',
  king: 'crown',
  dynasty: 'crown',
  fallen: 'fallen',
  abandoned: 'fallen',
  shipwreck: 'fallen',
  era: 'discovery',
  festival: 'discovery',
  fair: 'discovery',
  bandits: 'war',
  culture: 'discovery',
  faith: 'faith',
  monster: 'monster',
};

export function soundForEvent(type: CivEventType): SoundId | null {
  return EVENT_SOUNDS[type] ?? null;
}

/** Sonido de la acción del jugador; los poderes con aviso visual suenan por él (soundForFx). */
export function soundForCommand(c: Command): SoundId | null {
  switch (c.type) {
    case 'brush':
      return 'brush';
    case 'spawn':
    case 'drop':
      return 'spawn';
    case 'grab':
      return 'click';
    case 'power':
      if (c.power === 'fire' || c.power === 'lava') return 'fire';
      if (c.power === 'earthquake' || c.power === 'tornado' || c.power === 'acid-rain' || c.power === 'volcano' || c.power === 'blizzard' || c.power === 'sandstorm' || c.power === 'drought') return 'rumble';
      if (c.power === 'locusts') return 'plague';
      return null;
    default:
      return null;
  }
}

/** Impide que un mismo sonido se repita más a menudo que su intervalo mínimo. */
export class RateLimiter {
  private readonly last = new Map<SoundId, number>();

  allow(id: SoundId, now: number): boolean {
    const before = this.last.get(id);
    if (before !== undefined && now - before < MIN_INTERVAL_MS[id]) return false;
    this.last.set(id, now);
    return true;
  }
}

/** Volumen (0-100) de los ajustes → ganancia del canal principal, con curva suave. */
export function masterGain(enabled: boolean, volume: number): number {
  if (!enabled) return 0;
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * v;
}
