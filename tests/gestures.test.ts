import { describe, expect, it } from 'vitest';
import { GestureRecognizer, TAP_MAX_MS, TOUCH_PAINT_DELAY_MS, type GestureEvent, type PointerSample } from '../src/input/gestures';

const touch = (id: number, x: number, y: number, time: number): PointerSample => ({ id, x, y, time, touch: true, button: 0 });
const mouse = (x: number, y: number, time: number, button = 0): PointerSample => ({ id: 1, x, y, time, touch: false, button });
const types = (events: GestureEvent[]): string[] => events.map((e) => e.type);

function painter(): GestureRecognizer {
  const g = new GestureRecognizer();
  g.mode = 'paint';
  return g;
}

describe('táctil en modo pintar', () => {
  it('no pinta inmediatamente; empieza tras el retraso', () => {
    const g = painter();
    expect(g.down(touch(1, 10, 10, 0))).toEqual([]);
    expect(g.update(TOUCH_PAINT_DELAY_MS - 1)).toEqual([]);
    expect(types(g.update(TOUCH_PAINT_DELAY_MS))).toEqual(['stroke-start']);
    expect(types(g.up(touch(1, 10, 10, 200)))).toEqual(['stroke-end']);
  });

  it('empieza antes si el dedo se desplaza', () => {
    const g = painter();
    g.down(touch(1, 10, 10, 0));
    const ev = g.move(touch(1, 30, 10, 20));
    expect(types(ev)).toEqual(['stroke-start', 'stroke-move']);
    expect(ev[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('un segundo dedo dentro del retraso cancela: no se pinta nada', () => {
    const g = painter();
    const all: GestureEvent[] = [];
    all.push(...g.down(touch(1, 10, 10, 0)));
    all.push(...g.down(touch(2, 100, 10, 30)));
    all.push(...g.update(200));
    all.push(...g.move(touch(2, 120, 10, 210)));
    all.push(...g.up(touch(1, 10, 10, 300)));
    all.push(...g.move(touch(2, 140, 10, 310)));
    all.push(...g.up(touch(2, 140, 10, 320)));
    expect(all.some((e) => e.type.startsWith('stroke'))).toBe(false);
    expect(all.some((e) => e.type === 'zoom')).toBe(true);
  });

  it('un toque corto aplica la herramienta una vez', () => {
    const g = painter();
    g.down(touch(1, 5, 5, 0));
    expect(types(g.up(touch(1, 5, 5, 40)))).toEqual(['stroke-start', 'stroke-end']);
  });

  it('el pellizco produce zoom y desplazamiento', () => {
    const g = painter();
    g.down(touch(1, 0, 0, 0));
    g.down(touch(2, 100, 0, 10));
    const ev = g.move(touch(2, 200, 0, 20));
    const zoom = ev.find((e) => e.type === 'zoom');
    expect(zoom).toMatchObject({ factor: 2 });
    expect(ev.some((e) => e.type === 'pan')).toBe(true);
  });

  it('reset olvida dedos perdidos (cambio de app) y cierra el trazo', () => {
    const g = painter();
    g.down(touch(1, 5, 5, 0));
    g.update(TOUCH_PAINT_DELAY_MS);
    expect(types(g.reset())).toEqual(['stroke-end']);
    expect(g.activePointers).toBe(0);
    expect(g.lastInputTouch).toBe(true);
    // Un dedo nuevo vuelve a pintar con normalidad (no entra en pellizco).
    g.down(touch(7, 9, 9, 500));
    expect(types(g.update(500 + TOUCH_PAINT_DELAY_MS))).toEqual(['stroke-start']);
  });

  it('pointercancel durante la espera no pinta', () => {
    const g = painter();
    g.down(touch(1, 5, 5, 0));
    expect(g.cancel(touch(1, 5, 5, 20))).toEqual([]);
  });
});

describe('táctil en modo mover', () => {
  it('un dedo desplaza el mapa y un toque es tap', () => {
    const g = new GestureRecognizer();
    g.down(touch(1, 10, 10, 0));
    expect(g.move(touch(1, 30, 15, 16))).toEqual([{ type: 'pan', dx: 20, dy: 5 }]);
    expect(g.up(touch(1, 30, 15, 50))).toEqual([]);
    g.down(touch(1, 10, 10, 1000));
    expect(types(g.up(touch(1, 11, 10, 1000 + TAP_MAX_MS - 1)))).toEqual(['tap']);
  });
});

describe('ratón', () => {
  it('clic izquierdo pinta al instante', () => {
    const g = painter();
    expect(types(g.down(mouse(1, 1, 0)))).toEqual(['stroke-start']);
    expect(types(g.move(mouse(5, 1, 10)))).toEqual(['stroke-move']);
    expect(types(g.up(mouse(5, 1, 20)))).toEqual(['stroke-end']);
  });

  it('clic derecho desplaza aunque haya herramienta', () => {
    const g = painter();
    g.down(mouse(0, 0, 0, 2));
    expect(types(g.move(mouse(10, 0, 10, 2)))).toEqual(['pan']);
  });

  it('con la barra espaciadora pulsada el clic izquierdo desplaza', () => {
    const g = painter();
    g.panModifier = true;
    expect(g.down(mouse(0, 0, 0))).toEqual([]);
    expect(types(g.move(mouse(10, 0, 10)))).toEqual(['pan']);
  });

  it('mover el ratón sin pulsar produce hover', () => {
    const g = painter();
    expect(g.move(mouse(3, 4, 0))).toEqual([{ type: 'hover', x: 3, y: 4 }]);
  });
});
