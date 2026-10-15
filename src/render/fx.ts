import { festiveLook } from './festive-look';
import type { CivSystem } from '../civ/civ-system';
import { BuildingType } from '../civ/model';
import { Species, isMonster } from '../entities/species';
import { UnitState, type UnitStore } from '../entities/units';
import type { FxEvent, PowerSystem } from '../powers/disasters';
import type { HazardSystem } from '../powers/hazards';
import { Status } from '../powers/status';
import { Season } from '../world/climate';
import { Biome, Flora } from '../world/terrain';
import type { World } from '../world/world';
import type { Camera } from './camera';

/**
 * Efectos puramente visuales (no afectan a la simulación, así que pueden usar Math.random):
 * fuego animado, rayos con resplandor, ondas expansivas, tornados, nubes, partículas con
 * forma (corazones, cruces, burbujas, calaveras) y vida en el mapa (astillas al talar,
 * chispas al picar, golpes, humo de chimeneas, estados de las criaturas).
 */
type Shape = 'square' | 'heart' | 'cross' | 'bubble' | 'skull' | 'star' | 'drop';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Aceleración vertical (gravedad > 0, flotar < 0). */
  ay: number;
  life: number;
  max: number;
  color: string;
  size: number;
  shape: Shape;
  /** Aparece poco a poco (copos, hojas...). */
  fadeIn?: boolean;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  /** Tiempo transcurrido; si empieza en negativo, la onda sale con retraso. */
  t: number;
  color: string;
}

/** Meteorito que cae hacia su punto de impacto (en casillas). */
interface Meteor {
  x: number;
  y: number;
  r: number;
  t: number;
}

/** Segundos que tarda el meteorito en caer. */
const METEOR_FALL_S = 0.42;

/** Partículas a la vez como máximo (las del tiempo meteorológico van aparte, hasta MAX_WEATHER). */
const MAX_PARTICLES = 3000;
const MAX_FIRE_TILES = 4000;
/** Partículas de ambiente por frame como máximo (talar, chimeneas, estados...). */
const AMBIENT_BUDGET = 40;

const STAMPS: Readonly<Record<Exclude<Shape, 'square' | 'drop'>, readonly string[]>> = {
  heart: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'],
  cross: ['.x.', 'xxx', '.x.'],
  bubble: ['.x.', 'x.x', '.x.'],
  skull: ['.xxx.', 'x.x.x', 'xxxxx', '.x.x.'],
  star: ['..x..', '.xxx.', 'xxxxx', '.xxx.', '..x..'],
};

interface Style {
  colors: readonly string[];
  shape: Shape;
  speed: number;
  rise: number;
  gravity: number;
  /** Tamaño fijo (en casillas) de las partículas cuadradas; si falta, varía al azar. */
  size?: number;
}

