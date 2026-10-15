import type { AmbienceLevels } from './ambience-mix';

/** Lo que el ambiente necesita del motor de sonido para los gorjeos (tonos sueltos). */
interface ToneMaker {
  tone(wave: OscillatorType, from: number, to: number, dur: number, gain: number, delay?: number): void;
}

/** Volumen máximo de cada capa (el ambiente debe quedar por debajo de los efectos). */
const SEA_MAX = 0.16;
const WIND_MAX = 0.1;
const BIRD_GAIN = 0.035;
/** Tiempo (s) con el que los niveles se acercan a su objetivo: cambios suaves al mover la cámara. */
const LEVEL_GLIDE_S = 0.8;
/** Olas: vaivén lento del volumen del mar (respecto a su nivel). */
const WAVE_HZ = 0.12;
const WAVE_DEPTH = 0.45;
/** Rachas: el filtro del viento sube y baja despacio. */
const GUST_HZ = 0.07;
const WIND_FREQ = 520;
const GUST_DEPTH = 260;
/** Probabilidad de un gorjeo en cada actualización (cada ~250 ms) con los pájaros al máximo. */
const CHIRP_CHANCE = 0.3;
/** Probabilidad de un balido o de un aullido por actualización con la capa al máximo. */
const BLEAT_CHANCE = 0.06;
const HOWL_CHANCE = 0.012;
const BLEAT_GAIN = 0.03;
const HOWL_GAIN = 0.04;
/** Noche: probabilidad por actualización con la capa al máximo y volumen de cada voz. */
const CRICKET_CHANCE = 0.9;
const FROG_CHANCE = 0.25;
const OWL_CHANCE = 0.012;
const CRICKET_GAIN = 0.014;
const FROG_GAIN = 0.022;
const OWL_GAIN = 0.04;
/** Desfase máximo (s) con el que arranca cada voz de la noche. */
const VOICE_JITTER_S = 0.2;

interface Layer {
  /** Volumen general de la capa (lo que cambia con la vista). */
  level: GainNode;
  /** Volumen modulado por el vaivén (olas). */
  swell: GainNode;
  filter: BiquadFilterNode;
}

/**
 * Ambiente continuo: olas (ruido grave con vaivén), viento (ruido filtrado con rachas) y
 * gorjeos sueltos de pájaros. Las capas suenan siempre y sólo cambia su volumen.
 */
