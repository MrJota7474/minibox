import type { CivSystem } from '../civ/civ-system';
import { BuildingType } from '../civ/model';
import { UnitState, type UnitStore } from '../entities/units';
import type { FxEvent, PowerSystem } from '../powers/disasters';
import type { HazardSystem } from '../powers/hazards';
import { Status } from '../powers/status';
import { Flora } from '../world/terrain';
import type { World } from '../world/world';
import type { Camera } from './camera';

/**
 * Efectos puramente visuales (no afectan a la simulación, así que pueden usar Math.random):
 * fuego animado, rayos con resplandor, ondas expansivas, tornados, nubes, partículas con
 * forma (corazones, cruces, burbujas, calaveras) y vida en el mapa (astillas al talar,
 * chispas al picar, golpes, humo de chimeneas, estados de las criaturas).
 */
type Shape = 'square' | 'heart' | 'cross' | 'bubble' | 'skull' | 'star';

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
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  t: number;
  color: string;
}

const MAX_PARTICLES = 2500;
const MAX_FIRE_TILES = 4000;
/** Partículas de ambiente por frame como máximo (talar, chimeneas, estados...). */
const AMBIENT_BUDGET = 40;

const STAMPS: Readonly<Record<Exclude<Shape, 'square'>, readonly string[]>> = {
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
}

const STYLES: Readonly<Record<string, Style>> = {
  explosion: { colors: ['#ffd04a', '#ff8a2a', '#e84a1a', '#fff2b0'], shape: 'square', speed: 6, rise: -1, gravity: 4 },
  debris: { colors: ['#5a4a40', '#7a6a5a', '#3a2e26'], shape: 'square', speed: 5, rise: -4, gravity: 10 },
  smoke: { colors: ['#6a6a6a', '#8a8a8a', '#4a4a4a'], shape: 'square', speed: 0.6, rise: -1.6, gravity: 0 },
  sparkle: { colors: ['#fff6b0', '#ffd04a', '#ffffff'], shape: 'star', speed: 2.5, rise: -1, gravity: 0 },
  heal: { colors: ['#ffffff', '#c8f0ff', '#9be38a'], shape: 'cross', speed: 1, rise: -1.6, gravity: 0 },
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
};

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
  private rings: Ring[] = [];
  private bolts: { x: number; y: number; t: number; seed: number }[] = [];
  private flash = 0;
  private shake = 0;
  private last = 0;
  private readonly flames = buildFlames();

  constructor(
    private readonly powers: PowerSystem,
    private readonly hazards: HazardSystem,
    private readonly world: World,
    private readonly camera: Camera,
  ) {}

  /** Lee los avisos de la simulación y avanza partículas, ondas y temblores. */
  update(now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016;
    this.last = now;
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
    }
    for (const p of this.particles) {
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
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
      case 'sparkle':
        this.rings.push({ x: e.x, y: e.y, r: e.r + 0.5, max: 0.6, t: 0, color: '#fff2a0' });
        this.burst(e.x, e.y, Math.min(60, 12 + e.r * 6), 'sparkle', Math.max(1, e.r));
        break;
      default:
        this.burst(e.x, e.y, Math.min(70, 10 + e.r * 6), e.kind, Math.max(1, e.r));
    }
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
        size: st.shape === 'square' ? 0.18 + Math.random() * 0.25 : 1,
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
        budget--;
      } else if (st === UnitState.FIGHT && u.attackCd[i] === 7) {
        this.burst(x + 0.4, y - 0.8, 4, 'hit');
        budget--;
      } else if (st === UnitState.MATE && r < 0.05) {
        this.burst(x, y - 1.6, 1, 'hearts');
        budget--;
      }
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
    }
  }

  /** Desplazamiento de cámara del temblor (en píxeles). */
  offset(): { x: number; y: number } {
    if (this.shake === 0) return { x: 0, y: 0 };
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
    }
    for (const r of this.rings) {
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
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.life / p.max) * 1.5));
      ctx.fillStyle = p.color;
      const px = (p.x - c.left) * z;
      const py = (p.y - c.top) * z;
      if (p.shape === 'square') {
        const s = Math.max(1.5, p.size * z);
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      } else {
        this.stamp(ctx, STAMPS[p.shape], px, py, Math.max(1, Math.round(z / 10)));
      }
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) this.drawBolt(ctx, (b.x - c.left) * z, (b.y - c.top) * z, b.t, b.seed);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,240,${this.flash * 0.35})`;
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
