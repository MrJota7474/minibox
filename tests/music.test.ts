import { describe, expect, it } from 'vitest';
import { MOOD_STYLES, chordFor, composeBar, dominantRace, midiToHz, moodFor, styleFor, type Mood } from '../src/audio/music-theory';
import { Species } from '../src/entities/species';
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

describe('música de cada raza', () => {
  it('los humanos usan la música de base; las demás razas cambian escala, instrumento o percusión', () => {
    expect(styleFor('calm', Species.HUMAN)).toBe(MOOD_STYLES.calm);
    expect(styleFor('calm', null)).toBe(MOOD_STYLES.calm);
    const dune = styleFor('calm', Species.DUNEFOLK);
    expect(dune.instrument).toBe('lute');
    expect(dune.handDrum).toBe(true);
    // Hijaz: segunda menor y tercera mayor, también en guerra.
    expect(dune.scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
    expect(styleFor('tension', Species.DUNEFOLK).scale).toEqual(dune.scale);
    expect(styleFor('tension', Species.DUNEFOLK).drums).toBe(true);
    // La lidia de los silvanos sólo en calma; en invierno vuelve la menor, pero con flauta.
    expect(styleFor('calm', Species.SILVAN).scale).toContain(6);
    expect(styleFor('winter', Species.SILVAN).scale).toEqual(MOOD_STYLES.winter.scale);
    expect(styleFor('winter', Species.SILVAN).instrument).toBe('flute');
    expect(styleFor('calm', Species.PETRINO).root).toBeLessThan(MOOD_STYLES.calm.root);
    expect(styleFor('calm', Species.TUSKER).drums).toBe(true);
    expect(styleFor('calm', Species.TUSKER).bpm).toBeGreaterThan(MOOD_STYLES.calm.bpm);
    // Los escamados cantan en pélog en cualquier ambiente.
    expect(styleFor('winter', Species.SCALEFOLK).pentatonic).toEqual([0, 1, 3, 7, 8]);
  });

  it('las progresiones de cada raza dan acordes mayores o menores, nunca aumentados ni disminuidos', () => {
    for (const race of [Species.SILVAN, Species.PETRINO, Species.DUNEFOLK]) {
      for (const mood of ['calm', 'winter', 'tension'] as const) {
        const style = styleFor(mood, race);
        for (const degree of style.progression) {
          const [a, b, c] = chordFor(style, degree);
          const shape = `${b - a}-${c - b}`;
          expect(['4-3', '3-4']).toContain(shape);
        }
      }
    }
  });

  it('con percusión de mano cada compás lleva sus golpes; sin ella, ninguno', () => {
    const with_ = composeBar(styleFor('calm', Species.DUNEFOLK), 0, seeded(3), 4).notes.filter((n) => n.voice === 'handdrum');
    const without = composeBar(MOOD_STYLES.calm, 0, seeded(3), 4).notes.filter((n) => n.voice === 'handdrum');
    expect(with_.length).toBeGreaterThanOrEqual(4);
    expect(without.length).toBe(0);
    for (const n of with_) expect(n.beat).toBeLessThan(4);
  });

  it('manda la raza más poblada a la vista; si no se ve ninguna aldea, la más poblada del mundo', () => {
    const v = (race: number, population: number, cx: number): { alive: boolean; race: number; population: number; cx: number; cy: number } => ({ alive: true, race, population, cx, cy: 10 });
    const view = { left: 0, top: 0, width: 40, height: 40 };
    const villages = [v(Species.HUMAN, 30, 100), v(Species.DUNEFOLK, 8, 10), v(Species.SILVAN, 5, 20)];
    expect(dominantRace(villages, view)).toBe(Species.DUNEFOLK);
    expect(dominantRace(villages, { left: 500, top: 500, width: 10, height: 10 })).toBe(Species.HUMAN);
    expect(dominantRace([], view)).toBeNull();
    expect(dominantRace([{ ...v(Species.TUSKER, 9, 10), alive: false }], view)).toBeNull();
  });
});