export class Ambience {
  private readonly sea: Layer;
  private readonly wind: Layer;
  private birds = 0;
  private bleats = 0;
  private howls = 0;
  private crickets = 0;
  private frogs = 0;
  private owls = 0;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    noise: AudioBuffer,
    private readonly tones: ToneMaker,
  ) {
    this.sea = this.layer(noise, 0.93, 'lowpass', 420, out);
    this.wind = this.layer(noise, 1.07, 'bandpass', WIND_FREQ, out);
    this.wind.filter.Q.value = 0.7;
    // Las olas: el volumen oscila entre 1 - WAVE_DEPTH y 1 + WAVE_DEPTH veces el nivel.
    this.modulate(WAVE_HZ, WAVE_DEPTH, this.sea.swell.gain);
    this.modulate(GUST_HZ, GUST_DEPTH, this.wind.filter.frequency);
  }

  /** Una capa: ruido en bucle → filtro → vaivén → volumen (empieza en silencio). */
  private layer(noise: AudioBuffer, rate: number, type: BiquadFilterType, freq: number, out: AudioNode): Layer {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    // Velocidades distintas para que las capas no repitan el mismo ruido a la vez.
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const swell = ctx.createGain();
    swell.gain.value = 1;
    const level = ctx.createGain();
    level.gain.value = 0;
    src.connect(filter).connect(swell).connect(level).connect(out);
    src.start();
    return { level, swell, filter };
  }

  /** Oscilador lento que mueve un parámetro (vaivén de las olas, rachas del viento). */
  private modulate(hz: number, depth: number, param: AudioParam): void {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = hz;
    const amount = this.ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount).connect(param);
    lfo.start();
  }

  /** Acerca cada capa a su nivel y, a veces, suelta un gorjeo. */
  update(levels: AmbienceLevels | null): void {
    const now = this.ctx.currentTime;
    this.sea.level.gain.setTargetAtTime(levels ? levels.sea * SEA_MAX : 0, now, LEVEL_GLIDE_S);
    this.wind.level.gain.setTargetAtTime(levels ? levels.wind * WIND_MAX : 0, now, LEVEL_GLIDE_S);
    this.birds = levels ? levels.birds : 0;
    this.bleats = levels ? levels.bleats : 0;
    this.howls = levels ? levels.howls : 0;
    this.crickets = levels ? levels.crickets : 0;
    this.frogs = levels ? levels.frogs : 0;
    this.owls = levels ? levels.owls : 0;
    if (this.birds > 0.02 && Math.random() < this.birds * CHIRP_CHANCE) this.chirp();
    if (this.bleats > 0.02 && Math.random() < this.bleats * BLEAT_CHANCE) this.bleat();
    if (this.howls > 0 && Math.random() < this.howls * HOWL_CHANCE) this.howl();
    // Con muchos grillos a la vista, a veces cantan dos a la vez.
    if (this.crickets > 0.02 && Math.random() < this.crickets * CRICKET_CHANCE) this.cricket(0);
    if (this.crickets > 0.5 && Math.random() < (this.crickets - 0.5) * CRICKET_CHANCE) this.cricket(0.12);
    if (this.frogs > 0.02 && Math.random() < this.frogs * FROG_CHANCE) this.frog();
    if (this.owls > 0.02 && Math.random() < this.owls * OWL_CHANCE) this.owl();
  }

  /** Grillo: tres o cuatro pulsos muy agudos y secos, cada uno en su tono. */
  private cricket(delay: number): void {
    const f = 4000 + Math.random() * 1200;
    const pulses = 3 + Math.floor(Math.random() * 2);
    const gain = CRICKET_GAIN * (0.5 + this.crickets * 0.5);
    // Un desfase al azar para que los cantos no caigan siempre al ritmo de las actualizaciones.
    const start = delay + Math.random() * VOICE_JITTER_S;
    for (let k = 0; k < pulses; k++) this.tones.tone('sine', f, f * 0.98, 0.025, gain, start + k * 0.045);
  }

  /** Rana: un croar grave hecho de golpecitos rápidos que bajan un poco. */
  private frog(): void {
    const f = 120 + Math.random() * 70;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const gain = FROG_GAIN * (0.5 + this.frogs * 0.5);
    const start = Math.random() * VOICE_JITTER_S;
    for (let k = 0; k < pulses; k++) this.tones.tone('square', f * (1 - k * 0.02), f * 0.9, 0.035, gain, start + k * 0.055);
  }

  /** Búho: «uuu… u-uuu», grave y suave. */
  private owl(): void {
    const f = 330 + Math.random() * 50;
    const gain = OWL_GAIN * this.owls;
    const start = Math.random() * VOICE_JITTER_S;
    this.tones.tone('sine', f, f * 0.94, 0.4, gain, start);
    this.tones.tone('sine', f * 1.02, f * 0.96, 0.16, gain * 0.8, start + 0.62);
    this.tones.tone('sine', f, f * 0.92, 0.45, gain, start + 0.84);
  }

  /** Balido: tres golpes de voz que tiemblan y bajan, cada animal en su tono. */
  private bleat(): void {
    const f = 330 + Math.random() * 160;
    const gain = BLEAT_GAIN * (0.6 + this.bleats * 0.4);
    for (let k = 0; k < 3; k++) {
      const from = f * (1 - k * 0.05);
      this.tones.tone('sawtooth', from, from * 0.92, 0.13, gain, k * 0.11);
      this.tones.tone('square', from * 1.01, from * 0.93, 0.12, gain * 0.35, k * 0.11);
    }
  }

  /** Aullido de lobo: sube despacio, se sostiene y cae. */
  private howl(): void {
    const f = 240 + Math.random() * 60;
    const gain = HOWL_GAIN * this.howls;
    this.tones.tone('sine', f, f * 1.9, 0.6, gain);
    this.tones.tone('sine', f * 1.9, f * 1.6, 1.1, gain, 0.55);
    this.tones.tone('triangle', f * 1.9, f * 1.6, 1.1, gain * 0.3, 0.55);
  }

  /** Gorjeo: dos a cuatro notas agudas que suben, cada pájaro en su tono. */
  private chirp(): void {
    const base = 2200 + Math.random() * 1600;
    const count = 2 + Math.floor(Math.random() * 3);
    const gain = BIRD_GAIN * (0.5 + this.birds * 0.5);
    let delay = 0;
    for (let k = 0; k < count; k++) {
      const f = base * (1 + (Math.random() - 0.3) * 0.15);
      this.tones.tone('sine', f, f * 1.25, 0.06 + Math.random() * 0.04, gain, delay);
      delay += 0.09 + Math.random() * 0.05;
    }
  }
}
