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
    if (this.birds > 0.02 && Math.random() < this.birds * CHIRP_CHANCE) this.chirp();
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
