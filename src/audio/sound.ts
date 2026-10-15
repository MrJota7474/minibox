import type { AmbienceLevels } from './ambience-mix';
import { Ambience } from './ambience';
import { Music, SCHEDULE_MS } from './music';
import type { Mood } from './music-theory';
import { REVERB_SEND, RateLimiter, masterGain, type SoundId } from './sound-map';

/**
 * Efectos de sonido sintetizados con WebAudio (osciladores y ruido filtrado): no hay
 * ningún archivo de audio. El contexto se crea con el primer toque o tecla del jugador,
 * como exigen los navegadores. No forma parte de la simulación.
 *
 * Cada sonido pasa por su propio bus: panorámica según dónde ocurre y una parte al eco
 * (una reverberación con respuesta generada por código).
 */
type Wave = OscillatorType;
type Filter = BiquadFilterType;

const NOISE_SECONDS = 2;
const ATTACK = 0.006;
const SILENCE = 0.0001;
/** Duración y caída de la respuesta del eco. */
const REVERB_SECONDS = 1.8;
const REVERB_DECAY = 3;
/** Margen tras el último sonido de una receta antes de soltar su bus. */
const BUS_RELEASE_S = 0.5;

/** Una receta dibuja el sonido con tonos y ruidos; `g` es el volumen pedido (0-1). */
type Recipe = (s: SoundEngine, g: number) => void;

/** Arpegio: una nota tras otra. */
function notes(s: SoundEngine, wave: Wave, freqs: readonly number[], step: number, dur: number, g: number): void {
  freqs.forEach((f, k) => s.tone(wave, f, f, dur, g, k * step));
}

/** Arpegio con una segunda voz una octava más alta y más suave (suena más lleno). */
function bright(s: SoundEngine, freqs: readonly number[], step: number, dur: number, g: number): void {
  notes(s, 'triangle', freqs, step, dur, g);
  notes(
    s,
    'sine',
    freqs.map((f) => f * 2),
    step,
    dur * 0.8,
    g * 0.35,
  );
}

