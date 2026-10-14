import { Season } from '../world/climate';

/**
 * Composición de la música: qué tono, qué acordes y qué melodía suenan en cada compás.
 * Es lógica pura (el azar llega como función) para poder probarla; el motor que la hace
 * sonar está en music.ts. No forma parte de la simulación.
 */
export type Mood = 'calm' | 'winter' | 'tension';
export type Voice = 'pad' | 'bass' | 'melody' | 'drum';

export interface Note {
  voice: Voice;
  /** Pulso dentro del compás (0-4). */
  beat: number;
  /** Nota MIDI (60 = do central). */
  midi: number;
  /** Duración en pulsos. */
  dur: number;
  /** Volumen relativo (0-1). */
  gain: number;
}

export interface MoodStyle {
  bpm: number;
  /** Tónica en MIDI. */
  root: number;
  /** Escala completa (para los acordes) y pentatónica (para la melodía), en semitonos. */
  scale: readonly number[];
  pentatonic: readonly number[];
  /** Grados de la escala sobre los que se forma el acorde de cada compás (ciclo). */
  progression: readonly number[];
  /** Probabilidad de que suene una nota de la melodía en cada corchea. */
  melodyChance: number;
  /** El bajo toca en el pulso 1, y también en el 3 si es true. */
  walkingBass: boolean;
  drums: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const MOOD_STYLES: Readonly<Record<Mood, MoodStyle>> = {
  // Paz: do mayor, I-vi-IV-V, melodía alegre y frecuente.
  calm: { bpm: 76, root: 60, scale: MAJOR, pentatonic: [0, 2, 4, 7, 9], progression: [0, 5, 3, 4], melodyChance: 0.42, walkingBass: true, drums: false },
  // Invierno: la menor, lento y escaso.
  winter: { bpm: 58, root: 57, scale: MINOR, pentatonic: [0, 3, 5, 7, 10], progression: [0, 5, 2, 6], melodyChance: 0.26, walkingBass: false, drums: false },
  // Guerra o monstruos: la menor, más rápido, con tambor grave.
  tension: { bpm: 92, root: 57, scale: MINOR, pentatonic: [0, 3, 5, 7, 10], progression: [0, 0, 5, 6], melodyChance: 0.38, walkingBass: true, drums: true },
};

/** Compases de cada frase: el ambiente sólo cambia al empezar una. */
export const PHRASE_BARS = 8;
/** Monstruos en el mundo a partir de los cuales la música se vuelve tensa. */
const TENSION_MONSTERS = 6;

/** Qué ambiente musical toca según cómo va el mundo. */
export function moodFor(state: { wars: number; monsters: number; season: number }): Mood {
  if (state.wars > 0 || state.monsters >= TENSION_MONSTERS) return 'tension';
  if (state.season === Season.WINTER) return 'winter';
  return 'calm';
}

/** Tríada (tres notas MIDI) del grado de la escala, en la octava de la tónica. */
export function chordFor(style: MoodStyle, degree: number): number[] {
  const s = style.scale;
  const note = (k: number): number => style.root + s[k % s.length] + 12 * Math.floor(k / s.length);
  return [note(degree), note(degree + 2), note(degree + 4)];
}

/** Frecuencia en hercios de una nota MIDI. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Notas de un compás. `prevMelody` es el índice de la última nota de la melodía en la escala
 * pentatónica (la melodía se mueve casi siempre por pasos cercanos); devuelve el nuevo.
 */
export function composeBar(style: MoodStyle, bar: number, random: () => number, prevMelody: number): { notes: Note[]; lastMelody: number } {
  const notes: Note[] = [];
  const chord = chordFor(style, style.progression[bar % style.progression.length]);
  // Acorde tenido todo el compás, una octava por debajo de la melodía.
  for (const m of chord) notes.push({ voice: 'pad', beat: 0, midi: m - 12, dur: 4, gain: 0.5 });
  notes.push({ voice: 'bass', beat: 0, midi: chord[0] - 24, dur: style.walkingBass ? 2 : 4, gain: 0.8 });
  if (style.walkingBass) notes.push({ voice: 'bass', beat: 2, midi: chord[random() < 0.5 ? 0 : 2] - 24, dur: 2, gain: 0.65 });
  if (style.drums) {
    notes.push({ voice: 'drum', beat: 0, midi: 0, dur: 0.5, gain: 1 });
    notes.push({ voice: 'drum', beat: 2, midi: 0, dur: 0.5, gain: 0.8 });
    if (random() < 0.5) notes.push({ voice: 'drum', beat: 3.5, midi: 0, dur: 0.25, gain: 0.5 });
  }
  // Melodía: corcheas sueltas sobre la pentatónica, dos octavas posibles.
  const steps = style.pentatonic.length * 2;
  let idx = Math.max(0, Math.min(steps - 1, prevMelody));
  for (let k = 0; k < 8; k++) {
    if (random() >= style.melodyChance) continue;
    const move = Math.floor(random() * 5) - 2;
    idx = Math.max(0, Math.min(steps - 1, idx + move));
    const midi = style.root + style.pentatonic[idx % style.pentatonic.length] + 12 * Math.floor(idx / style.pentatonic.length);
    // A veces una nota más larga, para que respire (sin pasarse del compás).
    const dur = random() < 0.25 ? Math.min(1, 4 - k * 0.5) : 0.5;
    notes.push({ voice: 'melody', beat: k * 0.5, midi, dur, gain: 0.6 + random() * 0.3 });
  }
  return { notes, lastMelody: idx };
}