const STYLES: Readonly<Record<string, Style>> = {
  explosion: { colors: ['#ffd04a', '#ff8a2a', '#e84a1a', '#fff2b0'], shape: 'square', speed: 6, rise: -1, gravity: 4 },
  debris: { colors: ['#5a4a40', '#7a6a5a', '#3a2e26'], shape: 'square', speed: 5, rise: -4, gravity: 10 },
  smoke: { colors: ['#6a6a6a', '#8a8a8a', '#4a4a4a'], shape: 'square', speed: 0.6, rise: -1.6, gravity: 0 },
  sparkle: { colors: ['#fff6b0', '#ffd04a', '#ffffff'], shape: 'star', speed: 2.5, rise: -1, gravity: 0 },
  heal: { colors: ['#ffffff', '#c8f0ff', '#9be38a'], shape: 'cross', speed: 1, rise: -1.6, gravity: 0 },
  // Festejos (ver festive-look.ts): «rise» negativo sube, «gravity» positiva hace caer.
  festive: { colors: ['#ff5a6a', '#ffd04a', '#5ad0ff', '#a0ff6a', '#ff9af0', '#ffffff'], shape: 'square', speed: 1.3, rise: -2.4, gravity: 1.8, size: 0.14 },
  lantern: { colors: ['#ffcf6a', '#ffb04a', '#ffe8a0'], shape: 'square', speed: 0.25, rise: -0.7, gravity: 0, size: 0.22 },
  firework: { colors: ['#ffd04a', '#ff5a6a', '#5ad0ff', '#ffffff', '#a0ff6a'], shape: 'star', speed: 5, rise: -0.4, gravity: 1.6 },
  feastEmber: { colors: ['#ff6a2a', '#ffb03a', '#ff3a1a'], shape: 'square', speed: 1, rise: -2.6, gravity: 0.7, size: 0.1 },
  firefly: { colors: ['#a0ffe0', '#60f0c0', '#e0ffa0'], shape: 'square', speed: 0.7, rise: -0.15, gravity: 0, size: 0.08 },
  incense: { colors: ['#c8b0e0', '#e0d0f0', '#ffd04a'], shape: 'square', speed: 0.4, rise: -1.1, gravity: 0, size: 0.16 },
  curse: { colors: ['#a35ce8', '#6a2aa8', '#d090ff'], shape: 'skull', speed: 1, rise: -1.2, gravity: 0 },
  plague: { colors: ['#8be04a', '#5aa82a', '#c8f08a'], shape: 'bubble', speed: 1, rise: -1.2, gravity: 0 },
  madness: { colors: ['#ff3a3a', '#a81a1a', '#ff8a8a'], shape: 'star', speed: 2, rise: -0.8, gravity: 0 },
  ember: { colors: ['#ffd04a', '#ff8a2a', '#ff6a1a'], shape: 'square', speed: 0.4, rise: -1.4, gravity: 0 },
  chips: { colors: ['#b07a43', '#8a5a2a', '#d8a868'], shape: 'square', speed: 2, rise: -2.5, gravity: 9 },
  sparks: { colors: ['#ffe28a', '#ffffff', '#ffb04a'], shape: 'square', speed: 2.5, rise: -2, gravity: 8 },
  dirt: { colors: ['#6b4a2a', '#8a6a3a'], shape: 'square', speed: 1.2, rise: -1.5, gravity: 8 },
  hit: { colors: ['#ffffff', '#ff5a5a', '#ffd04a'], shape: 'star', speed: 2.5, rise: -1, gravity: 2 },
  hearts: { colors: ['#ff6a8a', '#ff9ab0'], shape: 'heart', speed: 0.4, rise: -1.2, gravity: 0 },
  blessing: { colors: ['#fff2a0', '#ffd04a'], shape: 'square', speed: 0.3, rise: -0.9, gravity: 0 },
  wisp: { colors: ['#b9a6e0', '#8c7cb4', '#9cf0c0'], shape: 'square', speed: 0.3, rise: -0.7, gravity: 0, size: 0.14 },
  mud: { colors: ['#6a6338', '#454226', '#5f8a34'], shape: 'square', speed: 0.8, rise: -1, gravity: 7, size: 0.16 },
  blightMote: { colors: ['#7a4f86', '#4a2f55', '#a878b8'], shape: 'square', speed: 0.15, rise: -0.5, gravity: 0, size: 0.1 },
  groveMote: { colors: ['#c8fff0', '#7fe8c8', '#ffffff'], shape: 'square', speed: 0.2, rise: -0.6, gravity: 0, size: 0.1 },
  rocks: { colors: ['#4a3e36', '#6a5a4c', '#2e2622', '#ff8a2a'], shape: 'square', speed: 9, rise: -6, gravity: 14, size: 0.3 },
  dust: { colors: ['#a8957a', '#8a7a64', '#c4b498'], shape: 'square', speed: 2.2, rise: -0.4, gravity: 0, size: 0.45 },
  puff: { colors: ['#ece6da', '#cfc7b8', '#aba394'], shape: 'square', speed: 0.9, rise: -0.9, gravity: 0, size: 0.2 },
  spray: { colors: ['#eef6ff', '#c8e4ff', '#8ac0f0', '#4a8ad0'], shape: 'square', speed: 5, rise: -4, gravity: 9, size: 0.22 },
  sprout: { colors: ['#9be38a', '#62ab3b', '#c8f08a'], shape: 'square', speed: 0.8, rise: -1.4, gravity: 0, size: 0.16 },
  gold: { colors: ['#ffd04a', '#fff2a0', '#f2c14e'], shape: 'star', speed: 2.2, rise: -1.6, gravity: 1 },
  snowfall: { colors: ['#ffffff', '#e8f0f6', '#c8e4ff'], shape: 'square', speed: 0.6, rise: 0.6, gravity: 0.4, size: 0.15 },
  leaf: { colors: ['#62c03b', '#9be38a', '#3f9a3a', '#d8f0a0'], shape: 'square', speed: 0.6, rise: 0.9, gravity: 0.2, size: 0.12 },
  sand: { colors: ['#e8c890', '#d8b070', '#c89a58', '#f0dcb0'], shape: 'square', speed: 1.4, rise: 0.2, gravity: 0.1, size: 0.12 },
  swarm: { colors: ['#5a4a20', '#8a7a30', '#3a2e14'], shape: 'square', speed: 2.4, rise: 0, gravity: 0, size: 0.1 },
};
/** Nombres de los estilos de partícula (para comprobar que los festejos usan estilos que existen). */
export const PARTICLE_STYLES: readonly string[] = Object.keys(STYLES);
/** Partículas con las que aparece cada monstruo recién nacido. */
const BIRTH_FX: Readonly<Record<number, string>> = { [Species.PENANTE]: 'curse', [Species.ESCORIO]: 'explosion', [Species.CENAGOSO]: 'mud' };
/** Casillas a la vista que se miran por frame en busca de biomas mágicos. */
const MOTE_TRIES = 6;
const MOTE_MIN_ZOOM = 6;
/** Daño a partir del cual un edificio humea. */
const SMOKING_BURN = 8;

/** Tiempo de cada estación: copos, hojas, pétalos o lluvia (en los biomas cálidos). */
interface Weather {
  colors: readonly string[];
  shape: Shape;
  /** Partículas nuevas por frame y por cada 1000 casillas a la vista. */
  rate: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}
const WEATHER: Readonly<Record<string, Weather>> = {
  snow: { colors: ['#ffffff', '#e8f0f6'], shape: 'square', rate: 0.9, vx: 0.4, vy: 1.4, life: 3.5, size: 0.14 },
  rain: { colors: ['rgba(170,200,255,0.8)'], shape: 'drop', rate: 1.2, vx: 0.6, vy: 11, life: 0.5, size: 1 },
  leaves: { colors: ['#d89a34', '#c8742a', '#a8582a', '#e8b84a'], shape: 'square', rate: 0.35, vx: 1.6, vy: 1, life: 4, size: 0.16 },
  petals: { colors: ['#f4b6c8', '#ffffff', '#f8d0dc'], shape: 'square', rate: 0.25, vx: 0.9, vy: 0.7, life: 4, size: 0.12 },
};
/** Partículas de tiempo como máximo a la vez. */
const MAX_WEATHER = 500;
const WARM_BIOMES = new Set<number>([Biome.DESERT, Biome.JUNGLE, Biome.SAVANNA]);

