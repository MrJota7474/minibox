import type { CivSystem } from '../civ/civ-system';
import { Job, VILLAGE_COLORS } from '../civ/model';
import { SPECIES, Species } from '../entities/species';
import { NO_UNIT, UnitState, type UnitStore } from '../entities/units';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { BACKGROUND } from './palette';
import type { PowerSystem } from '../powers/disasters';
import type { HazardSystem } from '../powers/hazards';
import type { ToolTone } from '../powers/tools';
import { Status } from '../powers/status';
import { BoatLayer } from './boat-layer';
import { CaravanTrail, leadsCaravan } from './caravan';
import { CivLayer } from './civ-layer';
import { FxLayer } from './fx';
import { NightLayer } from './night';
import { daylight } from '../world/daylight';
import { ANIMAL_SCALE, CELL_H, CELL_W, CLOTH_COUNT, Pose, buildCreatureAtlas, buildToolAtlas, type CreatureAtlas, type ToolAtlas } from './creature-art';
import { TerrainLayer } from './terrain-layer';
import { buildFloraAtlas } from './flora-art';
import { FloraLayer } from './flora-layer';
import { MONSTER_SCALE } from './monster-art';
import { hash2 } from './pixel';

export interface Overlay {
  /** Pincel bajo el cursor (en casillas) y el tono de la herramienta. */
  brush: { x: number; y: number; size: number; tone: ToolTone } | null;
  /** Índice de la criatura seleccionada o -1. */
  selected: number;
  /** Casilla inspeccionada o -1. */
  selectedTile: number;
  /** Dónde dibujar las criaturas sujetas por el imán (casilla) o null. */
  heldAt: { x: number; y: number } | null;
  /** Estación actual (tiñe el mapa). */
  season: number;
}

/** Por debajo de este zoom las criaturas se dibujan como puntos. */
const SPRITE_MIN_ZOOM = 5;
/** Desde este zoom el terreno lleva una textura sutil. */
const GRAIN_MIN_ZOOM = 6;
const GRAIN_PX = 8;
/** Destellos del agua: desde qué zoom y en qué fracción de casillas. */
const GLINT_MIN_ZOOM = 8;
const GLINT_DENSITY = 0.05;

/** Píxeles de sprite por casilla: una criatura mide algo más de 1,5 casillas. */
const SPRITE_PX_PER_TILE = 11;
/** Herramienta de cada oficio (índice = Job). */
const JOB_TOOLS: readonly (string | null)[] = [null, 'basket', 'axe', 'pick', 'hoe', 'hammer', 'bow', 'bundle', 'spear', 'rod', 'bundle'];
const CARGO_SPRITES: readonly string[] = ['food', 'log', 'stone', 'ore', 'gold'];
/** Anillo y relleno del pincel según la herramienta. */
const BRUSH_COLORS: Readonly<Record<ToolTone, readonly [string, string]>> = {
  normal: ['rgba(255,244,214,0.95)', 'rgba(255,244,214,0.08)'],
  danger: ['rgba(255,110,90,0.95)', 'rgba(255,80,60,0.12)'],
  magic: ['rgba(255,214,110,0.95)', 'rgba(255,214,110,0.12)'],
};

