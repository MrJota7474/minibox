import { MOOD_STYLES, PHRASE_BARS, composeBar, midiToHz, type Mood, type Note } from './music-theory';

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

  /** Ambiente que debe sonar (null = silencio, con fundido). */
  setMood(mood: Mood | null): void {
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
      if (this.bar % PHRASE_BARS === 0 || this.mood === null) this.mood = this.wanted;
      const mood = this.mood;
      if (mood === null) return;
      const style = MOOD_STYLES[mood];
      const beat = 60 / style.bpm;
      const bar = composeBar(style, this.bar, Math.random, this.melody);
      this.melody = bar.lastMelody;
      for (const n of bar.notes) this.play(n, this.nextBar + n.beat * beat, n.dur * beat);
      this.nextBar += 4 * beat;
      this.bar++;
    }
  }

  /** Cada voz es un instrumento sintetizado. */
  private play(n: Note, start: number, dur: number): void {
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
        // Campanilla: nota pulsada con un armónico suave por encima.
        this.osc('triangle', midiToHz(n.midi), start, dur + 0.3, n.gain * 0.22, 0.008, dur + 0.25);
        this.osc('sine', midiToHz(n.midi) * 2, start, dur, n.gain * 0.06, 0.008, dur * 0.6);
        break;
      case 'drum':
        this.drum(start, n.gain);
        break;
    }
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
