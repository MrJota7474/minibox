import { FixedClock, type Speed } from './core/clock';
import type { DeviceProfile } from './core/device';
import { SPECIES, Species } from './entities/species';
import { GestureRecognizer, type GestureEvent } from './input/gestures';
import { Keyboard } from './input/keyboard';
import { PointerInput } from './input/pointer-input';
import { StrokeController } from './powers/stroke';
import type { ToolDef } from './powers/tools';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { buildSpriteAtlas, type SpriteAtlas } from './render/sprites';
import type { Command } from './sim/commands';
import { Simulation } from './sim/simulation';
import { isFertileTerrain } from './world/terrain';
import { el } from './ui/dom';
import { Hud, type HudCounts } from './ui/hud';
import { Inspector } from './ui/inspector';
import { Menu } from './ui/menu';
import { PerfPanel } from './ui/perf-panel';
import { StartMenu, type NewWorldOptions } from './ui/start-menu';
import { Toasts } from './ui/toast';
import { Toolbar } from './ui/toolbar';

const UI_INTERVAL_MS = 250;

/** Recuento agrupado para la barra superior. */
function hudCounts(sim: Simulation): HudCounts {
  const c = sim.units.speciesCount;
  let herbivores = 0;
  let predators = 0;
  let people = 0;
  SPECIES.forEach((s, k) => {
    if (s.diet === 'herbivore') herbivores += c[k];
    else if (s.diet === 'carnivore') predators += c[k];
    else people += c[k];
  });
  const villages = sim.civ.villages.reduce((n, v) => n + (v.alive ? 1 : 0), 0);
  const wars = sim.civ.kingdoms.wars.reduce((n, w) => n + (w.active ? 1 : 0), 0);
  return { wars, herbivores, predators, people, villages, total: sim.units.count, limit: sim.unitLimit };
}
const PERF_WINDOW_MS = 5000;
const LOW_FPS = 24;
/** Trabajo de CPU por frame a partir del cual se considera que el equipo no da abasto. */
const HEAVY_WORK_MS = 22;
const MIN_UNIT_LIMIT = 200;
const INITIAL_ZOOM_FACTOR = 1.8;
const TAP_PICK_PX = 14;
const LIMIT_TOAST_COOLDOWN_MS = 4000;

/** Une simulación, render, entrada e interfaz, y ejecuta el bucle principal. */
export class Game {
  private sim: Simulation | null = null;
  private camera: Camera | null = null;
  private renderer: Renderer | null = null;
  private readonly clock = new FixedClock();
  private readonly recognizer = new GestureRecognizer();
  private readonly stroke: StrokeController;
  private readonly canvas: HTMLCanvasElement;
  private readonly atlas: SpriteAtlas;
  private readonly hud: Hud;
  private readonly toolbar: Toolbar;
  private readonly inspector: Inspector;
  private readonly startMenu: StartMenu;
  private readonly menu: Menu;
  private readonly perf: PerfPanel;
  private readonly toasts = new Toasts();
  private readonly keyboard: Keyboard;

  private tool: ToolDef | null = null;
  private moveMode = false;
  private brushSize = 3;
  private hoverTile: { x: number; y: number } | null = null;
  private selectedHandle = -1;
  private selectedTile = -1;
  private following = false;
  private lastSpeed: Speed = 1;
  private pendingUpdate: (() => void) | null = null;

  private lastFrame = 0;
  private lastUi = 0;
  private frameMsAvg = 16;
  private tickMsAvg = 0;
  private workMsAvg = 0;
  private perfWindowStart = 0;
  private perfFrames = 0;