/** Llamas en pixel art (3 cuadros de 6×8). */
const FLAME_FRAMES: readonly (readonly string[])[] = [
  ['..y...', '..yy..', '.yoy..', '.ooy..', 'orroo.', 'orrro.', '.rrrr.', '..rr..'],
  ['...y..', '..yy..', '..yoy.', '..yoo.', '.ooro.', 'orrro.', '.rrrr.', '..rr..'],
  ['..y...', '.yy...', '.yoy..', '.yoo..', '.orroo', '.orrro', '.rrrr.', '..rr..'],
];
const FLAME_COLORS: Readonly<Record<string, string>> = { y: '#ffe27a', o: '#ff9a2a', r: '#e84a1a' };

function buildFlames(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 6 * FLAME_FRAMES.length;
  c.height = 8;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  FLAME_FRAMES.forEach((rows, f) => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = FLAME_COLORS[ch];
        ctx.fillRect(f * 6 + x, y, 1, 1);
      });
    });
  });
  return c;
}

export class FxLayer {
  private particles: Particle[] = [];
  private weatherCount = 0;
  private rings: Ring[] = [];
  private meteors: Meteor[] = [];
  private bolts: { x: number; y: number; t: number; seed: number }[] = [];
  private flash = 0;
  private shake = 0;
  private last = 0;
  /** Segundos del último frame. */
  private dt = 0.016;
  private readonly flames = buildFlames();
  /** Aviso de cada efecto con su posición en casillas (para el sonido); lo conecta el juego. */
  onSound: ((kind: string, x: number, y: number) => void) | null = null;
  /** El sistema pide menos movimiento: sin temblores y con destellos muy suaves. */
  reducedMotion = false;

  constructor(
    private readonly powers: PowerSystem,
    private readonly hazards: HazardSystem,
    private readonly world: World,
    private readonly camera: Camera,
  ) {
    const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (query) {
      this.reducedMotion = query.matches;
      query.addEventListener?.('change', (e) => (this.reducedMotion = e.matches));
    }
  }

