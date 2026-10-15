import { Species } from '../entities/species';
import { Season } from '../world/climate';

/**
 * Composición de la música: qué tono, qué acordes y qué melodía suenan en cada compás.
 * Es lógica pura (el azar llega como función) para poder probarla; el motor que la hace
 * sonar está en music.ts. No forma parte de la simulación.
 */
export type Mood = 'calm' | 'winter' | 'tension';
export type Voice = 'pad' | 'bass' | 'melody' | 'drum' | 'handdrum';
/** Instrumento de la melodía: cada raza tiene el suyo. */
export type Instrument = 'bell' | 'flute' | 'lute' | 'marimba' | 'horn';

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
  /** Percusión de mano (pandero o darbuka) con un ritmo propio. */
  handDrum: boolean;
  instrument: Instrument;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const MOOD_STYLES: Readonly<Record<Mood, MoodStyle>> = {
  // Paz: do mayor, I-vi-IV-V, melodía alegre y frecuente.
  calm: { bpm: 76, root: 60, scale: MAJOR, pentatonic: [0, 2, 4, 7, 9], progression: [0, 5, 3, 4], melodyChance: 0.42, walkingBass: true, drums: false, handDrum: false, instrument: 'bell' },
  // Invierno: la menor, lento y escaso.
  winter: { bpm: 58, root: 57, scale: MINOR, pentatonic: [0, 3, 5, 7, 10], progression: [0, 5, 2, 6], melodyChance: 0.26, walkingBass: false, drums: false, handDrum: false, instrument: 'bell' },
  // Guerra o monstruos: la menor, más rápido, con tambor grave.
  tension: { bpm: 92, root: 57, scale: MINOR, pentatonic: [0, 3, 5, 7, 10], progression: [0, 0, 5, 6], melodyChance: 0.38, walkingBass: true, drums: true, handDrum: false, instrument: 'bell' },
};

/** Lo que cada raza cambia de la música: escala, tempo, registro e instrumentos. */
interface RaceFlavor {
  scale?: readonly number[];
  pentatonic?: readonly number[];
  /** Acordes propios: con escalas no mayores ni menores, los de base darían tríadas raras. */
  progression?: readonly number[];
  /** Si su escala suena también en invierno y en guerra (si no, sólo en calma). */
  allMoods?: boolean;
  rootShift?: number;
  bpmMul?: number;
  drums?: boolean;
  handDrum?: boolean;
  instrument: Instrument;
}

const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
/** Hijaz (frigio dominante): la segunda menor y la tercera mayor le dan su aire del desierto. */
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
/** Pélog: pentatónica de semitonos y saltos, la del gamelán. */
const PELOG = [0, 1, 3, 7, 8];

/** Los humanos usan la música base (campanillas); las demás razas, su propio color. */
export const RACE_FLAVORS: Readonly<Record<number, RaceFlavor>> = {
  // Silvanos: lidia luminosa con flauta, algo más lenta; I-II-I-vi (el II mayor es su sello).
  [Species.SILVAN]: { scale: LYDIAN, pentatonic: [0, 2, 4, 6, 9], progression: [0, 1, 0, 5], bpmMul: 0.92, instrument: 'flute' },
  // Petrinos: dórica grave con trompa, una cuarta más abajo; i-IV-i-VII.
  [Species.PETRINO]: { scale: DORIAN, pentatonic: [0, 3, 5, 7, 9], progression: [0, 3, 0, 6], allMoods: true, rootShift: -5, instrument: 'horn' },
  // Colmilludos: más deprisa y siempre con tambor.
  [Species.TUSKER]: { bpmMul: 1.08, drums: true, instrument: 'horn' },
  // Escamados: melodía en pélog (pentatónica de gamelán) con marimba y pandero, sobre los acordes de base.
  [Species.SCALEFOLK]: { pentatonic: PELOG, allMoods: true, handDrum: true, instrument: 'marimba' },
  // Dunarios: escala hijaz con laúd punteado y darbuka; I-bII-I-iv.
  [Species.DUNEFOLK]: { scale: HIJAZ, pentatonic: HIJAZ, progression: [0, 1, 0, 3], allMoods: true, handDrum: true, instrument: 'lute' },
};

/** Estilo de un ambiente con el color de una raza (o el de base si no hay raza). */
export function styleFor(mood: Mood, race: number | null): MoodStyle {
  const base = MOOD_STYLES[mood];
  const f = race === null ? undefined : RACE_FLAVORS[race];
  if (!f) return base;
  const tonal = mood === 'calm' || f.allMoods === true;
  return {
    ...base,
    bpm: Math.round(base.bpm * (f.bpmMul ?? 1)),
    root: base.root + (f.rootShift ?? 0),
    scale: tonal && f.scale ? f.scale : base.scale,
    pentatonic: tonal && f.pentatonic ? f.pentatonic : base.pentatonic,
    progression: tonal && f.progression ? f.progression : base.progression,
    drums: base.drums || f.drums === true,
    handDrum: f.handDrum === true,
    instrument: f.instrument,
  };
}

/** Lo que la música necesita saber de una aldea. */
export interface VillageSound {
  alive: boolean;
  race: number;
  population: number;
  cx: number;
  cy: number;
}

/**
 * Raza que marca la música: la más poblada entre las aldeas a la vista y, si no se ve
 * ninguna, la más poblada del mundo. Sin aldeas, null (música de base).
 */
export function dominantRace(villages: readonly VillageSound[], view: { left: number; top: number; width: number; height: number }): number | null {
  const seen = new Map<number, number>();
  const all = new Map<number, number>();
  for (const v of villages) {
    if (!v.alive || v.population <= 0) continue;
    all.set(v.race, (all.get(v.race) ?? 0) + v.population);
    if (v.cx >= view.left && v.cy >= view.top && v.cx < view.left + view.width && v.cy < view.top + view.height) seen.set(v.race, (seen.get(v.race) ?? 0) + v.population);
  }
  const pick = (m: Map<number, number>): number | null => {
    let best: number | null = null;
    let most = 0;
    // A igual población gana el número de especie menor (resultado estable).
    for (const [race, pop] of m) if (pop > most || (pop === most && best !== null && race < best)) [best, most] = [race, pop];
    return best;
  };
  return pick(seen) ?? pick(all);
}

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
  if (style.handDrum) {
    // Ritmo de mano: golpe fuerte al empezar, síncopa y adorno al azar al final.
    for (const [beat, gain] of [[0, 1], [1.5, 0.6], [2, 0.8], [3, 0.6]] as const) notes.push({ voice: 'handdrum', beat, midi: 0, dur: 0.25, gain });
    if (random() < 0.5) notes.push({ voice: 'handdrum', beat: 3.5, midi: 0, dur: 0.25, gain: 0.45 });
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
