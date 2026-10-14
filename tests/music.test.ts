import { describe, expect, it } from 'vitest';
import { MOOD_STYLES, chordFor, composeBar, midiToHz, moodFor, type Mood } from '../src/audio/music-theory';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { Season } from '../src/world/climate';

/** Azar reproducible para las pruebas. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('ambiente musical', () => {
  it('la guerra o muchos monstruos traen tensión; el invierno, calma lenta; si no, calma', () => {
    expect(moodFor({ wars: 1, monsters: 0, season: Season.SUMMER })).toBe('tension');
    expect(moodFor({ wars: 0, monsters: 6, season: Season.SPRING })).toBe('tension');
    expect(moodFor({ wars: 0, monsters: 2, season: Season.WINTER })).toBe('winter');
    expect(moodFor({ wars: 0, monsters: 0, season: Season.AUTUMN })).toBe('calm');
  });

  it('la música está activada por defecto', () => {
    expect(DEFAULT_SETTINGS.music).toBe(true);
  });
});

describe('composición', () => {
  it('los acordes son tríadas de la escala (do mayor: do-mi-sol, la menor: la-do-mi)', () => {
    expect(chordFor(MOOD_STYLES.calm, 0)).toEqual([60, 64, 67]);
    expect(chordFor(MOOD_STYLES.winter, 0)).toEqual([57, 60, 64]);
    // El acorde del sexto grado de do mayor (la menor) sube de octava donde toca.
    expect(chordFor(MOOD_STYLES.calm, 5)).toEqual([69, 72, 76]);
  });

  it('cada compás trae acorde, bajo y una melodía dentro de la escala pentatónica', () => {
    for (const mood of ['calm', 'winter', 'tension'] as Mood[]) {
      const style = MOOD_STYLES[mood];
      const random = seeded(7);
      let last = 4;
      let melodyNotes = 0;
      for (let bar = 0; bar < 32; bar++) {
        const { notes, lastMelody } = composeBar(style, bar, random, last);
        last = lastMelody;
        expect(notes.filter((n) => n.voice === 'pad')).toHaveLength(3);
        expect(notes.some((n) => n.voice === 'bass' && n.beat === 0)).toBe(true);
        expect(notes.some((n) => n.voice === 'drum')).toBe(style.drums);
        for (const n of notes) {
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat + n.dur).toBeLessThanOrEqual(4);
          expect(n.gain).toBeGreaterThan(0);
          expect(n.gain).toBeLessThanOrEqual(1);
          if (n.voice !== 'melody') continue;
          melodyNotes++;
          const degree = (((n.midi - style.root) % 12) + 12) % 12;
          expect(style.pentatonic).toContain(degree);
        }
      }
      expect(melodyNotes).toBeGreaterThan(10);
    }
  });

  it('con el mismo azar sale la misma música, y la melodía se mueve por pasos cortos', () => {
    const a = composeBar(MOOD_STYLES.calm, 3, seeded(11), 4);
    const b = composeBar(MOOD_STYLES.calm, 3, seeded(11), 4);
    expect(a).toEqual(b);
    const melody = Array.from({ length: 16 }, (_, bar) => composeBar(MOOD_STYLES.calm, bar, seeded(bar + 1), 4).notes.filter((n) => n.voice === 'melody')).flat();
    for (let k = 1; k < melody.length; k++) expect(Math.abs(melody[k].midi - melody[k - 1].midi)).toBeLessThanOrEqual(24);
  });

  it('la invernal es la más lenta y la tensa la más rápida', () => {
    expect(MOOD_STYLES.winter.bpm).toBeLessThan(MOOD_STYLES.calm.bpm);
    expect(MOOD_STYLES.tension.bpm).toBeGreaterThan(MOOD_STYLES.calm.bpm);
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
});
