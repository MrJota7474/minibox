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
  | 'fallen';

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
};

/** Volumen relativo de lo que ocurre fuera de la pantalla. */
export const OFFSCREEN_GAIN = 0.3;

/** Avisos visuales de la simulación y partículas de trabajo o combate (ver render/fx.ts). */
const FX_SOUNDS: Readonly<Record<string, SoundId>> = {
  lightning: 'lightning',
  explosion: 'explosion',
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
      if (c.power === 'earthquake' || c.power === 'tornado' || c.power === 'acid-rain' || c.power === 'volcano') return 'rumble';
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
