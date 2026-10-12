import { el } from './dom';

export interface PerfSample {
  fps: number;
  frameMs: number;
  /** Tiempo de CPU del juego por frame (simulación + render). */
  workMs: number;
  tickMs: number;
  units: number;
  limit: number;
  tier: string;
  dpr: number;
}

export interface PerfActions {
  stress(kind: 'herbivores' | 'wolves'): void;
}

/** Panel de rendimiento (P) con botones de prueba de estrés. */
export class PerfPanel {
  readonly root: HTMLElement;
  private readonly text: HTMLElement;

  constructor(actions: PerfActions) {
    this.text = el('pre', { class: 'perf-text' });
    this.root = el('div', { class: 'perf', attrs: { hidden: '' } }, [
      this.text,
      el('div', { class: 'perf-actions' }, [
        el('button', { class: 'btn btn-text', text: '+300 herbívoros', attrs: { type: 'button' }, onClick: () => actions.stress('herbivores') }),
        el('button', { class: 'btn btn-text', text: '+40 lobos', attrs: { type: 'button' }, onClick: () => actions.stress('wolves') }),
      ]),
    ]);
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  update(s: PerfSample): void {
    this.text.textContent = [
      `FPS ${s.fps.toFixed(0)} · frame ${s.frameMs.toFixed(1)} ms`,
      `CPU ${s.workMs.toFixed(1)} ms/frame`,
      `simulación ${s.tickMs.toFixed(2)} ms/tick`,
      `criaturas ${s.units}/${s.limit}`,
      `nivel ${s.tier} · resolución x${s.dpr}`,
    ].join('\n');
  }
}
