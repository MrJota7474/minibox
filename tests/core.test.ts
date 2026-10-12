import { describe, expect, it } from 'vitest';
import { FixedClock } from '../src/core/clock';
import { TIER_SETTINGS, classifyDevice, profileForTier } from '../src/core/device';
import { TICKS_PER_YEAR, TICK_MS, tickToDate, ticksToYears } from '../src/core/time';
import { Camera } from '../src/render/camera';

describe('FixedClock', () => {
  it('no avanza en pausa', () => {
    const c = new FixedClock();
    c.speed = 0;
    expect(c.advance(1000)).toBe(0);
    expect(c.alpha()).toBe(1);
  });

  it('a x1 produce un tick cada TICK_MS', () => {
    const c = new FixedClock();
    expect(c.advance(TICK_MS * 2)).toBe(2);
  });

  it('a x5 produce cinco veces más ticks', () => {
    const c = new FixedClock();
    c.speed = 5;
    expect(c.advance(TICK_MS)).toBe(5);
  });

  it('acumula fracciones entre frames', () => {
    const c = new FixedClock();
    expect(c.advance(TICK_MS / 2)).toBe(0);
    expect(c.alpha()).toBeCloseTo(0.5);
    expect(c.advance(TICK_MS / 2)).toBe(1);
  });

  it('limita los ticks por frame para ralentizar en vez de saltar', () => {
    const c = new FixedClock();
    c.speed = 5;
    c.maxTicksPerFrame = 4;
    expect(c.advance(250)).toBe(4);
    expect(c.advance(0)).toBe(0);
  });
});

describe('time', () => {
  it('convierte ticks a fecha', () => {
    expect(tickToDate(0)).toEqual({ year: 1, month: 1 });
    expect(tickToDate(TICKS_PER_YEAR)).toEqual({ year: 2, month: 1 });
    expect(tickToDate(TICKS_PER_YEAR + 60)).toEqual({ year: 2, month: 2 });
    expect(ticksToYears(TICKS_PER_YEAR * 3 + 5)).toBe(3);
  });
});

describe('device', () => {
  it('clasifica móviles modestos como bajo', () => {
    expect(classifyDevice({ cores: 4, memoryGb: 2, isTouch: true, benchMs: 30 })).toBe('bajo');
  });
  it('clasifica móviles de gama media como medio', () => {
    expect(classifyDevice({ cores: 8, memoryGb: 4, isTouch: true, benchMs: 20 })).toBe('medio');
  });
  it('clasifica un portátil Ryzen 7 como alto', () => {
    expect(classifyDevice({ cores: 16, memoryGb: 8, isTouch: false, benchMs: 15 })).toBe('alto');
  });
  it('clasifica escritorios potentes como ultra', () => {
    expect(classifyDevice({ cores: 16, memoryGb: 8, isTouch: false, benchMs: 5 })).toBe('ultra');
  });
  it('baja de nivel si la prueba es lenta', () => {
    expect(classifyDevice({ cores: 8, memoryGb: undefined, isTouch: false, benchMs: 80 })).toBe('medio');
  });
  it('profileForTier copia los ajustes del nivel', () => {
    expect(profileForTier('medio', true)).toEqual({ tier: 'medio', isTouch: true, ...TIER_SETTINGS.medio });
  });
});

describe('Camera', () => {
  it('screenToWorld y worldToScreen son inversas', () => {
    const cam = new Camera(256, 256);
    cam.setViewport(800, 600);
    cam.zoom = 8;
    cam.centerOn(100, 120);
    const w = cam.screenToWorld(300, 200);
    const s = cam.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
  });

  it('zoomAt mantiene fijo el punto bajo el cursor', () => {
    const cam = new Camera(256, 256);
    cam.setViewport(800, 600);
    cam.zoom = 4;
    const before = cam.screenToWorld(500, 300);
    cam.zoomAt(2, 500, 300);
    const after = cam.screenToWorld(500, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limita el zoom y mantiene el centro dentro del mundo', () => {
    const cam = new Camera(100, 100);
    cam.setViewport(400, 400);
    cam.zoomAt(1000, 0, 0);
    expect(cam.zoom).toBe(cam.maxZoom);
    cam.pan(100000, 100000);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    cam.fitWorld();
    expect(cam.x).toBe(50);
  });
});