/** Patrón de grano: píxeles algo más claros u oscuros, siempre los mismos. */
function buildGrain(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRAIN_PX * 4;
  c.height = GRAIN_PX * 4;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const r = hash2(x, y, 3);
      if (r < 0.12) ctx.fillStyle = 'rgba(0,0,0,0.10)';
      else if (r > 0.9) ctx.fillStyle = 'rgba(255,255,255,0.07)';
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function toolFor(job: number, gear: boolean, diet: string): string | null {
  if (diet !== 'civilized') return null;
  if (job === Job.WARRIOR && gear) return 'steelSpear';
  return JOB_TOOLS[job] ?? null;
}
/**
 * Chunks del terreno que se repintan por frame tras el primero: un cambio de estación
 * repinta todo el mapa (~0,75 ms por chunk) y así se reparte en varios frames sin tirones.
 */
const TERRAIN_CHUNKS_PER_FRAME = 8;

/** Render en Canvas 2D (aislado tras esta clase para poder cambiarlo a WebGL). */
/** Fila del dibujo del dromedario donde arranca la joroba (sobre ella van los fardos). */
const CAMEL_HUMP_Y = CELL_H - 16;
/** Centro de la joroba en el dibujo (columnas 5 a 9). */
const CAMEL_HUMP_X = 7.5;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain: TerrainLayer;
  readonly atlas: CreatureAtlas;
  private readonly tools: ToolAtlas = buildToolAtlas();
  private readonly flora: FloraLayer;
  private readonly grain: HTMLCanvasElement = buildGrain();
  private grainPattern: CanvasPattern | null = null;
  private readonly visibleUnits: number[] = [];
  /** Criaturas vistas en el fotograma anterior, con su handle y posición (para la nubecilla al morir). */
  private seen: number[] = [];
  private readonly seenHandle: Float64Array;
  private readonly seenX: Float32Array;
  private readonly seenY: Float32Array;
  private readonly speciesDiet: string[];
  private dpr = 1;
  private dprCap: number;
  private readonly speciesColors: string[];
  private readonly adultTicks: number[];
  /** Tamaño de cada especie respecto a un aldeano y cuáles despiden resplandor de lava. */
  private readonly speciesScale: number[] = SPECIES.map((s) => MONSTER_SCALE[s.id] ?? ANIMAL_SCALE[s.id] ?? 1);
  private readonly speciesGlow: boolean[] = SPECIES.map((s) => s.monster?.fiery === true);
  /** Rumbo de los dromedarios de carga de las caravanas. */
  private readonly caravans: CaravanTrail;
  private readonly civLayer: CivLayer;
  private readonly boats: BoatLayer;
  private readonly civ: CivSystem;
  private readonly fx: FxLayer;
  private readonly powers: PowerSystem;
  /** Capas que el jugador puede ocultar desde los ajustes. */
  showLabels = true;
  showTerritory = true;
  /** Ciclo de día y noche visible (la vida de noche sigue aunque esté apagado). */
  showNight = true;
  private readonly night: NightLayer;
  private firstFrame = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly units: UnitStore,
    private readonly camera: Camera,
    civ: CivSystem,
    powers: PowerSystem,
    hazards: HazardSystem,
    dprCap: number,
    atlas?: CreatureAtlas,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    this.terrain = new TerrainLayer(world);
    this.flora = new FloraLayer(world, buildFloraAtlas());
    this.terrain.onChunk = (c) => this.flora.touch(c);
    this.atlas = atlas ?? buildCreatureAtlas();
    this.seenHandle = new Float64Array(units.capacity);
    this.seenX = new Float32Array(units.capacity);
    this.seenY = new Float32Array(units.capacity);
    this.caravans = new CaravanTrail(units.capacity);
    this.speciesDiet = SPECIES.map((sp) => sp.diet);
    this.dprCap = dprCap;
    this.speciesColors = SPECIES.map((s) => s.color);
    this.adultTicks = SPECIES.map((s) => s.adultTicks);
    this.civLayer = new CivLayer(world, civ, camera);
    this.boats = new BoatLayer(civ, camera);
    this.civ = civ;
    this.powers = powers;
    this.fx = new FxLayer(powers, hazards, world, camera);
    this.night = new NightLayer(world, civ, hazards, camera);
  }

  /** Conecta los avisos de efectos (rayos, explosiones, golpes...) con quien los haga sonar. */
  setSoundHook(hook: (kind: string, x: number, y: number) => void): void {
    this.fx.onSound = hook;
  }

  getDprCap(): number {
    return this.dprCap;
  }

  setDprCap(cap: number): void {
    this.dprCap = cap;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.camera.setViewport(rect.width, rect.height);
  }

  draw(alpha: number, tick: number, overlay: Overlay): void {
    if (overlay.season !== this.terrain.season) {
      this.terrain.season = overlay.season;
      this.world.markAllDirty();
    }
    this.terrain.update(this.firstFrame ? Infinity : TERRAIN_CHUNKS_PER_FRAME);
    this.firstFrame = false;
    const ctx = this.ctx;
    const cam = this.camera;
    const now = performance.now();
    this.fx.update(now);
    const shake = this.fx.offset();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    ctx.translate(shake.x, shake.y);
    this.drawTerrain();
    this.drawGrain();
    this.drawWaterGlints(now);
    if (this.showTerritory) this.civLayer.drawTerritory(ctx);
    this.flora.draw(ctx, cam, overlay.season);
    // Con «reducir movimiento», banderas y hogueras quietas.
    this.civLayer.drawBuildings(ctx, this.fx.reducedMotion ? 0 : now);
    if (overlay.selectedTile >= 0) this.drawTileMarker(overlay.selectedTile);
    this.fx.drawFire(ctx, now);
    this.boats.draw(ctx, alpha);
    this.drawUnits(alpha, tick);
    this.fx.ambient(this.units, this.civ);
    this.fx.motes();
    this.fx.weather(overlay.season);
    // La noche cae sobre el mapa y sus criaturas; los efectos y los nombres quedan por encima.
    if (this.showNight) this.night.draw(ctx, daylight(tick));
    if (overlay.heldAt) this.drawHeld(overlay.heldAt.x, overlay.heldAt.y);
    this.fx.drawOver(ctx, now);
    if (this.showLabels) this.civLayer.drawLabels(ctx);
    if (overlay.selected >= 0) this.drawSelection(overlay.selected, alpha, now);
    if (overlay.brush) this.drawBrush(overlay.brush, now);
  }

  private drawTerrain(): void {
    const cam = this.camera;
    const x0 = Math.max(0, Math.floor(cam.left));
    const y0 = Math.max(0, Math.floor(cam.top));
    const x1 = Math.min(this.world.width, Math.ceil(cam.left + cam.viewW / cam.zoom) + 1);
    const y1 = Math.min(this.world.height, Math.ceil(cam.top + cam.viewH / cam.zoom) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    const s = cam.worldToScreen(x0, y0);
    this.ctx.drawImage(this.terrain.canvas, x0, y0, x1 - x0, y1 - y0, s.x, s.y, (x1 - x0) * cam.zoom, (y1 - y0) * cam.zoom);
  }

  /** Destellos que aparecen y desaparecen sobre el agua (sólo de cerca). */
  private drawWaterGlints(time: number): void {
    const cam = this.camera;
    const z = cam.zoom;
    if (z < GLINT_MIN_ZOOM) return;
    const w = this.world;
    const x0 = Math.max(0, Math.floor(cam.left));
    const y0 = Math.max(0, Math.floor(cam.top));
    const x1 = Math.min(w.width, Math.ceil(cam.left + cam.viewW / z));
    const y1 = Math.min(w.height, Math.ceil(cam.top + cam.viewH / z));
    const ctx = this.ctx;
    const lw = Math.max(2, Math.round(z * 0.4));
    const lh = Math.max(1, Math.round(z * 0.09));
    ctx.fillStyle = '#ebf5ff';
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const r = hash2(x, y, 5);
        if (r > GLINT_DENSITY || !w.isWaterIdx(y * w.width + x)) continue;
        const a = Math.sin(time / 650 + r * 1000);
        if (a < 0.5) continue;
        ctx.globalAlpha = (a - 0.5) * 1.4;
        ctx.fillRect(Math.round((x + hash2(x, y, 6) * 0.6 - cam.left) * z), Math.round((y + 0.5 - cam.top) * z), lw, lh);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Textura sutil del terreno (un patrón de 8×8 píxeles por casilla). */
  private drawGrain(): void {
    const cam = this.camera;
    const z = cam.zoom;
    if (z < GRAIN_MIN_ZOOM) return;
    const ctx = this.ctx;
    this.grainPattern ??= ctx.createPattern(this.grain, 'repeat');
    if (!this.grainPattern) return;
    this.grainPattern.setTransform(new DOMMatrix().translateSelf(-cam.left * z, -cam.top * z).scaleSelf(z / GRAIN_PX, z / GRAIN_PX));
    const p0 = cam.worldToScreen(0, 0);
    const p1 = cam.worldToScreen(this.world.width, this.world.height);
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(Math.max(0, p0.x), Math.max(0, p0.y), Math.min(cam.viewW, p1.x) - Math.max(0, p0.x), Math.min(cam.viewH, p1.y) - Math.max(0, p0.y));
  }

  private drawUnits(alpha: number, tick: number): void {
    const u = this.units;
    const cam = this.camera;
    const z = cam.zoom;
    const left = cam.left;
    const top = cam.top;
    const right = left + cam.viewW / z;
    const bottom = top + cam.viewH / z;
    if (z < SPRITE_MIN_ZOOM) {
      this.seen.length = 0;
      this.drawDots(alpha, left, top, right, bottom);
      return;
    }
    // Píxeles de pantalla por píxel de sprite (enteros al acercarse, para un pixel art nítido).
    const scale = z >= 15 ? Math.round(z / SPRITE_PX_PER_TILE) : z / SPRITE_PX_PER_TILE;
    const ctx = this.ctx;
    const visible = this.visibleUnits;
    visible.length = 0;
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || (u.status[i] & (Status.HELD | Status.ABOARD)) !== 0) continue;
      const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
      const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
      if (wx < left - 2 || wy < top - 2 || wx > right + 2 || wy > bottom + 3) continue;
      visible.push(i);
    }
    // Sombras primero (un solo color), luego los cuerpos de arriba abajo para que se solapen bien.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const i of visible) {
      const sx = (u.px[i] + (u.x[i] - u.px[i]) * alpha - left) * z;
      const sy = (u.py[i] + (u.y[i] - u.py[i]) * alpha - top) * z;
      const s = this.unitScale(i, scale);
      ctx.fillRect(Math.round(sx - 4 * s), Math.round(sy - s), Math.round(8 * s), Math.max(1, Math.round(2 * s)));
    }
    this.drawGlows(visible, alpha, tick, scale);
    visible.sort((a, b) => u.y[a] - u.y[b] || a - b);
    for (const i of visible) {
      if (!leadsCaravan(u, i)) {
        this.drawCreature(i, alpha, tick, scale);
        continue;
      }
      // El dromedario de carga tapa al mercader sólo si queda más cerca de la cámara (más abajo).
      const camel = this.camelSpot(i, alpha, tick);
      const inFront = camel.y > u.py[i] + (u.y[i] - u.py[i]) * alpha;
      if (!inFront) this.drawPackCamel(i, camel, tick, scale);
      this.drawCreature(i, alpha, tick, scale);
      if (inFront) this.drawPackCamel(i, camel, tick, scale);
    }
    this.puffDeaths(visible);
  }

  /** Las criaturas que estaban a la vista y ya no existen (han muerto) dejan una nubecilla. */
  private puffDeaths(visible: readonly number[]): void {
    const u = this.units;
    for (const i of this.seen) if (u.resolve(this.seenHandle[i]) === NO_UNIT) this.fx.puff(this.seenX[i], this.seenY[i]);
    this.seen.length = 0;
    for (const i of visible) {
      this.seen.push(i);
      this.seenHandle[i] = u.handleOf(i);
      this.seenX[i] = u.x[i];
      this.seenY[i] = u.y[i];
    }
  }

  /** Resplandor que late en el suelo bajo los monstruos de lava. */
  private drawGlows(visible: readonly number[], alpha: number, tick: number, scale: number): void {
    const u = this.units;
    const cam = this.camera;
    const ctx = this.ctx;
    for (const i of visible) {
      if (!this.speciesGlow[u.species[i]]) continue;
      const sx = (u.px[i] + (u.x[i] - u.px[i]) * alpha - cam.left) * cam.zoom;
      const sy = (u.py[i] + (u.y[i] - u.py[i]) * alpha - cam.top) * cam.zoom;
      const s = this.unitScale(i, scale);
      const pulse = (((tick >> 1) + i) & 3) * 0.035;
      ctx.fillStyle = `rgba(255,130,40,${0.2 + pulse})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy - s, 9 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,210,110,${0.16 + pulse})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy - s, 5 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Las crías se dibujan más pequeñas; los monstruos grandes, más grandes. */
  private unitScale(i: number, scale: number): number {
    const species = this.units.species[i];
    return this.units.age[i] < this.adultTicks[species] ? scale * 0.7 : scale * this.speciesScale[species];
  }

  /** Postura según lo que hace: caminar, trabajar, luchar o comer. */
  private poseOf(i: number, tick: number): number {
    const u = this.units;
    const st = u.state[i];
    if (st === UnitState.WORK) return ((tick >> 2) + i) & 1 ? Pose.RAISE : Pose.STRIKE;
    if (st === UnitState.FIGHT || ((st === UnitState.HUNT || st === UnitState.RAZE) && u.attackCd[i] > 0)) return u.attackCd[i] > 4 ? Pose.STRIKE : Pose.RAISE;
    if (st === UnitState.EAT) return ((tick >> 3) + i) & 1 ? Pose.RAISE : Pose.STRIKE;
    const moving = u.x[i] !== u.px[i] || u.y[i] !== u.py[i];
    return moving ? ((tick >> 1) + i) & 3 : Pose.WALK0;
  }

  private drawCreature(i: number, alpha: number, tick: number, baseScale: number): void {
    const u = this.units;
    const cam = this.camera;
    const ctx = this.ctx;
    const sx = (u.px[i] + (u.x[i] - u.px[i]) * alpha - cam.left) * cam.zoom;
    const sy = (u.py[i] + (u.y[i] - u.py[i]) * alpha - cam.top) * cam.zoom;
    const sp = u.species[i];
    const s = this.unitScale(i, baseScale);
    const moving = u.x[i] !== u.px[i] || u.y[i] !== u.py[i];
    const flip = u.x[i] < u.px[i] || (!moving && u.tx[i] < u.x[i]);
    const pose = this.poseOf(i, tick);
    const k = this.civ.kingdoms.kingdomOfUnit(i);
    const cloth = k >= 0 ? this.civ.kingdoms.kingdoms[k].colorIndex : CLOTH_COUNT - 1;
    const cell = this.atlas.cell(sp, cloth, pose, flip);
    const w = CELL_W * s;
    const h = CELL_H * s;
    // Los pies (fila CELL_H - 2) quedan sobre la posición de la criatura.
    const x0 = Math.round(sx - (CELL_W / 2) * s);
    const y0 = Math.round(sy - (CELL_H - 1.5) * s);
    ctx.drawImage(this.atlas.canvas, cell.sx, cell.sy, CELL_W, CELL_H, x0, y0, Math.round(w), Math.round(h));
    if (u.age[i] < this.adultTicks[sp]) return;
    const hand = this.atlas.hand(sp, pose);
    const hx = x0 + (flip ? CELL_W - 1 - hand.x : hand.x) * s;
    const hy = y0 + hand.y * s;
    const tool = toolFor(u.job[i], u.gear[i] !== 0, this.speciesDiet[sp]);
    if (tool) this.drawTool(tool, pose === Pose.STRIKE, flip, hx, hy, s, u.job[i] === Job.WARRIOR ? k : -1);
    // En una caravana la carga va en el dromedario, no sobre la cabeza.
    if (u.carry[i] !== 0 && !leadsCaravan(u, i)) this.drawCargo(u.carry[i] - 1, x0 + w / 2, y0 + 2 * s, s);
  }

  /** Dónde va el dromedario de carga del mercader `i` en este fotograma. */
  private camelSpot(i: number, alpha: number, tick: number): { x: number; y: number; flip: boolean } {
    const u = this.units;
    const mx = u.x[i] - u.px[i];
    const my = u.y[i] - u.py[i];
    return this.caravans.follow(i, u.handleOf(i), tick, u.px[i] + mx * alpha, u.py[i] + my * alpha, mx, my);
  }

  /** Dromedario de carga de una caravana, con los fardos del mercader sobre la joroba. */
  private drawPackCamel(i: number, p: { x: number; y: number; flip: boolean }, tick: number, baseScale: number): void {
    const u = this.units;
    const cam = this.camera;
    const ctx = this.ctx;
    const mx = u.x[i] - u.px[i];
    const my = u.y[i] - u.py[i];
    const s = baseScale * this.speciesScale[Species.CAMEL];
    const sx = (p.x - cam.left) * cam.zoom;
    const sy = (p.y - cam.top) * cam.zoom;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.round(sx - 6 * s), Math.round(sy - s), Math.round(12 * s), Math.max(1, Math.round(2 * s)));
    const moving = mx !== 0 || my !== 0;
    const pose = moving ? ((tick >> 1) + i + 2) & 3 : Pose.WALK0;
    const cell = this.atlas.cell(Species.CAMEL, CLOTH_COUNT - 1, pose, p.flip);
    const x0 = Math.round(sx - (CELL_W / 2) * s);
    const y0 = Math.round(sy - (CELL_H - 1.5) * s);
    ctx.drawImage(this.atlas.canvas, cell.sx, cell.sy, CELL_W, CELL_H, x0, y0, Math.round(CELL_W * s), Math.round(CELL_H * s));
    // Fardos sobre la joroba; al voltear, cada columna x pasa a CELL_W - 1 - x.
    const humpX = p.flip ? CELL_W - CAMEL_HUMP_X : CAMEL_HUMP_X;
    if (u.carry[i] !== 0) this.drawCargo(u.carry[i] - 1, x0 + humpX * s, y0 + CAMEL_HUMP_Y * s, s);
  }

  /** Herramienta del oficio en la mano (en vertical o, al golpear, hacia delante). */
  private drawTool(tool: string, forward: boolean, flip: boolean, hx: number, hy: number, s: number, kingdom: number): void {
    const r = this.tools.rect(tool, forward, flip);
    if (!r) return;
    // Punto de agarre: abajo en el centro (vertical) o atrás en el centro (hacia delante).
    const gx = forward ? (flip ? r.w - 2 : 1) : r.w / 2;
    const gy = forward ? r.h / 2 : r.h - 2;
    const x = Math.round(hx - gx * s + s / 2);
    const y = Math.round(hy - gy * s + s / 2);
    this.ctx.drawImage(this.tools.canvas, r.sx, r.sy, r.w, r.h, x, y, Math.round(r.w * s), Math.round(r.h * s));
    if (kingdom >= 0 && !forward) {
      // Banderín del reino en la punta de la lanza.
      this.ctx.fillStyle = VILLAGE_COLORS[this.civ.kingdoms.kingdoms[kingdom].colorIndex];
      this.ctx.fillRect(Math.round(x + (flip ? -1 : r.w / 2 + 0.5) * s), Math.round(y + 3 * s), Math.round(2 * s), Math.round(1.5 * s));
    }
  }

  /** Lo que lleva a cuestas (troncos, piedra, mineral, oro o comida), sobre la cabeza. */
  private drawCargo(resource: number, cx: number, top: number, s: number): void {
    const r = this.tools.rect(CARGO_SPRITES[resource], false, false);
    if (!r) return;
    this.ctx.drawImage(this.tools.canvas, r.sx, r.sy, r.w, r.h, Math.round(cx - (r.w / 2) * s), Math.round(top - r.h * s), Math.round(r.w * s), Math.round(r.h * s));
  }

  /** Zoom alejado: puntos agrupados por especie (un solo cambio de color por especie). */
  private drawDots(alpha: number, left: number, top: number, right: number, bottom: number): void {
    const u = this.units;
    const z = this.camera.zoom;
    const dot = Math.max(1.5, z * 0.9);
    const ctx = this.ctx;
    // Aldeanos con el color de su reino; animales y aldeanos sin aldea por especie.
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || u.village[i] < 0) continue;
      const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
      const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
      if (wx < left || wy < top || wx > right || wy > bottom) continue;
      const k = this.civ.kingdoms.kingdomOfUnit(i);
      ctx.fillStyle = k >= 0 ? VILLAGE_COLORS[this.civ.kingdoms.kingdoms[k].colorIndex] : this.speciesColors[u.species[i]];
      ctx.fillRect((wx - left) * z - dot / 2, (wy - top) * z - dot / 2, dot, dot);
    }
    for (let sp = 0; sp < this.speciesColors.length; sp++) {
      ctx.fillStyle = this.speciesColors[sp];
      for (let i = 0; i < u.highWater; i++) {
        if (u.alive[i] === 0 || u.species[i] !== sp || u.village[i] >= 0) continue;
        const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
        const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
        if (wx < left || wy < top || wx > right || wy > bottom) continue;
        ctx.fillRect((wx - left) * z - dot / 2, (wy - top) * z - dot / 2, dot, dot);
      }
    }
  }

  /** Criaturas sujetas por el imán: se dibujan colgando del cursor. */
  private drawHeld(tx: number, ty: number): void {
    const u = this.units;
    const z = this.camera.zoom;
    const p = this.camera.worldToScreen(tx + 0.5, ty + 0.5);
    this.powers.held.forEach((h, k) => {
      const i = u.resolve(h);
      if (i < 0) return;
      const ox = (((k * 7) % 5) - 2) * Math.max(3, z * 0.5);
      const oy = (((k * 3) % 5) - 2) * Math.max(3, z * 0.5) - z;
      const s = Math.max(1, z / SPRITE_PX_PER_TILE);
      const cell = this.atlas.cell(u.species[i], CLOTH_COUNT - 1, Pose.RAISE, false);
      this.ctx.drawImage(this.atlas.canvas, cell.sx, cell.sy, CELL_W, CELL_H, Math.round(p.x + ox - (CELL_W / 2) * s), Math.round(p.y + oy - CELL_H * s), Math.round(CELL_W * s), Math.round(CELL_H * s));
    });
  }

  /** Anillo dorado que late bajo la criatura seleccionada. */
  private drawSelection(i: number, alpha: number, now: number): void {
    const u = this.units;
    if (!u.isAlive(i)) return;
    const wx = u.px[i] + (u.x[i] - u.px[i]) * alpha;
    const wy = u.py[i] + (u.y[i] - u.py[i]) * alpha;
    const p = this.camera.worldToScreen(wx, wy);
    const beat = this.fx.reducedMotion ? 0.5 : (Math.sin(now / 180) + 1) / 2;
    const r = Math.max(6, this.camera.zoom * 1.2) * (1 + beat * 0.12);
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(242,193,78,${0.25 + beat * 0.25})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawTileMarker(tile: number): void {
    const x = tile % this.world.width;
    const y = Math.floor(tile / this.world.width);
    const p = this.camera.worldToScreen(x, y);
    const z = Math.max(this.camera.zoom, 3);
    this.ctx.strokeStyle = '#f2c14e';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(p.x - 1, p.y - 1, z + 2, z + 2);
  }

  /** Pincel: relleno tenue y anillo discontinuo que gira, del color de la herramienta. */
  private drawBrush(brush: { x: number; y: number; size: number; tone: ToolTone }, now: number): void {
    const p = this.camera.worldToScreen(brush.x + 0.5, brush.y + 0.5);
    const r = Math.max(3, (brush.size / 2) * this.camera.zoom);
    const [ring, fill] = BRUSH_COLORS[brush.tone];
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    // Trazos de unos 8 px, siempre un número entero para que el anillo cierre.
    const dashes = Math.max(4, Math.round((Math.PI * r) / 8));
    const step = (Math.PI * 2) / dashes;
    const spin = this.fx.reducedMotion ? 0 : (now / 1600) % step;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < dashes; k++) {
      const a = spin + k * step;
      ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      ctx.arc(p.x, p.y, r, a, a + step * 0.55);
    }
    ctx.stroke();
  }
}