  constructor(
    root: HTMLElement,
    private readonly device: DeviceProfile,
  ) {
    this.atlas = buildSpriteAtlas();
    this.canvas = el('canvas', { class: 'view', attrs: { 'aria-label': 'Mapa del mundo' } });
    this.stroke = new StrokeController((c) => this.applyCommand(c));
    this.hud = new Hud(this.atlas, {
      setSpeed: (s) => this.setSpeed(s),
      openMenu: () => this.menu.open(),
      toggleFullscreen: () => this.toggleFullscreen(),
    });
    this.toolbar = new Toolbar(this.atlas, {
      selectTool: (t) => this.selectTool(t),
      setBrushSize: (s) => {
        this.brushSize = s;
        this.stroke.size = s;
      },
      setMoveMode: (on) => {
        this.moveMode = on;
        this.updateInputMode();
      },
    });
    this.inspector = new Inspector(this.atlas, {
      close: () => this.clearSelection(),
      toggleFollow: () => this.toggleFollow(),
      diplomacy: (action, a, b) => this.applyCommand({ type: 'diplomacy', action, a, b }),
    });
    this.startMenu = new StartMenu(device, (o) => this.newWorld(o), () => this.startMenu.close());
    this.menu = new Menu({
      newWorld: () => {
        // Si hay una versión nueva descargada, se instala ahora (no hay partida que perder).
        if (this.pendingUpdate) this.pendingUpdate();
        else this.startMenu.open(this.sim !== null);
      },
      toggleFullscreen: () => this.toggleFullscreen(),
      togglePerf: () => this.perf.toggle(),
      chronicle: () => this.sim?.civ.chronicle ?? [],
    });
    this.perf = new PerfPanel({ stress: (k) => this.stress(k) });
    root.append(this.canvas, this.hud.root, this.inspector.root, this.perf.root, this.toasts.root, this.toolbar.root, this.menu.root, this.startMenu.root);

    new PointerInput(this.canvas, this.recognizer, (e) => this.onGesture(e), () => (this.hoverTile = null));
    this.keyboard = new Keyboard({
      togglePause: () => this.togglePause(),
      setSpeed: (s) => this.setSpeed(s),
      changeBrushSize: (d) => this.toolbar.changeSize(d),
      cycleTab: (d) => this.toolbar.cycleTab(d),
      selectInspect: () => this.toolbar.selectTool(null),
      toggleMoveMode: () => this.toolbar.toggleMoveMode(),
      escape: () => this.escape(),
      toggleFullscreen: () => this.toggleFullscreen(),
      togglePerf: () => this.perf.toggle(),
      panBy: (dx, dy) => {
        this.camera?.pan(dx, dy);
        this.stopFollowing();
      },
      setPanModifier: (on) => (this.recognizer.panModifier = on),
      shortcutsEnabled: () => !this.menu.isOpen && !this.startMenu.isOpen,
    });
    new ResizeObserver(() => this.renderer?.resize()).observe(this.canvas);
    this.brushSize = this.toolbar.brushSize;
    this.stroke.size = this.brushSize;
    this.setSpeed(1);
  }

  /** Llega una versión nueva (service worker): se aplica sin interrumpir una partida en curso. */
  notifyUpdate(apply: () => void): void {
    if (!this.sim) {
      apply();
      return;
    }
    this.pendingUpdate = apply;
    this.toasts.show('Hay una versión nueva: se instalará al crear otro mundo');
  }

  start(): void {
    this.startMenu.open(false);
    requestAnimationFrame(this.frame);
  }

  private newWorld(opts: NewWorldOptions): void {
    this.startMenu.close();
    this.clearSelection();
    const sim = new Simulation({ seedText: opts.seedText, size: opts.size, capacity: this.device.unitCap, populate: opts.populate });
    const camera = new Camera(opts.size, opts.size);
    this.sim = sim;
    this.camera = camera;
    this.renderer = new Renderer(this.canvas, sim.world, sim.units, camera, sim.civ, this.device.dprCap, this.atlas);
    this.renderer.resize();
    camera.fitWorld();
    camera.zoomAt(INITIAL_ZOOM_FACTOR, camera.viewW / 2, camera.viewH / 2);
    this.perfWindowStart = 0;
    this.toasts.show(`Mundo «${opts.seedText}» creado`);
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const workStart = performance.now();
    const dt = this.lastFrame ? now - this.lastFrame : 16;
    this.lastFrame = now;
    this.frameMsAvg += (dt - this.frameMsAvg) * 0.05;
    for (const e of this.recognizer.update(now)) this.onGesture(e);
    this.stroke.update(now);
    const sim = this.sim;
    const renderer = this.renderer;
    if (!sim || !renderer || !this.camera) return;

    const ticks = this.clock.advance(dt);
    if (ticks > 0) {
      const t0 = performance.now();
      for (let t = 0; t < ticks; t++) sim.step();
      this.tickMsAvg += ((performance.now() - t0) / ticks - this.tickMsAvg) * 0.1;
    }
    this.followSelected();
    renderer.draw(this.clock.alpha(), sim.tick, {
      brush: this.brushPreview(),
      selected: this.selectedHandle >= 0 ? sim.units.resolve(this.selectedHandle) : -1,
      selectedTile: this.selectedTile,
    });
    if (now - this.lastUi >= UI_INTERVAL_MS) {
      this.lastUi = now;
      this.updateUi(sim);
    }
    this.workMsAvg += (performance.now() - workStart - this.workMsAvg) * 0.05;
    this.checkPerformance(now, sim);
  };

