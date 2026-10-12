import type { FxEvent, PowerSystem } from '../powers/disasters';
import type { HazardSystem } from '../powers/hazards';
import type { World } from '../world/world';
import type { Camera } from './camera';

/** Efectos puramente visuales (no afectan a la simulación, así que pueden usar Math.random). */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

const MAX_PARTICLES = 1500;
const MAX_FIRE_TILES = 4000;
const FIRE_COLORS = ['#ff9a2a', '#ffd04a', '#e84a1a', '#ff6a1a'];
const FX_COLORS: Readonly<Record<string, readonly string[]>> = {
  explosion: ['#ffd04a', '#ff8a2a', '#e84a1a', '#5a4a40'],
  smoke: ['#6a6a6a', '#8a8a8a', '#4a4a4a'],
  sparkle: ['#fff6b0', '#ffd04a', '#ffffff'],
  heal: ['#ffffff', '#c8f0ff', '#fff6b0'],
  curse: ['#a35ce8', '#6a2aa8', '#d090ff'],
  plague: ['#8be04a', '#5aa82a', '#c8f08a'],
  madness: ['#ff3a3a', '#a81a1a', '#ff8a8a'],
};

export class FxLayer {
  private particles: Particle[] = [];
  private bolts: { x: number; y: number; t: number }[] = [];
  private flash = 0;
  private shake = 0;
  private last = 0;

  constructor(
    private readonly powers: PowerSystem,
    private readonly hazards: HazardSystem,
    private readonly world: World,
    private readonly camera: Camera,
  ) {}

  /** Lee los avisos de la simulación y avanza partículas y temblores. */
  update(now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016;
    this.last = now;
    for (const e of this.powers.fx) this.spawn(e);
    this.powers.fx.length = 0;
    for (const e of this.powers.effects) {
      if (e.kind === 'earthquake' && this.visible(e.x, e.y, e.r)) this.shake = Math.max(this.shake, 4);
      if (e.kind === 'volcano' && Math.random() < 0.3) this.burst(e.x, e.y, 1, 'smoke', 1, -2.5);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
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
    if (e.kind === 'lightning') {
      this.bolts.push({ x: e.x, y: e.y, t: 0.3 });
      this.flash = 0.6;
      this.burst(e.x, e.y, 14, 'sparkle', 4, 0);
      this.shake = Math.max(this.shake, 3);
    } else if (e.kind === 'explosion') {
      if (e.r === 0) {
        this.shake = Math.max(this.shake, 6);
        return;
      }
      this.burst(e.x, e.y, Math.min(120, 20 + e.r * 10), 'explosion', 3 + e.r, 0);
      this.burst(e.x, e.y, Math.min(60, 10 + e.r * 4), 'smoke', 2, -1.5);
      this.shake = Math.max(this.shake, Math.min(14, 3 + e.r));
    } else {
      this.burst(e.x, e.y, Math.min(80, 12 + e.r * 6), e.kind, Math.max(1, e.r), -1.5);
    }
  }

  private burst(x: number, y: number, n: number, kind: string, speed: number, rise: number): void {
    const colors = FX_COLORS[kind] ?? FX_COLORS.sparkle;
    for (let k = 0; k < n && this.particles.length < MAX_PARTICLES; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      const max = 0.5 + Math.random() * 0.9;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + rise, life: max, max, color: colors[k % colors.length], size: 0.25 + Math.random() * 0.35 });
    }
  }

  /** Desplazamiento de cámara del temblor (en píxeles). */
  offset(): { x: number; y: number } {
    if (this.shake === 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.shake * 2, y: (Math.random() - 0.5) * this.shake * 2 };
  }

  /** Llamas parpadeantes sobre las casillas que arden (debajo de las criaturas). */
  drawFire(ctx: CanvasRenderingContext2D): void {
    const tiles = this.hazards.burningTiles();
    if (tiles.length === 0) return;
    const c = this.camera;
    const z = c.zoom;
    const w = this.world.width;
    const right = c.left + c.viewW / z;
    const bottom = c.top + c.viewH / z;
    const n = Math.min(tiles.length, MAX_FIRE_TILES);
    for (let k = 0; k < n; k++) {
      const i = tiles[k];
      const x = i % w;
      const y = (i - x) / w;
      if (x + 1 < c.left || y + 1 < c.top || x > right || y > bottom) continue;
      ctx.fillStyle = FIRE_COLORS[(Math.random() * FIRE_COLORS.length) | 0];
      const s = z * (0.6 + Math.random() * 0.5);
      ctx.fillRect((x + 0.5 - c.left) * z - s / 2, (y + 0.4 - c.top) * z - s / 2, s, s);
    }
  }

  /** Tornados, nubes de ácido, partículas, rayos y destello (encima de todo). */
  drawOver(ctx: CanvasRenderingContext2D, time: number): void {
    const c = this.camera;
    const z = c.zoom;
    for (const e of this.powers.effects) {
      if (!this.visible(e.x, e.y, e.r + 4)) continue;
      const sx = (e.x - c.left) * z;
      const sy = (e.y - c.top) * z;
      if (e.kind === 'tornado') this.drawTornado(ctx, sx, sy, z, time);
      else if (e.kind === 'acid-rain') this.drawAcid(ctx, sx, sy, e.r * z);
      else if (e.kind === 'volcano') {
        ctx.fillStyle = 'rgba(255,120,30,0.35)';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(4, z * 1.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of this.particles) {
      if (!this.visible(p.x, p.y, 1)) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const s = Math.max(1.5, p.size * z);
      ctx.fillRect((p.x - c.left) * z - s / 2, (p.y - c.top) * z - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) this.drawBolt(ctx, (b.x - c.left) * z, (b.y - c.top) * z, b.t);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,240,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, c.viewW, c.viewH);
    }
  }

  private drawTornado(ctx: CanvasRenderingContext2D, sx: number, sy: number, z: number, time: number): void {
    const s = Math.max(1, z / 4);
    for (let k = 0; k < 7; k++) {
      const width = (6 - k * 0.7) * s * 2;
      const wobble = Math.sin(time / 120 + k) * s * 2;
      ctx.fillStyle = k % 2 === 0 ? 'rgba(170,175,185,0.85)' : 'rgba(120,125,135,0.85)';
      ctx.fillRect(sx - width / 2 + wobble, sy - k * s * 3 - s * 3, width, s * 3);
    }
  }

  private drawAcid(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number): void {
    ctx.fillStyle = 'rgba(90,110,70,0.55)';
    ctx.beginPath();
    ctx.ellipse(sx, sy - r * 0.9, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,224,74,0.8)';
    for (let k = 0; k < 18; k++) {
      const dx = (Math.random() * 2 - 1) * r;
      const dy = Math.random() * r * 1.4 - r * 0.6;
      ctx.fillRect(sx + dx, sy + dy, 1.5, Math.max(3, r * 0.08));
    }
  }

  private drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    ctx.strokeStyle = `rgba(255,250,200,${Math.min(1, t * 4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let cx = x + (Math.random() - 0.5) * 30;
    ctx.moveTo(cx, 0);
    const steps = 8;
    for (let k = 1; k <= steps; k++) {
      cx = k === steps ? x : cx + (Math.random() - 0.5) * 24;
      ctx.lineTo(cx, (y * k) / steps);
    }
    ctx.stroke();
  }
}
