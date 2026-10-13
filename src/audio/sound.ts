import { RateLimiter, masterGain, type SoundId } from './sound-map';

/**
 * Efectos de sonido sintetizados con WebAudio (osciladores y ruido filtrado): no hay
 * ningún archivo de audio. El contexto se crea con el primer toque o tecla del jugador,
 * como exigen los navegadores. No forma parte de la simulación.
 */
type Wave = OscillatorType;
type Filter = BiquadFilterType;

const NOISE_SECONDS = 2;
const ATTACK = 0.006;
const SILENCE = 0.0001;

/** Una receta dibuja el sonido con tonos y ruidos; `g` es el volumen pedido (0-1). */
type Recipe = (s: SoundEngine, g: number) => void;

/** Arpegio: una nota tras otra. */
function notes(s: SoundEngine, wave: Wave, freqs: readonly number[], step: number, dur: number, g: number): void {
  freqs.forEach((f, k) => s.tone(wave, f, f, dur, g, k * step));
}

const RECIPES: Readonly<Record<SoundId, Recipe>> = {
  click: (s, g) => s.tone('square', 660, 880, 0.04, 0.1 * g),
  brush: (s, g) => s.noise(0.06, 'bandpass', 1800, 900, 0.16 * g),
  spawn: (s, g) => s.tone('sine', 420, 760, 0.09, 0.2 * g),
  lightning: (s, g) => {
    s.noise(0.5, 'highpass', 3000, 400, 0.6 * g);
    s.tone('sawtooth', 160, 40, 0.6, 0.3 * g, 0.03);
  },
  explosion: (s, g) => {
    s.noise(0.9, 'lowpass', 900, 60, 0.8 * g);
    s.tone('sine', 110, 30, 0.8, 0.55 * g);
  },
  rumble: (s, g) => {
    s.noise(1.2, 'lowpass', 160, 50, 0.7 * g);
    s.tone('sine', 55, 35, 1.2, 0.45 * g);
  },
  fire: (s, g) => s.noise(0.35, 'bandpass', 900, 2400, 0.28 * g),
  heal: (s, g) => notes(s, 'sine', [523, 659, 784], 0.08, 0.25, 0.16 * g),
  sparkle: (s, g) => notes(s, 'triangle', [880, 1175, 1568], 0.06, 0.2, 0.14 * g),
  curse: (s, g) => {
    s.tone('sawtooth', 220, 110, 0.5, 0.18 * g);
    s.tone('sine', 233, 116, 0.5, 0.16 * g, 0.04);
  },
  plague: (s, g) => {
    s.noise(0.4, 'bandpass', 400, 200, 0.28 * g);
    s.tone('sine', 180, 140, 0.4, 0.14 * g);
  },
  madness: (s, g) => {
    s.tone('square', 300, 900, 0.12, 0.1 * g);
    s.tone('square', 900, 300, 0.12, 0.1 * g, 0.12);
  },
  hit: (s, g) => {
    s.noise(0.05, 'highpass', 2000, 1200, 0.22 * g);
    s.tone('square', 180, 90, 0.06, 0.12 * g);
  },
  chop: (s, g) => {
    s.noise(0.05, 'bandpass', 700, 300, 0.26 * g);
    s.tone('triangle', 220, 110, 0.05, 0.14 * g);
  },
  mine: (s, g) => {
    s.tone('square', 1400, 900, 0.04, 0.1 * g);
    s.noise(0.03, 'highpass', 4000, 3000, 0.14 * g);
  },
  founded: (s, g) => notes(s, 'sine', [392, 523, 659], 0.1, 0.3, 0.18 * g),
  war: (s, g) => {
    s.tone('sawtooth', 147, 147, 0.5, 0.2 * g);
    s.tone('sawtooth', 196, 196, 0.6, 0.2 * g, 0.35);
    s.noise(0.25, 'lowpass', 200, 80, 0.5 * g);
  },
  peace: (s, g) => notes(s, 'sine', [523, 392, 523], 0.16, 0.4, 0.15 * g),
  crown: (s, g) => notes(s, 'triangle', [392, 523, 659, 784], 0.11, 0.35, 0.16 * g),
  monster: (s, g) => {
    s.tone('sawtooth', 90, 55, 0.7, 0.3 * g);
    s.noise(0.6, 'lowpass', 300, 100, 0.3 * g);
  },
  faith: (s, g) => {
    s.tone('sine', 784, 784, 1, 0.18 * g);
    s.tone('sine', 1568, 1568, 0.6, 0.07 * g);
  },
  discovery: (s, g) => notes(s, 'triangle', [659, 784, 988, 1319], 0.07, 0.22, 0.14 * g),
  fallen: (s, g) => s.tone('sine', 330, 165, 0.8, 0.22 * g),
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly limiter = new RateLimiter();
  private enabled = true;
  private volume = 60;

  /** Aplica los ajustes del jugador (también antes de que exista el contexto de audio). */
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(masterGain(enabled, volume), this.ctx.currentTime);
  }

  /** Crea o reanuda el contexto de audio; hay que llamarlo desde un gesto del jugador. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = masterGain(this.enabled, this.volume);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(this.ctx);
      }
      // Suspendido o interrumpido (móvil en segundo plano, una llamada...): se reanuda con cada gesto.
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    } catch (err) {
      // Sin audio el juego sigue igual.
      console.warn('MiniBox: no se pudo iniciar el sonido', err);
      this.ctx?.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
  }

  /** Reproduce un sonido (si hay audio, está activado y no se acaba de repetir). */
  play(id: SoundId | null, gain = 1): void {
    if (!id || !this.enabled || this.volume <= 0 || !this.ctx || this.ctx.state !== 'running') return;
    if (!this.limiter.allow(id, performance.now())) return;
    try {
      RECIPES[id](this, gain);
    } catch {
      // Un fallo de WebAudio nunca debe cortar el dibujo ni una acción del jugador.
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Envolvente: ataque corto y caída exponencial hasta el silencio. */
  private envelope(ctx: AudioContext, peak: number, start: number, dur: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.linearRampToValueAtTime(Math.max(SILENCE, peak), start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + dur);
    return gain;
  }

  /** Tono que se desliza de `from` a `to` hercios. */
  tone(wave: Wave, from: number, to: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur);
    osc.connect(this.envelope(ctx, gain, start, dur)).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Ruido blanco filtrado; la frecuencia del filtro se desliza de `from` a `to`. */
  noise(dur: number, type: Filter, from: number, to: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur);
    src.connect(filter).connect(this.envelope(ctx, gain, start, dur)).connect(this.master);
    src.start(start, Math.random() * (NOISE_SECONDS - dur - 0.05));
    src.stop(start + dur + 0.02);
  }
}