  /** Sólo depuración (window.minibox en desarrollo): avanza ticks y redibuja sin depender de requestAnimationFrame. */
  debugAdvance(ticks: number): void {
    const sim = this.sim;
    if (!sim || !this.renderer) return;
    for (let t = 0; t < ticks; t++) sim.step();
    this.renderer.draw(1, sim.tick, { brush: null, selected: -1, selectedTile: -1 });
    this.updateUi(sim);
  }

  /** Sólo depuración: acceso a la cámara. */
  get debugCamera(): Camera | null {
    return this.camera;
  }

  /** Sólo depuración: acceso a la simulación actual. */
  get debugSim(): Simulation | null {
    return this.sim;
  }

  private updateUi(sim: Simulation): void {
    this.hud.update(sim.tick, hudCounts(sim));
    this.showCivEvents(sim);
    this.inspector.update(sim);
    if (this.perf.isOpen) {
      this.perf.update({
        fps: 1000 / Math.max(1, this.frameMsAvg),
        frameMs: this.frameMsAvg,
        workMs: this.workMsAvg,
        tickMs: this.tickMsAvg,
        units: sim.units.count,
        limit: sim.unitLimit,
        tier: this.device.tier,
        dpr: Math.min(window.devicePixelRatio || 1, this.renderer?.getDprCap() ?? 1),
      });
    }
  }

  /** Si el equipo va lento, baja primero la resolución y luego el límite de criaturas. */
  private checkPerformance(now: number, sim: Simulation): void {
    if (this.perfWindowStart === 0) {
      this.perfWindowStart = now;
      this.perfFrames = 0;
      return;
    }
    this.perfFrames++;
    const elapsed = now - this.perfWindowStart;
    if (elapsed < PERF_WINDOW_MS) return;
    const fps = (this.perfFrames * 1000) / elapsed;
    this.perfWindowStart = now;
    this.perfFrames = 0;
    // Sólo se reduce la calidad si de verdad falta CPU (un FPS bajo por ahorro de energía no cuenta).
    if (fps >= LOW_FPS || this.workMsAvg < HEAVY_WORK_MS || this.clock.speed === 0 || document.visibilityState !== 'visible') return;
    const renderer = this.renderer;
    if (renderer && renderer.getDprCap() > 1) {
      renderer.setDprCap(1);
      this.toasts.show('Rendimiento: resolución reducida');
    } else if (sim.unitLimit > MIN_UNIT_LIMIT) {
      const value = Math.max(MIN_UNIT_LIMIT, Math.floor(sim.unitLimit * 0.75));
      sim.apply({ type: 'limit', value });
      this.toasts.show(`Rendimiento: límite de criaturas reducido a ${value}`);
    }
  }

  private applyCommand(c: Command): void {
    if (!this.sim) return;
    const r = this.sim.apply(c);
    if (r.limited) this.toasts.show(`Límite de criaturas alcanzado (${this.sim.unitLimit})`, LIMIT_TOAST_COOLDOWN_MS);
  }

