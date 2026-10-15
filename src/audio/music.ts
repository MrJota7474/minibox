import { PHRASE_BARS, composeBar, midiToHz, styleFor, type Instrument, type Mood, type Note } from './music-theory';

/** Volumen de la música respecto a los efectos (debe quedar de fondo). */
const MUSIC_GAIN = 0.2;
/** Cuánto se adelanta la programación de notas (s) y cada cuánto se revisa (ms). */
const LOOKAHEAD_S = 1.2;
export const SCHEDULE_MS = 250;
/** Parte de la música que va al eco. */
const MUSIC_REVERB = 0.35;
/** Fundido al callar o al volver (s). */
const FADE_S = 1.5;
const SILENCE = 0.0001;

/**
 * Música compuesta mientras se juega: cada compás sale de music-theory.ts y se programa por
 * adelantado con el reloj de WebAudio (preciso aunque el juego vaya a tirones). El ambiente
 * (calma, invierno, tensión) sólo cambia al empezar una frase, así que nunca corta a medias.
 */
export class Music {
  private readonly bus: GainNode;
  private mood: Mood | null = null;
  private wanted: Mood | null = null;
  /** Raza que da color a la música (null = música de base); cambia, como el ambiente, al empezar una frase. */
  private race: number | null = null;
  private wantedRace: number | null = null;
  private bar = 0;
  private nextBar = 0;
  private melody = 4;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    reverb: AudioNode | null,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = SILENCE;
    this.bus.connect(out);
    if (reverb) {
      const send = ctx.createGain();
      send.gain.value = MUSIC_REVERB;
      this.bus.connect(send).connect(reverb);
    }
  }

  /** Ambiente que debe sonar (null = silencio, con fundido) y la raza que le da color. */
  setMood(mood: Mood | null, race: number | null = null): void {
    this.wantedRace = race;
    const now = this.ctx.currentTime;
    if (mood !== null && this.wanted === null) this.bus.gain.setTargetAtTime(MUSIC_GAIN, now, FADE_S / 3);
    if (mood === null && this.wanted !== null) this.bus.gain.setTargetAtTime(SILENCE, now, FADE_S / 3);
    this.wanted = mood;
  }

  /** Programa los compases que empiezan dentro del margen de antelación. */
  schedule(): void {
    const now = this.ctx.currentTime;
    // Callada: no se programa nada más (lo ya programado se apaga con el fundido).
    if (this.wanted === null) {
      this.mood = null;
      return;
    }
    // Tras un silencio (o si el contexto estuvo parado), se empieza un poco más adelante.
    if (this.nextBar < now) {
      this.nextBar = now + 0.1;
      this.bar = 0;
    }
    while (this.nextBar < now + LOOKAHEAD_S) {
      // El ambiente sólo cambia al empezar una frase (o si no sonaba nada).
      if (this.bar % PHRASE_BARS === 0 || this.mood === null) {
        this.mood = this.wanted;
        this.race = this.wantedRace;
      }
      const mood = this.mood;
      if (mood === null) return;
      const style = styleFor(mood, this.race);
      const beat = 60 / style.bpm;
      const bar = composeBar(style, this.bar, Math.random, this.melody);
      this.melody = bar.lastMelody;
      for (const n of bar.notes) this.play(n, this.nextBar + n.beat * beat, n.dur * beat, style.instrument);
      this.nextBar += 4 * beat;
      this.bar++;
    }
  }

  /** Cada voz es un instrumento sintetizado. */
  private play(n: Note, start: number, dur: number, instrument: Instrument): void {
    switch (n.voice) {
      case 'pad':
        // Colchón suave: dos osciladores algo desafinados, con entrada y salida lentas.
        this.osc('triangle', midiToHz(n.midi), start, dur, n.gain * 0.12, dur * 0.35, dur * 0.5);
        this.osc('sine', midiToHz(n.midi) * 1.004, start, dur, n.gain * 0.1, dur * 0.35, dur * 0.5);
        break;
      case 'bass':
        this.osc('sine', midiToHz(n.midi), start, dur, n.gain * 0.35, 0.02, dur * 0.8);
        break;
      case 'melody':
        this.melodyNote(instrument, midiToHz(n.midi), start, dur, n.gain);
        break;
      case 'drum':
        this.drum(start, n.gain);
        break;
      case 'handdrum':
        this.handDrum(start, n.gain);
        break;
    }
  }

  /** La melodía con el instrumento de la raza. */
  private melodyNote(instrument: Instrument, hz: number, start: number, dur: number, gain: number): void {
    switch (instrument) {
      case 'flute':
        // Flauta: entrada suave, casi sin armónicos.
        this.osc('sine', hz, start, dur + 0.15, gain * 0.24, 0.06, dur * 0.5);
        this.osc('sine', hz * 2, start, dur, gain * 0.03, 0.06, dur * 0.5);
        break;
      case 'lute':
        // Laúd: cuerda punteada, brillante al principio y que se apaga deprisa.
        this.osc('triangle', hz, start, dur + 0.2, gain * 0.24, 0.004, dur + 0.15);
        this.osc('square', hz * 2, start, Math.min(dur, 0.18), gain * 0.03, 0.004, 0.14);
        break;
      case 'marimba':
        // Marimba: golpe de madera muy corto con un armónico agudo.
        this.osc('sine', hz, start, Math.min(dur + 0.1, 0.4), gain * 0.28, 0.003, 0.3);
        this.osc('sine', hz * 4, start, 0.08, gain * 0.05, 0.002, 0.06);
        break;
      case 'horn':
        // Trompa: grave y redonda, con entrada lenta.
        this.osc('triangle', hz / 2, start, dur + 0.1, gain * 0.26, 0.05, dur * 0.4);
        this.osc('square', hz / 2, start, dur, gain * 0.025, 0.05, dur * 0.4);
        break;
      default:
        // Campanilla: nota pulsada con un armónico suave por encima.
        this.osc('triangle', hz, start, dur + 0.3, gain * 0.22, 0.008, dur + 0.25);
        this.osc('sine', hz * 2, start, dur, gain * 0.06, 0.008, dur * 0.6);
    }
  }

  /** Pandero o darbuka: golpe agudo y seco. */
  private handDrum(start: number, gain: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, start);
    osc.frequency.exponentialRampToValueAtTime(190, start + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENCE, start);
    env.gain.linearRampToValueAtTime(0.22 * gain, start + 0.003);
    env.gain.exponentialRampToValueAtTime(SILENCE, start + 0.14);
    osc.connect(env).connect(this.bus);
    osc.start(start);
    osc.stop(start + 0.18);
  }

  /** Oscilador con envolvente (ataque, sostén y caída) hacia el bus de la música. */
  private osc(wave: OscillatorType, hz: number, start: number, dur: number, gain: number, attack: number, release: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz;
    const env = ctx.createGain();
    const peak = Math.max(SILENCE, gain);
    env.gain.setValueAtTime(SILENCE, start);
    env.gain.linearRampToValueAtTime(peak, start + attack);
    env.gain.setValueAtTime(peak, Math.max(start + attack, start + dur - release));
    env.gain.exponentialRampToValueAtTime(SILENCE, start + dur);
    osc.connect(env).connect(this.bus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** Tambor grave: un tono que cae rápido. */
  private drum(start: number, gain: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.25);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENCE, start);
    env.gain.linearRampToValueAtTime(0.45 * gain, start + 0.005);
    env.gain.exponentialRampToValueAtTime(SILENCE, start + 0.35);
    osc.connect(env).connect(this.bus);
    osc.start(start);
    osc.stop(start + 0.4);
  }
}
