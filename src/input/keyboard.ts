import type { Speed } from '../core/clock';

export interface KeyboardActions {
  togglePause(): void;
  setSpeed(speed: Speed): void;
  changeBrushSize(delta: number): void;
  cycleTab(delta: number): void;
  selectInspect(): void;
  toggleMoveMode(): void;
  escape(): void;
  toggleFullscreen(): void;
  togglePerf(): void;
  panBy(dx: number, dy: number): void;
  /** Activa/desactiva el desplazamiento temporal con la barra espaciadora. */
  setPanModifier(active: boolean): void;
  /** false mientras hay un menú abierto: sólo Esc funciona. */
  shortcutsEnabled(): boolean;
}

const ARROW_PAN_PX = 60;

/**
 * Atajos de teclado. La barra espaciadora pausa al pulsarla sola,
 * pero si se arrastra el mapa mientras está pulsada sólo sirve para mover.
 */
export class Keyboard {
  private spaceDown = false;
  private spaceUsedForPan = false;
  private readonly onDown = (e: KeyboardEvent): void => this.handleDown(e);
  private readonly onUp = (e: KeyboardEvent): void => this.handleUp(e);
  private readonly onBlur = (): void => this.releaseSpace();

  constructor(private readonly actions: KeyboardActions) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Avisa de que hubo un desplazamiento con la barra espaciadora pulsada. */
  notePan(): void {
    if (this.spaceDown) this.spaceUsedForPan = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private releaseSpace(): void {
    if (!this.spaceDown) return;
    this.spaceDown = false;
    this.actions.setPanModifier(false);
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  }

  private onButton(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'BUTTON' || t.tagName === 'A');
  }

  private handleDown(e: KeyboardEvent): void {
    if (this.isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = this.actions;
    if (e.code !== 'Escape' && !a.shortcutsEnabled()) return;
    // Espacio sobre un botón enfocado debe pulsar el botón, no pausar.
    if (e.code === 'Space' && this.onButton(e)) return;
    const handled = this.dispatch(e, a);
    if (handled) e.preventDefault();
  }

  private dispatch(e: KeyboardEvent, a: KeyboardActions): boolean {
    switch (e.code) {
      case 'Space':
        if (!e.repeat) {
          this.spaceDown = true;
          this.spaceUsedForPan = false;
          a.setPanModifier(true);
        }
        return true;
      case 'Digit1':
        a.setSpeed(1);
        return true;
      case 'Digit2':
        a.setSpeed(2);
        return true;
      case 'Digit3':
        a.setSpeed(5);
        return true;
      case 'BracketLeft':
      case 'Minus':
        a.changeBrushSize(-1);
        return true;
      case 'BracketRight':
      case 'Equal':
        a.changeBrushSize(1);
        return true;
      case 'KeyQ':
        a.cycleTab(-1);
        return true;
      case 'KeyE':
        a.cycleTab(1);
        return true;
      case 'KeyI':
        a.selectInspect();
        return true;
      case 'KeyM':
        a.toggleMoveMode();
        return true;
      case 'KeyF':
        a.toggleFullscreen();
        return true;
      case 'KeyP':
        a.togglePerf();
        return true;
      case 'Escape':
        a.escape();
        return true;
      case 'ArrowLeft':
        a.panBy(ARROW_PAN_PX, 0);
        return true;
      case 'ArrowRight':
        a.panBy(-ARROW_PAN_PX, 0);
        return true;
      case 'ArrowUp':
        a.panBy(0, ARROW_PAN_PX);
        return true;
      case 'ArrowDown':
        a.panBy(0, -ARROW_PAN_PX);
        return true;
      default:
        return false;
    }
  }

  private handleUp(e: KeyboardEvent): void {
    if (e.code !== 'Space' || !this.spaceDown) return;
    this.spaceDown = false;
    this.actions.setPanModifier(false);
    if (!this.spaceUsedForPan && !this.isTyping(e)) this.actions.togglePause();
  }
}
