import { el } from './dom';

const TOAST_MS = 2600;
const MAX_TOASTS = 3;

/** Avisos breves en pantalla. */
export class Toasts {
  readonly root: HTMLDivElement;
  private readonly recent = new Map<string, number>();

  constructor() {
    this.root = el('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  }

  /** Muestra un aviso; los repetidos dentro de `cooldownMs` se ignoran. */
  show(message: string, cooldownMs = 0): void {
    const now = performance.now();
    const last = this.recent.get(message);
    if (last !== undefined && now - last < cooldownMs) return;
    this.recent.set(message, now);
    const node = el('div', { class: 'toast', text: message });
    this.root.append(node);
    while (this.root.children.length > MAX_TOASTS) this.root.firstElementChild?.remove();
    window.setTimeout(() => node.classList.add('is-leaving'), TOAST_MS);
    window.setTimeout(() => node.remove(), TOAST_MS + 400);
  }
}
