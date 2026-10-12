export interface Point {
  x: number;
  y: number;
}

export const MAX_ZOOM = 40;

/** Cámara 2D: centro en casillas y zoom en píxeles CSS por casilla. */
export class Camera {
  x: number;
  y: number;
  zoom = 4;
  viewW = 1;
  viewH = 1;
  minZoom = 1;
  readonly maxZoom = MAX_ZOOM;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {
    this.x = worldW / 2;
    this.y = worldH / 2;
  }

  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.minZoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.8;
    this.zoom = this.clampZoom(this.zoom);
    this.clamp();
  }

  get left(): number {
    return this.x - this.viewW / 2 / this.zoom;
  }

  get top(): number {
    return this.y - this.viewH / 2 / this.zoom;
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: this.left + sx / this.zoom, y: this.top + sy / this.zoom };
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: (wx - this.left) * this.zoom, y: (wy - this.top) * this.zoom };
  }

  pan(dxPx: number, dyPx: number): void {
    this.x -= dxPx / this.zoom;
    this.y -= dyPx / this.zoom;
    this.clamp();
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = this.clampZoom(this.zoom * factor);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  /** Encuadra todo el mapa. */
  fitWorld(): void {
    this.zoom = this.clampZoom(Math.min(this.viewW / this.worldW, this.viewH / this.worldH));
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
  }

  private clampZoom(z: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, z));
  }

  private clamp(): void {
    this.x = Math.min(this.worldW, Math.max(0, this.x));
    this.y = Math.min(this.worldH, Math.max(0, this.y));
  }
}
