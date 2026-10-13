import { BRUSH_SIZES } from '../powers/brush';
import { TABS, TOOLS, type TabId, type ToolDef } from '../powers/tools';
import type { CreatureAtlas } from '../render/creature-art';
import { el, iconButton, setPressed } from './dom';
import { gridIcon, toolIcon } from './icons';

export interface ToolbarActions {
  selectTool(tool: ToolDef | null): void;
  setBrushSize(size: number): void;
  setMoveMode(active: boolean): void;
}

/** Barra inferior plegable: pestañas, herramientas, inspeccionar, mover y tamaño de pincel. */
export class Toolbar {
  readonly root: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly toolButtons = new Map<string, HTMLButtonElement>();
  private readonly toolRow: HTMLElement;
  private readonly inspectBtn: HTMLButtonElement;
  private readonly moveBtn: HTMLButtonElement;
  private readonly sizeLabel: HTMLElement;
  private tab: TabId = 'terreno';
  private toolId: string | null = null;
  private moveMode = false;
  private sizeIndex = 1;

  constructor(
    private readonly atlas: CreatureAtlas,
    private readonly actions: ToolbarActions,
  ) {
    const tabs = el(
      'div',
      { class: 'tabs', attrs: { role: 'tablist' } },
      TABS.map((t) => {
        const b = el('button', { class: 'tab', text: t.label, attrs: { type: 'button', role: 'tab' }, onClick: () => this.setTab(t.id) });
        this.tabButtons.set(t.id, b);
        return b;
      }),
    );
    this.toolRow = el('div', { class: 'tools', attrs: { role: 'toolbar', 'aria-label': 'Herramientas' } });
    this.inspectBtn = iconButton(gridIcon('inspect'), 'Inspeccionar (I)', { class: 'btn-quick', showLabel: true, onClick: () => this.selectTool(null) });
    this.moveBtn = iconButton(gridIcon('move'), 'Mover (M)', { class: 'btn-quick', showLabel: true, onClick: () => this.toggleMoveMode() });
    this.sizeLabel = el('span', { class: 'size-value' });
    const sizeCtl = el('div', { class: 'size-ctl', title: 'Tamaño del pincel ([ y ])' }, [
      el('button', { class: 'btn btn-size', text: '−', title: 'Pincel más pequeño', attrs: { type: 'button' }, onClick: () => this.changeSize(-1) }),
      this.sizeLabel,
      el('button', { class: 'btn btn-size', text: '+', title: 'Pincel más grande', attrs: { type: 'button' }, onClick: () => this.changeSize(1) }),
    ]);
    const collapse = el('button', { class: 'dock-handle', title: 'Plegar herramientas', attrs: { type: 'button', 'aria-expanded': 'true' } }, [
      el('img', { attrs: { src: gridIcon('chevron'), alt: '' } }),
    ]);
    collapse.addEventListener('click', () => {
      const collapsed = this.root.classList.toggle('is-collapsed');
      collapse.setAttribute('aria-expanded', String(!collapsed));
    });
    this.root = el('footer', { class: 'dock' }, [
      collapse,
      el('div', { class: 'dock-body' }, [tabs, el('div', { class: 'quick' }, [this.inspectBtn, this.moveBtn, sizeCtl]), this.toolRow]),
    ]);
    this.setTab('terreno');
    this.refresh();
  }

  get brushSize(): number {
    return BRUSH_SIZES[this.sizeIndex];
  }

  setTab(tab: TabId): void {
    this.tab = tab;
    for (const [id, b] of this.tabButtons) {
      setPressed(b, id === tab);
      b.setAttribute('aria-selected', String(id === tab));
    }
    this.toolButtons.clear();
    this.toolRow.replaceChildren(
      ...TOOLS.filter((t) => t.tab === tab).map((t) => {
        const b = iconButton(toolIcon(t, this.atlas), t.label, { class: 'btn-tool', showLabel: true, onClick: () => this.selectTool(t) });
        this.toolButtons.set(t.id, b);
        return b;
      }),
    );
    this.refresh();
  }

  cycleTab(delta: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + delta + TABS.length) % TABS.length].id);
  }

  selectTool(tool: ToolDef | null): void {
    this.toolId = tool ? tool.id : null;
    if (tool && this.moveMode) this.setMoveMode(false);
    this.actions.selectTool(tool);
    this.refresh();
  }

  toggleMoveMode(): void {
    this.setMoveMode(!this.moveMode);
  }

  setMoveMode(active: boolean): void {
    this.moveMode = active;
    this.actions.setMoveMode(active);
    this.refresh();
  }

  changeSize(delta: number): void {
    this.sizeIndex = Math.min(BRUSH_SIZES.length - 1, Math.max(0, this.sizeIndex + delta));
    this.actions.setBrushSize(this.brushSize);
    this.refresh();
  }

  private refresh(): void {
    for (const [id, b] of this.toolButtons) setPressed(b, id === this.toolId);
    setPressed(this.inspectBtn, this.toolId === null && !this.moveMode);
    setPressed(this.moveBtn, this.moveMode);
    this.sizeLabel.textContent = String(this.brushSize);
  }
}