  private tileAt(sx: number, sy: number): { x: number; y: number } | null {
    if (!this.camera) return null;
    const w = this.camera.screenToWorld(sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  private onGesture(e: GestureEvent): void {
    const cam = this.camera;
    if (!cam) return;
    const now = performance.now();
    switch (e.type) {
      case 'stroke-start':
      case 'stroke-move': {
        const t = this.tileAt(e.x, e.y);
        if (!t) return;
        this.hoverTile = t;
        if (e.type === 'stroke-start') this.stroke.start(t.x, t.y, now);
        else this.stroke.move(t.x, t.y, now);
        break;
      }
      case 'stroke-end':
        this.stroke.end();
        if (this.recognizer.lastInputTouch) this.hoverTile = null;
        break;
      case 'pan':
        cam.pan(e.dx, e.dy);
        this.stopFollowing();
        this.keyboard.notePan();
        break;
      case 'zoom':
        cam.zoomAt(e.factor, e.x, e.y);
        break;
      case 'tap':
        this.inspectAt(e.x, e.y);
        break;
      case 'hover':
        this.hoverTile = this.tileAt(e.x, e.y);
        break;
    }
  }

  private brushPreview(): { x: number; y: number; size: number } | null {
    if (!this.tool || this.moveMode || !this.hoverTile) return null;
    if (this.recognizer.activePointers > 0 && !this.stroke.isActive) return null;
    return { x: this.hoverTile.x, y: this.hoverTile.y, size: this.brushSize };
  }

  private inspectAt(sx: number, sy: number): void {
    const sim = this.sim;
    const cam = this.camera;
    if (!sim || !cam) return;
    const p = cam.screenToWorld(sx, sy);
    sim.spatial.rebuild(sim.units);
    const radius = Math.max(1.2, TAP_PICK_PX / cam.zoom);
    const i = sim.spatial.nearest(sim.units, p.x, p.y, radius, () => true);
    this.following = false;
    this.inspector.setFollowing(false);
    const tx0 = Math.floor(p.x);
    const ty0 = Math.floor(p.y);
    const building = sim.world.inBounds(tx0, ty0) ? sim.world.buildingAt[sim.world.idx(tx0, ty0)] : 0;
    if (i >= 0) {
      this.selectedHandle = sim.units.handleOf(i);
      this.selectedTile = -1;
      this.inspector.showUnit(this.selectedHandle);
    } else if (building > 0) {
      this.selectedHandle = -1;
      this.selectedTile = -1;
      this.inspector.showVillage(sim.civ.buildings[building - 1].village);
    } else {
      const tx = Math.floor(p.x);
      const ty = Math.floor(p.y);
      if (!sim.world.inBounds(tx, ty)) return this.clearSelection();
      this.selectedHandle = -1;
      this.selectedTile = sim.world.idx(tx, ty);
      this.inspector.showTile(this.selectedTile);
    }
    this.inspector.update(sim);
  }

  /** Avisos de la simulación (fundaciones, mejoras, abandonos) como toasts. */
  private showCivEvents(sim: Simulation): void {
    const events = sim.civ.events;
    for (const e of events) this.toasts.show(e.text);
    events.length = 0;
  }

  private clearSelection(): void {
    this.selectedHandle = -1;
    this.selectedTile = -1;
    this.following = false;
    this.inspector.setFollowing(false);
    this.inspector.hide();
  }

  private stopFollowing(): void {
    if (!this.following) return;
    this.following = false;
    this.inspector.setFollowing(false);
  }

  private toggleFollow(): void {
    this.following = !this.following && this.selectedHandle >= 0;
    this.inspector.setFollowing(this.following);
  }

  private followSelected(): void {
    if (!this.following || !this.sim || !this.camera) return;
    const i = this.sim.units.resolve(this.selectedHandle);
    if (i < 0) {
      this.following = false;
      this.inspector.setFollowing(false);
      return;
    }
    // Posición interpolada, igual que la del sprite, para que la cámara no tiemble.
    const u = this.sim.units;
    const a = this.clock.alpha();
    this.camera.centerOn(u.px[i] + (u.x[i] - u.px[i]) * a, u.py[i] + (u.y[i] - u.py[i]) * a);
  }

  private selectTool(tool: ToolDef | null): void {
    this.tool = tool;
    this.stroke.tool = tool;
    this.stroke.end();
    this.updateInputMode();
  }

  private updateInputMode(): void {
    this.recognizer.mode = this.tool && !this.moveMode ? 'paint' : 'pan';
  }

  private setSpeed(speed: Speed): void {
    if (speed !== 0) this.lastSpeed = speed;
    this.clock.speed = speed;
    this.hud.setSpeed(speed);
  }

  private togglePause(): void {
    this.setSpeed(this.clock.speed === 0 ? this.lastSpeed : 0);
  }

  private escape(): void {
    if (this.menu.isOpen) this.menu.close();
    else if (this.startMenu.isOpen) {
      if (this.sim) this.startMenu.close();
    }
    else if (this.inspector.isOpen) this.clearSelection();
    else if (this.moveMode) this.toolbar.setMoveMode(false);
    else if (this.tool) this.toolbar.selectTool(null);
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenEnabled) return;
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    request.catch(() => this.toasts.show('No se pudo cambiar a pantalla completa'));
  }

  /** Prueba de estrés: crea muchas criaturas repartidas por el mapa. */
  private stress(kind: 'herbivores' | 'wolves'): void {
    const sim = this.sim;
    if (!sim) return;
    const groups = kind === 'herbivores' ? 17 : 4;
    for (let g = 0; g < groups; g++) {
      const species = kind === 'wolves' ? Species.WOLF : g % 2 === 0 ? Species.SHEEP : Species.RABBIT;
      for (let a = 0; a < 30; a++) {
        const i = Math.floor(Math.random() * sim.world.size);
        if (!isFertileTerrain(sim.world.terrain[i])) continue;
        this.applyCommand({ type: 'spawn', species, x: i % sim.world.width, y: Math.floor(i / sim.world.width), size: 15 });
        break;
      }
    }
  }
}
