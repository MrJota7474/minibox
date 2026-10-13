import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_MS, OFFSCREEN_GAIN, RateLimiter, masterGain, soundForCommand, soundForEvent, soundForFx } from '../src/audio/sound-map';
import { Species } from '../src/entities/species';
import { DEFAULT_SETTINGS } from '../src/ui/settings';

describe('mapa de sonidos', () => {
  it('cada aviso visual de un desastre o poder tiene su sonido', () => {
    expect(soundForFx('lightning')).toBe('lightning');
    expect(soundForFx('explosion')).toBe('explosion');
    expect(soundForFx('quake')).toBe('rumble');
    for (const kind of ['sparkle', 'curse', 'plague', 'heal', 'madness']) expect(soundForFx(kind)).toBe(kind);
    expect(soundForFx('smoke')).toBeNull();
  });

  it('el trabajo y el combate suenan según lo que se hace', () => {
    expect(soundForFx('chips')).toBe('chop');
    expect(soundForFx('sparks')).toBe('mine');
    expect(soundForFx('hit')).toBe('hit');
    expect(soundForFx('debris')).toBe('hit');
    expect(soundForFx('dirt')).toBeNull();
  });

  it('los acontecimientos del mundo suenan por familias', () => {
    expect(soundForEvent('founded')).toBe('founded');
    expect([soundForEvent('war'), soundForEvent('rebellion'), soundForEvent('conquest')]).toEqual(['war', 'war', 'war']);
    expect([soundForEvent('peace'), soundForEvent('alliance')]).toEqual(['peace', 'peace']);
    expect([soundForEvent('king'), soundForEvent('dynasty')]).toEqual(['crown', 'crown']);
    expect(soundForEvent('monster')).toBe('monster');
    expect(soundForEvent('faith')).toBe('faith');
    expect(soundForEvent('culture')).toBe('discovery');
    expect(soundForEvent('voyage')).toBeNull();
  });

  it('las acciones del jugador suenan, salvo los poderes que ya tienen aviso visual', () => {
    expect(soundForCommand({ type: 'brush', tool: 'soil', x: 1, y: 1, size: 3 })).toBe('brush');
    expect(soundForCommand({ type: 'spawn', species: Species.SHEEP, x: 1, y: 1, size: 3 })).toBe('spawn');
    expect(soundForCommand({ type: 'power', power: 'fire', x: 1, y: 1, size: 3 })).toBe('fire');
    expect(soundForCommand({ type: 'power', power: 'volcano', x: 1, y: 1, size: 3 })).toBe('rumble');
    expect(soundForCommand({ type: 'power', power: 'lightning', x: 1, y: 1, size: 3 })).toBeNull();
    expect(soundForCommand({ type: 'limit', value: 100 })).toBeNull();
    expect(soundForCommand({ type: 'law', law: 'hunger', value: false })).toBeNull();
  });
});

describe('límite de repetición', () => {
  it('un mismo sonido no se repite antes de su intervalo, pero otro sí puede sonar', () => {
    const limiter = new RateLimiter();
    expect(limiter.allow('hit', 1000)).toBe(true);
    expect(limiter.allow('hit', 1000 + MIN_INTERVAL_MS.hit - 1)).toBe(false);
    expect(limiter.allow('chop', 1001)).toBe(true);
    expect(limiter.allow('hit', 1000 + MIN_INTERVAL_MS.hit)).toBe(true);
  });

  it('un intento rechazado no retrasa el siguiente', () => {
    const limiter = new RateLimiter();
    limiter.allow('war', 0);
    for (let t = 100; t < MIN_INTERVAL_MS.war; t += 100) expect(limiter.allow('war', t)).toBe(false);
    expect(limiter.allow('war', MIN_INTERVAL_MS.war)).toBe(true);
  });
});

describe('volumen', () => {
  it('silenciado o a cero no suena; al máximo, ganancia 1, con curva suave', () => {
    expect(masterGain(false, 100)).toBe(0);
    expect(masterGain(true, 0)).toBe(0);
    expect(masterGain(true, 100)).toBe(1);
    expect(masterGain(true, 50)).toBeCloseTo(0.25, 5);
    expect(masterGain(true, 400)).toBe(1);
    expect(masterGain(true, -5)).toBe(0);
    expect(OFFSCREEN_GAIN).toBeGreaterThan(0);
    expect(OFFSCREEN_GAIN).toBeLessThan(1);
  });

  it('los ajustes por defecto traen el sonido activado a un volumen moderado', () => {
    expect(DEFAULT_SETTINGS.sound).toBe(true);
    expect(DEFAULT_SETTINGS.volume).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.volume).toBeLessThanOrEqual(100);
  });
});