const RECIPES: Readonly<Record<SoundId, Recipe>> = {
  click: (s, g) => {
    s.tone('square', 660, 880, 0.035, 0.07 * g);
    s.tone('sine', 1320, 1320, 0.03, 0.03 * g);
  },
  open: (s, g) => notes(s, 'triangle', [523, 784], 0.05, 0.12, 0.09 * g),
  close: (s, g) => notes(s, 'triangle', [784, 523], 0.05, 0.12, 0.08 * g),
  tab: (s, g) => s.tone('triangle', 1046, 1175, 0.04, 0.06 * g),
  brush: (s, g) => s.noise(0.06, 'bandpass', 1800, 900, 0.16 * g),
  spawn: (s, g) => {
    s.tone('sine', 420, 760, 0.09, 0.18 * g);
    s.tone('triangle', 840, 1520, 0.07, 0.05 * g, 0.02);
  },
  lightning: (s, g) => {
    // Chasquido, zumbido eléctrico y el trueno que rueda después.
    s.noise(0.18, 'highpass', 4000, 800, 0.7 * g);
    s.tone('sawtooth', 900, 120, 0.12, 0.14 * g);
    s.noise(1.6, 'lowpass', 600, 60, 0.45 * g, 0.22);
    s.tone('sine', 70, 38, 1.3, 0.3 * g, 0.22);
  },
  explosion: (s, g) => {
    // Golpe grave, estallido, crujidos y una cola que retumba.
    s.tone('sine', 120, 32, 0.9, 0.6 * g);
    s.noise(1.1, 'lowpass', 1200, 80, 0.8 * g);
    s.noise(0.25, 'highpass', 2500, 1500, 0.25 * g, 0.02);
    s.noise(1.4, 'lowpass', 300, 50, 0.35 * g, 0.15);
  },
  meteor: (s, g) => {
    // Silbido que baja mientras cae (el impacto suena como una explosión).
    s.noise(0.42, 'bandpass', 3200, 300, 0.35 * g);
    s.tone('sawtooth', 900, 180, 0.42, 0.05 * g);
  },
  wave: (s, g) => {
    // Ola: rugido que crece y rompe en espuma.
    s.noise(1.4, 'lowpass', 200, 1400, 0.55 * g);
    s.noise(0.9, 'highpass', 1500, 4000, 0.25 * g, 0.5);
    s.tone('sine', 60, 40, 1.2, 0.3 * g);
  },
  rumble: (s, g) => {
    s.noise(1.2, 'lowpass', 160, 50, 0.7 * g);
    s.tone('sine', 55, 35, 1.2, 0.45 * g);
  },
  fire: (s, g) => {
    s.noise(0.35, 'bandpass', 900, 2400, 0.24 * g);
    s.noise(0.12, 'highpass', 3500, 2500, 0.08 * g, 0.1);
  },
  heal: (s, g) => bright(s, [523, 659, 784], 0.08, 0.25, 0.14 * g),
  sparkle: (s, g) => bright(s, [880, 1175, 1568], 0.06, 0.2, 0.12 * g),
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
    s.noise(0.05, 'bandpass', 700, 300, 0.24 * g);
    s.tone('triangle', 220, 110, 0.05, 0.12 * g);
    s.tone('sine', 300, 150, 0.08, 0.1 * g);
  },
  mine: (s, g) => {
    s.tone('square', 1400, 900, 0.04, 0.1 * g);
    s.tone('sine', 2100, 2000, 0.12, 0.04 * g);
    s.noise(0.03, 'highpass', 4000, 3000, 0.14 * g);
  },
  founded: (s, g) => bright(s, [392, 523, 659], 0.1, 0.3, 0.16 * g),
  war: (s, g) => {
    s.tone('sawtooth', 147, 147, 0.5, 0.2 * g);
    s.tone('sawtooth', 196, 196, 0.6, 0.2 * g, 0.35);
    s.noise(0.25, 'lowpass', 200, 80, 0.5 * g);
    s.noise(0.25, 'lowpass', 200, 80, 0.4 * g, 0.35);
  },
  peace: (s, g) => bright(s, [523, 392, 523], 0.16, 0.4, 0.14 * g),
  crown: (s, g) => bright(s, [392, 523, 659, 784], 0.11, 0.35, 0.15 * g),
  monster: (s, g) => {
    s.tone('sawtooth', 90, 55, 0.7, 0.3 * g);
    s.tone('sawtooth', 93, 57, 0.7, 0.2 * g, 0.03);
    s.noise(0.6, 'lowpass', 300, 100, 0.3 * g);
  },
  faith: (s, g) => {
    s.tone('sine', 784, 784, 1, 0.18 * g);
    s.tone('sine', 1568, 1568, 0.6, 0.07 * g);
    s.tone('sine', 1175, 1175, 0.8, 0.05 * g, 0.1);
  },
  discovery: (s, g) => bright(s, [659, 784, 988, 1319], 0.07, 0.22, 0.13 * g),
  fallen: (s, g) => {
    s.tone('sine', 330, 165, 0.8, 0.22 * g);
    s.tone('triangle', 247, 124, 0.8, 0.08 * g, 0.05);
  },
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambience: Ambience | null = null;
  private music: Music | null = null;
  private musicTimer = 0;
  /** Destino de los tonos y ruidos de la receta que suena ahora (su bus). */
  private out: AudioNode | null = null;
  /** Cuándo termina (en tiempo de audio) lo último que ha programado la receta actual. */
  private recipeEnd = 0;
  private readonly limiter = new RateLimiter();
  private enabled = true;
  private volume = 60;
  /** La página está en segundo plano: el audio se suspende. */
  private background = false;

  /** Aplica los ajustes del jugador (también antes de que exista el contexto de audio). */
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(masterGain(enabled, volume), this.ctx.currentTime);
    this.syncRunning();
  }

  /** En segundo plano el contexto se suspende (no suena el ambiente ni gasta batería). */
  setBackground(hidden: boolean): void {
    this.background = hidden;
    this.syncRunning();
  }

  private get audible(): boolean {
    return this.enabled && this.volume > 0 && !this.background;
  }

  /** Suspende el contexto si no debe sonar nada; si debe, lo reanuda. */
  private syncRunning(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (!this.audible && ctx.state === 'running') ctx.suspend().catch(() => {});
    else if (this.audible && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /** Crea o reanuda el contexto de audio; hay que llamarlo desde un gesto del jugador. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = masterGain(this.enabled, this.volume);
        this.master.connect(ctx.destination);
        this.noiseBuffer = this.makeNoise(ctx);
        this.reverb = this.makeReverb(ctx, this.master);
        try {
          this.ambience = new Ambience(ctx, this.master, this.noiseBuffer, this);
        } catch (err) {
          // Sin ambiente, los efectos siguen sonando.
          console.warn('MiniBox: no se pudo crear el ambiente', err);
          this.ambience = null;
        }
        try {
          const music = new Music(ctx, this.master, this.reverb);
          this.music = music;
          // Un solo temporizador para toda la partida: programa los compases por adelantado.
          this.musicTimer = window.setInterval(() => {
            try {
              if (ctx.state === 'running') music.schedule();
            } catch {
              // Un fallo de la música no debe afectar al juego.
            }
          }, SCHEDULE_MS);
        } catch (err) {
          console.warn('MiniBox: no se pudo crear la música', err);
          this.music = null;
        }
      }
      // Suspendido o interrumpido (móvil en segundo plano, una llamada...): se reanuda con cada gesto,
      // salvo que el sonido esté apagado (entonces se deja dormido).
      this.syncRunning();
    } catch (err) {
      // Sin audio el juego sigue igual.
      console.warn('MiniBox: no se pudo iniciar el sonido', err);
      this.ctx?.close().catch(() => {});
      this.ctx = null;
      this.master = null;
      this.reverb = null;
      this.ambience = null;
      this.music = null;
      window.clearInterval(this.musicTimer);
    }
  }

  /** Reproduce un sonido (si hay audio, está activado y no se acaba de repetir); `pan` va de -1 a 1. */
  play(id: SoundId | null, gain = 1, pan = 0): void {
    if (!id || !this.enabled || this.volume <= 0 || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    if (!this.limiter.allow(id, performance.now())) return;
    const ctx = this.ctx;
    let bus: GainNode | null = null;
    try {
      bus = this.makeBus(ctx, this.master, id, pan);
      this.out = bus;
      this.recipeEnd = ctx.currentTime;
      RECIPES[id](this, gain);
    } catch {
      // Un fallo de WebAudio nunca debe cortar el dibujo ni una acción del jugador.
    } finally {
      this.out = null;
      // Cuando la receta termina (o si ha fallado), el bus se suelta para no acumular nodos.
      if (bus) {
        const done = bus;
        setTimeout(() => done.disconnect(), (this.recipeEnd - ctx.currentTime + BUS_RELEASE_S) * 1000);
      }
    }
  }

  /** Niveles del ambiente (null = silencio). */
  setAmbience(levels: AmbienceLevels | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      this.ambience?.update(levels);
    } catch {
      // El ambiente es un adorno: si falla, se sigue sin él.
    }
  }

  /** Ambiente musical (null = silencio, con fundido). */
  setMusic(mood: Mood | null): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      this.music?.setMood(mood);
    } catch {
      // La música es un adorno: si falla, se sigue sin ella.
    }
  }

  /** Bus de un sonido: panorámica hacia el canal principal y una parte hacia el eco. */
  private makeBus(ctx: AudioContext, master: GainNode, id: SoundId, pan: number): GainNode {
    const bus = ctx.createGain();
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      bus.connect(panner).connect(master);
    } else {
      bus.connect(master);
    }
    const send = REVERB_SEND[id];
    if (send > 0 && this.reverb) {
      const g = ctx.createGain();
      g.gain.value = send;
      bus.connect(g).connect(this.reverb);
    }
    return bus;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Eco: ruido estéreo que se apaga poco a poco, usado como respuesta de una convolución. */
  private makeReverb(ctx: AudioContext, master: GainNode): GainNode {
    const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, REVERB_DECAY);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const input = ctx.createGain();
    input.connect(convolver).connect(master);
    return input;
  }

  /** Envolvente: ataque corto y caída exponencial hasta el silencio. */
  private envelope(ctx: AudioContext, peak: number, start: number, dur: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.linearRampToValueAtTime(Math.max(SILENCE, peak), start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + dur);
    this.recipeEnd = Math.max(this.recipeEnd, start + dur);
    return gain;
  }

  /** Tono que se desliza de `from` a `to` hercios. */
  tone(wave: Wave, from: number, to: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    const out = this.out ?? this.master;
    if (!ctx || !out) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur);
    osc.connect(this.envelope(ctx, gain, start, dur)).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Ruido blanco filtrado; la frecuencia del filtro se desliza de `from` a `to`. */
  noise(dur: number, type: Filter, from: number, to: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    const out = this.out ?? this.master;
    if (!ctx || !out || !this.noiseBuffer) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + dur);
    src.connect(filter).connect(this.envelope(ctx, gain, start, dur)).connect(out);
    src.start(start, Math.random() * Math.max(0, NOISE_SECONDS - dur - 0.05));
    src.stop(start + dur + 0.02);
  }
}