  /** Lee los avisos de la simulación y avanza partículas, ondas y temblores. */
  update(now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016;
    this.last = now;
    this.dt = dt;
    for (const e of this.powers.fx) this.spawn(e);
    this.powers.fx.length = 0;
    for (const e of this.powers.effects) {
      if (e.kind === 'earthquake' && this.visible(e.x, e.y, e.r)) {
        this.shake = Math.max(this.shake, 4);
        if (Math.random() < 0.4) this.burst(e.x + (Math.random() - 0.5) * e.r * 2, e.y + (Math.random() - 0.5) * e.r * 2, 3, 'debris');
      }
      if (e.kind === 'volcano') {
        if (Math.random() < 0.4) this.burst(e.x, e.y - 0.5, 1, 'smoke', 1.5);
        if (Math.random() < 0.5) this.burst(e.x, e.y, 2, 'explosion', 0.8);
      }
      if (e.kind === 'tornado' && Math.random() < 0.6) this.burst(e.x, e.y, 1, 'debris', 0.8);
      if (e.kind === 'blizzard' && this.visible(e.x, e.y, e.r)) {
        // Copos arrastrados por el viento por todo el círculo.
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * e.r;
          this.burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 1, 'snowfall', 2);
        }
      }
      if ((e.kind === 'greening' || e.kind === 'drought') && this.visible(e.x, e.y, e.r) && Math.random() < 0.6) {
        // Hojas que brotan o polvo que se levanta por la zona.
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * e.r;
        this.burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 1, e.kind === 'greening' ? 'leaf' : 'dust', 0.4);
      }
      if (e.kind === 'sandstorm' && this.visible(e.x, e.y, e.r)) {
        // Granos de arena por todo el muro de polvo.
        for (let k = 0; k < 4; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * e.r;
          this.burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 1, 'sand', 1.5);
        }
      }
      if (e.kind === 'locusts' && this.visible(e.x, e.y, e.r)) this.burst(e.x + (Math.random() - 0.5) * e.r * 1.6, e.y + (Math.random() - 0.5) * e.r * 1.6, 3, 'swarm', 0.8);
    }
    for (const p of this.particles) {
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      if (p.fadeIn) this.weatherCount--;
      return false;
    });
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= METEOR_FALL_S) this.impact(m);
      else if (Math.random() < 0.7) {
        const head = this.meteorHead(m);
        this.burst(head.x, head.y, 1, 'ember', 2);
      }
    }
    this.meteors = this.meteors.filter((m) => m.t < METEOR_FALL_S);
    this.bolts = this.bolts.filter((b) => (b.t -= dt) > 0);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.shake *= 0.88;
    if (this.shake < 0.2) this.shake = 0;
  }

  private visible(x: number, y: number, r: number): boolean {
    const c = this.camera;
    return x + r > c.left && y + r > c.top && x - r < c.left + c.viewW / c.zoom && y - r < c.top + c.viewH / c.zoom;
  }

  private spawn(e: FxEvent): void {
    // Una «explosión» sin radio es la sacudida de un terremoto.
    this.onSound?.(e.kind === 'explosion' && e.r === 0 ? 'quake' : e.kind, e.x, e.y);
    switch (e.kind) {
      case 'lightning':
        this.bolts.push({ x: e.x, y: e.y, t: 0.35, seed: Math.random() * 1000 });
        this.flash = 0.7;
        this.rings.push({ x: e.x, y: e.y, r: e.r + 1, max: 0.35, t: 0, color: '#fff6c0' });
        this.burst(e.x, e.y, 14, 'sparkle', 4);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'explosion':
        if (e.r === 0) {
          this.shake = Math.max(this.shake, 6);
          return;
        }
        this.rings.push({ x: e.x, y: e.y, r: e.r * 1.6, max: 0.45, t: 0, color: '#ffd890' });
        this.burst(e.x, e.y, Math.min(120, 20 + e.r * 10), 'explosion', 3 + e.r);
        this.burst(e.x, e.y, Math.min(50, 8 + e.r * 4), 'debris', 2 + e.r);
        this.burst(e.x, e.y, Math.min(60, 10 + e.r * 4), 'smoke', 2);
        this.shake = Math.max(this.shake, Math.min(14, 3 + e.r));
        break;
      case 'wave':
        // Tres ondas que salen una tras otra, espuma y una sacudida suave.
        for (let k = 0; k < 3; k++) this.rings.push({ x: e.x, y: e.y, r: e.r * (1 + k * 0.25), max: 0.9, t: -k * 0.22, color: k === 0 ? '#eef6ff' : '#4a8ad0' });
        this.burst(e.x, e.y, Math.min(120, 30 + e.r * 8), 'spray', 1 + e.r * 0.25);
        this.shake = Math.max(this.shake, 4);
        break;
      case 'rain':
        this.rings.push({ x: e.x, y: e.y, r: e.r, max: 0.8, t: 0, color: '#8ac0f0' });
        this.rainOn(e.x, e.y, e.r);
        this.burst(e.x, e.y, Math.min(60, 12 + e.r * 5), 'sprout', Math.max(1, e.r * 0.5));
        break;
      case 'fertility':
        this.rings.push({ x: e.x, y: e.y, r: e.r, max: 0.7, t: 0, color: '#ff9ab0' });
        this.burst(e.x, e.y - 0.5, Math.min(50, 12 + e.r * 4), 'hearts', Math.max(1, e.r * 0.6));
        break;
      case 'peace':
        this.rings.push({ x: e.x, y: e.y, r: e.r, max: 0.9, t: 0, color: '#f4f6fa' });
        this.rings.push({ x: e.x, y: e.y, r: e.r * 1.3, max: 1.1, t: -0.2, color: '#c8e4ff' });
        this.burst(e.x, e.y - 0.5, Math.min(60, 16 + e.r * 4), 'heal', Math.max(1, e.r * 0.5));
        break;
      case 'offering':
        this.rings.push({ x: e.x, y: e.y, r: e.r + 0.5, max: 0.7, t: 0, color: '#ffd04a' });
        this.burst(e.x, e.y - 0.5, Math.min(70, 20 + e.r * 6), 'gold', Math.max(1, e.r * 0.6));
        break;
      case 'meteor':
        // La simulación ya abrió el cráter: aquí sólo se ve caer y estallar.
        this.meteors.push({ x: e.x, y: e.y, r: e.r, t: 0 });
        break;
      case 'sparkle':
        this.rings.push({ x: e.x, y: e.y, r: e.r + 0.5, max: 0.6, t: 0, color: '#fff2a0' });
        this.burst(e.x, e.y, Math.min(60, 12 + e.r * 6), 'sparkle', Math.max(1, e.r));
        break;
      default:
        this.burst(e.x, e.y, Math.min(70, 10 + e.r * 6), e.kind, Math.max(1, e.r));
    }
  }

  /** Impacto del meteorito: destello, doble onda, rocas incandescentes, fuego y polvo. */
  private impact(m: Meteor): void {
    this.onSound?.('explosion', m.x, m.y);
    const r = m.r;
    this.flash = Math.max(this.flash, this.visible(m.x, m.y, r) ? 0.8 : 0);
    this.rings.push({ x: m.x, y: m.y, r: r * 1.4, max: 0.4, t: 0, color: '#fff2c0' });
    this.rings.push({ x: m.x, y: m.y, r: r * 2.6, max: 0.75, t: -0.12, color: '#ffb060' });
    this.burst(m.x, m.y, Math.min(140, 30 + r * 12), 'explosion', 3 + r);
    this.burst(m.x, m.y, Math.min(70, 12 + r * 5), 'rocks', 0.6 + r * 0.15);
    this.burst(m.x, m.y, Math.min(80, 16 + r * 6), 'dust', 1 + r * 0.6);
    this.burst(m.x, m.y, Math.min(40, 8 + r * 3), 'smoke', 2.5);
    this.shake = Math.max(this.shake, Math.min(18, 5 + r * 1.2));
  }

  /** Cabeza del meteorito: baja desde el cielo (arriba a la derecha) cada vez más deprisa. */
  private meteorHead(m: Meteor): { x: number; y: number } {
    const sky = (this.camera.viewH / this.camera.zoom) * 0.9;
    const p = Math.min(1, m.t / METEOR_FALL_S);
    const left = 1 - p * p;
    return { x: m.x + sky * 0.45 * left, y: m.y - sky * left };
  }

  /** Chaparrón: gotas que caen sobre el círculo. */
  private rainOn(x: number, y: number, r: number): void {
    const n = Math.min(160, 30 + r * r * 3);
    for (let k = 0; k < n && this.particles.length < MAX_PARTICLES; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 3, vx: 0.4, vy: 9, ay: 0, life, max: life, color: 'rgba(170,200,255,0.9)', size: 1, shape: 'drop' });
    }
  }

  /** Nubecilla donde muere una criatura a la vista. */
  puff(x: number, y: number): void {
    this.burst(x, y - 0.6, 5, 'puff', 0.8);
  }

  private burst(x: number, y: number, n: number, kind: string, speedScale = 1): void {
    const st = STYLES[kind] ?? STYLES.sparkle;
    for (let k = 0; k < n && this.particles.length < MAX_PARTICLES; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * st.speed * speedScale;
      const max = 0.5 + Math.random() * 0.9;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.6 + st.rise,
        ay: st.gravity,
        life: max,
        max,
        color: st.colors[k % st.colors.length],
        size: st.shape === 'square' ? (st.size ?? 0.18 + Math.random() * 0.25) : 1,
        shape: st.shape,
      });
    }
  }

  /**
   * Vida del mapa según lo que hacen las criaturas visibles: astillas al talar, chispas
   * al picar, golpes, corazones, humo de chimeneas y estados (plaga, maldición...).
   */
  ambient(u: UnitStore, civ: CivSystem): void {
    const c = this.camera;
    if (c.zoom < 8) return;
    this.festiveSparks(civ);
    const right = c.left + c.viewW / c.zoom;
    const bottom = c.top + c.viewH / c.zoom;
    let budget = AMBIENT_BUDGET;
    const w = this.world;
    for (let i = 0; i < u.highWater && budget > 0; i++) {
      if (u.alive[i] === 0) continue;
      const x = u.x[i];
      const y = u.y[i];
      if (x < c.left || y < c.top || x > right || y > bottom) continue;
      const st = u.state[i];
      const r = Math.random();
      if (st === UnitState.WORK && r < 0.06) {
        const t = u.work[i];
        const f = t >= 0 && t < w.size ? w.flora[t] : -1;
        const kind = f === Flora.TREE ? 'chips' : f >= Flora.ROCK ? 'sparks' : 'dirt';
        this.burst(x + 0.4, y - 0.6, 3, kind);
        this.onSound?.(kind, x, y);
        budget--;
      } else if (st === UnitState.FIGHT && u.attackCd[i] === 7) {
        this.burst(x + 0.4, y - 0.8, 4, 'hit');
        this.onSound?.('hit', x, y);
        budget--;
      } else if (st === UnitState.MATE && r < 0.05) {
        this.burst(x, y - 1.6, 1, 'hearts');
        budget--;
      } else if (st === UnitState.RAZE && u.attackCd[i] === 7) {
        this.burst(u.tx[i], u.ty[i] - 0.4, 4, 'debris', 0.5);
        this.onSound?.('debris', x, y);
        budget--;
      }
      if (isMonster(u.species[i])) budget -= this.monsterFx(u, i, x, y, r);
      const status = u.status[i];
      if (u.plague[i] > 0 && r < 0.03) this.burst(x, y - 1.2, 1, 'plague', 0.3);
      else if (u.mad[i] > 0 && r < 0.03) this.burst(x, y - 1.6, 1, 'madness', 0.3);
      else if (status & Status.CURSED && r < 0.02) this.burst(x, y - 1.4, 1, 'curse', 0.3);
      else if (status & Status.BLESSED && r < 0.04) this.burst(x + (Math.random() - 0.5) * 0.8, y - 1, 1, 'blessing');
    }
    // Humo de las chimeneas (casas de nivel 3, ayuntamientos y fortalezas).
    for (const b of civ.buildings) {
      if (budget <= 0) break;
      if (!b.alive || b.underConstruction || b.x > right || b.y > bottom || b.x + b.w < c.left || b.y + b.h < c.top) continue;
      const chimney = (b.type === BuildingType.HOUSE && b.level >= 3) || (b.type === BuildingType.HALL && b.level >= 1);
      if (chimney && Math.random() < 0.05) {
        this.burst(b.x + b.w * 0.7, b.y - (b.type === BuildingType.HALL ? 1.2 : 0.8), 1, 'smoke', 0.3);
        budget--;
      }
      // Los santuarios despiden destellos.
      if (b.type === BuildingType.SHRINE && b.level >= 1 && Math.random() < 0.04) {
        this.burst(b.x + 0.4 + Math.random() * 1.2, b.y - 0.6, 1, 'blessing');
        budget--;
      }
      // Los edificios dañados (por el fuego o por los monstruos) humean hasta que se reparan.
      if (b.burn > SMOKING_BURN && Math.random() < 0.08) {
        this.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h * 0.5, 1, 'smoke', 0.4);
        budget--;
      }
    }
  }

  /** Ascuas del escorio, jirones del penante, goterones del cenagoso y la nube con la que aparecen. Devuelve las partículas gastadas. */
  private monsterFx(u: UnitStore, i: number, x: number, y: number, r: number): number {
    const species = u.species[i];
    if (u.age[i] < 6) {
      this.burst(x, y - 0.6, 3, BIRTH_FX[species] ?? 'smoke', 0.6);
      return 1;
    }
    if (species === Species.ESCORIO && r < 0.1) this.burst(x + (Math.random() - 0.5) * 0.9, y - 0.9, 1, 'ember');
    else if (species === Species.PENANTE && r < 0.04) this.burst(x - 0.3, y - 0.7, 1, 'wisp');
    else if (species === Species.CENAGOSO && r < 0.04) this.burst(x + (Math.random() - 0.5), y - 0.3, 1, 'mud');
    else return 0;
    return 1;
  }

  /** Motas que flotan sobre los biomas mágicos a la vista: ceniza violeta en el yermo, chispas en la arboleda. */
  motes(): void {
    const c = this.camera;
    if (c.zoom < MOTE_MIN_ZOOM) return;
    const vw = c.viewW / c.zoom;
    const vh = c.viewH / c.zoom;
    const w = this.world;
    let tries = MOTE_TRIES * this.dt * 60;
    while (tries > 0 && this.particles.length < MAX_PARTICLES) {
      if (tries < 1 && Math.random() > tries) break;
      tries--;
      const x = c.left + Math.random() * vw;
      const y = c.top + Math.random() * vh;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!w.inBounds(tx, ty)) continue;
      const biome = w.biome[ty * w.width + tx];
      if (biome !== Biome.BLIGHT && biome !== Biome.GROVE) continue;
      if (w.isWaterIdx(ty * w.width + tx)) continue;
      this.burst(x, y, 1, biome === Biome.BLIGHT ? 'blightMote' : 'groveMote');
    }
  }

  /** Copos en invierno (lluvia en los biomas cálidos), hojas en otoño y pétalos en primavera. */
  weather(season: number): void {
    const c = this.camera;
    if (c.zoom < 4 || season === Season.SUMMER) return;
    const vw = c.viewW / c.zoom;
    const vh = c.viewH / c.zoom;
    const w = this.world;
    const kinds = season === Season.WINTER ? ['snow', 'rain'] : season === Season.AUTUMN ? ['leaves'] : ['petals'];
    // Partículas por segundo (60 fps de referencia), sean cuales sean los fotogramas de la pantalla.
    const n = Math.min(12, (vw * vh) / 1000) * this.dt * 60;
    for (const kind of kinds) {
      const wt = WEATHER[kind];
      let count = n * wt.rate;
      while (count > 0 && this.weatherCount < MAX_WEATHER && this.particles.length < MAX_PARTICLES) {
        if (count < 1 && Math.random() > count) break;
        count--;
        const x = c.left + Math.random() * vw;
        const y = c.top + Math.random() * vh;
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (!w.inBounds(tx, ty)) continue;
        // En invierno: nieve donde hace frío y lluvia donde no.
        if (season === Season.WINTER && WARM_BIOMES.has(w.biome[ty * w.width + tx]) !== (kind === 'rain')) continue;
        this.weatherCount++;
        this.particles.push({
          x,
          y,
          vx: wt.vx * (0.6 + Math.random() * 0.8),
          vy: wt.vy * (0.7 + Math.random() * 0.6),
          ay: 0,
          life: wt.life,
          max: wt.life,
          color: wt.colors[(Math.random() * wt.colors.length) | 0],
          size: wt.size * (0.8 + Math.random() * 0.5),
          shape: wt.shape,
          fadeIn: true,
        });
      }
    }
  }

  /** Desplazamiento de cámara del temblor (en píxeles). */
  offset(): { x: number; y: number } {
    if (this.shake === 0 || this.reducedMotion) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.shake * 2, y: (Math.random() - 0.5) * this.shake * 2 };
  }

  /** Llamas animadas sobre las casillas que arden (debajo de las criaturas). */
  drawFire(ctx: CanvasRenderingContext2D, time: number): void {
    const tiles = this.hazards.burningTiles();
    if (tiles.length === 0) return;
    const c = this.camera;
    const z = c.zoom;
    const w = this.world.width;
    const right = c.left + c.viewW / z;
    const bottom = c.top + c.viewH / z;
    const n = Math.min(tiles.length, MAX_FIRE_TILES);
    const s = z / 6;
    const frameBase = Math.floor(time / 110);
    for (let k = 0; k < n; k++) {
      const i = tiles[k];
      const x = i % w;
      const y = (i - x) / w;
      if (x + 1 < c.left || y + 1 < c.top || x > right || y > bottom) continue;
      const sx = (x - c.left) * z;
      const sy = (y - c.top) * z;
      if (z < 4) {
        ctx.fillStyle = (frameBase + i) % 2 ? '#ff9a2a' : '#e84a1a';
        ctx.fillRect(sx, sy, Math.max(1, z), Math.max(1, z));
        continue;
      }
      const f = (frameBase + i) % FLAME_FRAMES.length;
      ctx.drawImage(this.flames, f * 6, 0, 6, 8, Math.round(sx), Math.round(sy + z - 8 * s), Math.round(6 * s), Math.round(8 * s));
      if (Math.random() < 0.01) this.burst(x + 0.5, y, 1, 'ember');
    }
  }

  /** Tornados, nubes, ondas, partículas, rayos y destello (encima de todo). */
  drawOver(ctx: CanvasRenderingContext2D, time: number): void {
    const c = this.camera;
    const z = c.zoom;
    for (const e of this.powers.effects) {
      if (!this.visible(e.x, e.y, e.r + 4)) continue;
      const sx = (e.x - c.left) * z;
      const sy = (e.y - c.top) * z;
      if (e.kind === 'tornado') this.drawTornado(ctx, sx, sy, z, time);
      else if (e.kind === 'acid-rain') this.drawAcid(ctx, sx, sy, e.r * z, time);
      else if (e.kind === 'volcano') this.drawVolcano(ctx, sx, sy, z, time);
      else if (e.kind === 'blizzard') this.drawBlizzard(ctx, sx, sy, e.r * z, time);
      else if (e.kind === 'locusts') this.drawSwarm(ctx, sx, sy, e.r * z, time);
      else if (e.kind === 'sandstorm') this.drawSandstorm(ctx, sx, sy, e.r * z, time, e.dx, e.dy);
      else if (e.kind === 'greening') this.drawClimate(ctx, sx, sy, e.r * z, time, '90,200,90');
      else if (e.kind === 'drought') this.drawClimate(ctx, sx, sy, e.r * z, time, '230,150,60');
    }
    for (const m of this.meteors) this.drawMeteor(ctx, m);
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const t = r.t / r.max;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1.5, z * 0.25 * (1 - t));
      ctx.beginPath();
      ctx.ellipse((r.x - c.left) * z, (r.y - c.top) * z, r.r * z * t, r.r * z * t * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      if (!this.visible(p.x, p.y, 1)) continue;
      const fade = p.fadeIn ? Math.min((p.max - p.life) * 2, p.life * 1.5) : (p.life / p.max) * 1.5;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      ctx.fillStyle = p.color;
      const px = (p.x - c.left) * z;
      const py = (p.y - c.top) * z;
      if (p.shape === 'square') {
        const s = Math.max(1.5, p.size * z);
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      } else if (p.shape === 'drop') {
        ctx.fillRect(px, py, Math.max(1, z * 0.06), Math.max(3, z * 0.55));
      } else {
        this.stamp(ctx, STAMPS[p.shape], px, py, Math.max(1, Math.round(z / 10)));
      }
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) this.drawBolt(ctx, (b.x - c.left) * z, (b.y - c.top) * z, b.t, b.seed);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,240,${this.flash * (this.reducedMotion ? 0.06 : 0.35)})`;
      ctx.fillRect(0, 0, c.viewW, c.viewH);
    }
  }

  private stamp(ctx: CanvasRenderingContext2D, rows: readonly string[], cx: number, cy: number, s: number): void {
    const w = rows[0].length;
    const h = rows.length;
    const x0 = Math.round(cx - (w * s) / 2);
    const y0 = Math.round(cy - (h * s) / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (rows[y][x] === 'x') ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
    }
  }

  /** Embudo de viento con bandas que giran y polvo en la base. */
  private drawTornado(ctx: CanvasRenderingContext2D, sx: number, sy: number, z: number, time: number): void {
    const s = Math.max(1, z / 4);
    ctx.fillStyle = 'rgba(110,100,90,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, s * 7, s * 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const layers = 12;
    for (let k = 0; k < layers; k++) {
      const t = k / layers;
      const width = (2 + t * t * 14) * s;
      const wobble = Math.sin(time / 140 + k * 0.7) * s * (1 + t * 3);
      const band = Math.sin(time / 60 - k * 1.3) > 0;
      ctx.fillStyle = band ? `rgba(185,190,198,${0.9 - t * 0.35})` : `rgba(130,135,145,${0.9 - t * 0.35})`;
      ctx.fillRect(Math.round(sx - width / 2 + wobble), Math.round(sy - (k + 1) * s * 2.2), Math.round(width), Math.ceil(s * 2.2));
    }
  }

  /** Nube cargada y gotas verdes que caen. */
  private drawAcid(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, time: number): void {
    ctx.fillStyle = 'rgba(70,84,58,0.75)';
    for (const [dx, dy, k] of [[-0.6, -1, 0.5], [0, -1.15, 0.6], [0.6, -1, 0.5], [-0.25, -0.85, 0.5], [0.3, -0.85, 0.45]]) {
      ctx.beginPath();
      ctx.ellipse(sx + dx * r, sy + dy * r, r * k, r * k * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,234,90,0.85)';
    const drop = Math.max(3, r * 0.08);
    for (let k = 0; k < 24; k++) {
      const dx = ((k * 37) % 100) / 50 - 1;
      const fall = ((time / 400 + k * 0.13) % 1) * r * 1.4;
      ctx.fillRect(sx + dx * r * 0.95, sy - r * 0.75 + fall, 1.5, drop);
    }
  }

  /** Ventisca: neblina blanca que late sobre el círculo. */
  private drawBlizzard(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, time: number): void {
    const pulse = 0.18 + Math.sin(time / 500) * 0.05;
    ctx.fillStyle = `rgba(230,240,250,${pulse})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Clima de zona: un velo suave del color del cambio (verde al reverdecer, ocre en la sequía) que late despacio. */
  private drawClimate(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, time: number, rgb: string): void {
    const pulse = 0.16 + Math.sin(time / 700) * 0.04;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.8);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, `rgba(${rgb},${pulse})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Chispas de colores que saltan de las hogueras de las aldeas en fiesta. */
  private festiveSparks(civ: CivSystem): void {
    if (this.reducedMotion || !civ.anyFestive()) return;
    for (const v of civ.villages) {
      if (!v.alive || !civ.isFestive(v.id)) continue;
      const hall = civ.building(v.hallId);
      if (!hall) continue;
      const x = hall.x + hall.w / 2;
      const y = hall.y + hall.h / 2;
      // Cada raza celebra a su manera (farolillos, fuegos artificiales, brasas, luciérnagas...).
      const look = festiveLook(v.race);
      if (!this.visible(x, y, 3 + look.height) || Math.random() >= look.chance) continue;
      // Reparto en óvalo (la mitad en vertical), como el corro visto en perspectiva.
      const ox = (Math.random() - 0.5) * 2 * look.spread;
      const oy = (Math.random() - 0.5) * look.spread;
      this.burst(x + ox, y + oy - look.height, look.count, look.particle, 1.2);
    }
  }

  /** Tormenta de arena: polvo ocre espeso con jirones que corren en la dirección del viento. */
  private drawSandstorm(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, time: number, dx: number, dy: number): void {
    const pulse = 0.45 + Math.sin(time / 400) * 0.05;
    // El degradado se aplasta junto con el círculo, para que el polvo se desvanezca hasta el borde.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.8);
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, `rgba(196,140,70,${pulse + 0.2})`);
    g.addColorStop(0.65, `rgba(206,156,86,${pulse})`);
    g.addColorStop(1, 'rgba(210,165,95,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Jirones: rayas que cruzan el círculo a favor del viento.
    ctx.strokeStyle = 'rgba(240,215,160,0.45)';
    ctx.lineWidth = Math.max(1, r * 0.03);
    const len = r * 0.5;
    for (let k = 0; k < 14; k++) {
      const t = ((time / 900 + k * 0.137) % 1) * 2 - 1;
      const side = ((k * 53) % 100) / 50 - 1;
      const px = sx + (dx * t - dy * side * 0.8) * r * 0.8;
      const py = sy + (dy * t + dx * side * 0.8) * r * 0.65;
      ctx.beginPath();
      ctx.moveTo(px - dx * len * 0.5, py - dy * len * 0.5);
      ctx.lineTo(px + dx * len * 0.5, py + dy * len * 0.5);
      ctx.stroke();
    }
  }

  /** Langostas: nube oscura que se arremolina. */
  private drawSwarm(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, time: number): void {
    ctx.fillStyle = 'rgba(70,58,28,0.85)';
    const s = Math.max(1.5, r * 0.05);
    for (let k = 0; k < 60; k++) {
      const a = time / (300 + (k % 7) * 40) + k * 2.399;
      const d = r * (0.15 + ((k * 37) % 100) / 120);
      ctx.fillRect(sx + Math.cos(a) * d, sy + Math.sin(a * 1.3) * d * 0.7, s, s);
    }
  }

  /** Cráter incandescente con un brillo que late. */
  private drawVolcano(ctx: CanvasRenderingContext2D, sx: number, sy: number, z: number, time: number): void {
    const pulse = 0.3 + Math.sin(time / 200) * 0.1;
    ctx.fillStyle = `rgba(255,120,30,${pulse})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, Math.max(4, z * 2.2), Math.max(3, z * 1.4), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,120,0.7)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, Math.max(2, z * 0.8), Math.max(1.5, z * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Meteorito en plena caída: sombra que crece en el suelo, estela de fuego y núcleo blanco. */
  private drawMeteor(ctx: CanvasRenderingContext2D, m: Meteor): void {
    const c = this.camera;
    const z = c.zoom;
    const p = Math.min(1, m.t / METEOR_FALL_S);
    const gx = (m.x - c.left) * z;
    const gy = (m.y - c.top) * z;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + p * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(gx, gy, Math.max(3, m.r * z * p * 0.6), Math.max(2, m.r * z * p * 0.35), 0, 0, Math.PI * 2);
    ctx.fill();
    const head = this.meteorHead(m);
    const hx = (head.x - c.left) * z;
    const hy = (head.y - c.top) * z;
    // La estela apunta hacia donde viene (arriba a la derecha).
    const size = Math.max(4, Math.min(28, m.r * z * 0.3));
    const tail = size * 7;
    const tx = hx + tail * 0.41;
    const ty = hy - tail * 0.91;
    for (const [w, color] of [[size * 1.8, 'rgba(255,120,40,0.35)'], [size, 'rgba(255,190,80,0.85)'], [size * 0.45, 'rgba(255,250,220,1)']] as const) {
      const grad = ctx.createLinearGradient(hx, hy, tx, ty);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(hx, hy, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Rayo con resplandor y ramas. */
  private drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
    const rnd = (k: number): number => {
      const v = Math.sin(seed + k * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const pts: [number, number][] = [];
    let cx = x + (rnd(0) - 0.5) * 40;
    pts.push([cx, 0]);
    const steps = 9;
    for (let k = 1; k <= steps; k++) {
      cx = k === steps ? x : cx + (rnd(k) - 0.5) * 28;
      pts.push([cx, (y * k) / steps]);
    }
    const alpha = Math.min(1, t * 4);
    for (const [width, color] of [[9, `rgba(180,200,255,${alpha * 0.35})`], [3.5, `rgba(255,250,210,${alpha})`], [1.5, `rgba(255,255,255,${alpha})`]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
      ctx.stroke();
    }
    // Una rama lateral.
    const [bx, by] = pts[4];
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255,250,210,${alpha * 0.8})`;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (rnd(20) - 0.5) * 50, by + y * 0.18);
    ctx.stroke();
  }
}
