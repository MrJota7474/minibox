import { describe, expect, it } from 'vitest';
import { StrokeController } from '../src/powers/stroke';
import { TOOLS, commandFor, toolById } from '../src/powers/tools';
import type { Command } from '../src/sim/commands';

function controller(toolId: string, size: number): { ctl: StrokeController; out: Command[] } {
  const out: Command[] = [];
  const ctl = new StrokeController((c) => out.push(c));
  ctl.tool = toolById(toolId) ?? null;
  ctl.size = size;
  return { ctl, out };
}

describe('StrokeController', () => {
  it('aplica al empezar y rellena huecos al arrastrar', () => {
    const { ctl, out } = controller('soil', 1);
    ctl.start(0, 0, 0);
    ctl.move(5, 0, 10);
    expect(out.map((c) => (c.type === 'brush' ? c.x : -1))).toEqual([0, 1, 2, 3, 4, 5]);
    ctl.end();
    ctl.move(9, 0, 20);
    expect(out).toHaveLength(6);
  });

  it('con pincel grande espacia los toques', () => {
    const { ctl, out } = controller('soil', 9);
    ctl.start(0, 0, 0);
    ctl.move(8, 0, 10);
    expect(out).toHaveLength(3);
  });

  it('repite herramientas continuas mientras se mantiene pulsado', () => {
    const { ctl, out } = controller('raise', 3);
    ctl.start(4, 4, 0);
    ctl.update(50);
    expect(out).toHaveLength(1);
    ctl.update(130);
    expect(out).toHaveLength(2);
  });

  it('no hace nada sin herramienta', () => {
    const out: Command[] = [];
    const ctl = new StrokeController((c) => out.push(c));
    ctl.start(0, 0, 0);
    ctl.move(3, 3, 1);
    ctl.update(1000);
    expect(out).toEqual([]);
    expect(ctl.isActive).toBe(false);
  });

  it('las herramientas de criaturas generan comandos spawn', () => {
    const wolf = toolById('wolf');
    expect(wolf).toBeDefined();
    if (!wolf) return;
    expect(commandFor(wolf, 1, 2, 3)).toEqual({ type: 'spawn', species: 2, x: 1, y: 2, size: 3 });
    expect(TOOLS.every((t) => t.label.length > 0)).toBe(true);
  });
});
