import { describe, expect, it } from 'vitest';
import { ambienceMix, sampleView } from '../src/audio/ambience-mix';
import { MIN_INTERVAL_MS, OFFSCREEN_GAIN, REVERB_SEND, RateLimiter, masterGain, soundForCommand, soundForEvent, soundForFx, spatialMix } from '../src/audio/sound-map';
import { Species } from '../src/entities/species';
import { DEFAULT_SETTINGS } from '../src/ui/settings';
import { Season } from '../src/world/climate';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

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
    expect(DEFAULT_SETTINGS.ambience).toBe(true);
  });
});

describe('posición del sonido', () => {
  const view = { left: 100, top: 50, width: 40, height: 20 };

  it('en el centro suena entero y sin panorámica', () => {
    expect(spatialMix(120, 60, view)).toEqual({ pan: 0, gain: 1 });
  });

  it('a la izquierda suena por la izquierda y algo más bajo', () => {
    const left = spatialMix(101, 60, view);
    const right = spatialMix(139, 60, view);
    expect(left.pan).toBeLessThan(0);
    expect(right.pan).toBeGreaterThan(0);
    expect(left.gain).toBeLessThan(1);
    expect(left.gain).toBeGreaterThan(OFFSCREEN_GAIN);
  });

  it('fuera de la pantalla suena bajo y por su lado, con la panorámica limitada', () => {
    const far = spatialMix(400, 60, view);
    expect(far.gain).toBe(OFFSCREEN_GAIN);
    expect(far.pan).toBeGreaterThan(0);
    expect(far.pan).toBeLessThanOrEqual(1);
    expect(spatialMix(120, -500, view).gain).toBe(OFFSCREEN_GAIN);
  });

  it('el meteorito tiene su silbido y los sonidos grandes llevan más eco que los de la interfaz', () => {
    expect(soundForFx('meteor')).toBe('meteor');
    expect(REVERB_SEND.explosion).toBeGreaterThan(REVERB_SEND.click);
    expect(REVERB_SEND.tab).toBe(0);
    for (const id of Object.keys(MIN_INTERVAL_MS) as (keyof typeof REVERB_SEND)[]) {
      expect(REVERB_SEND[id]).toBeGreaterThanOrEqual(0);
      expect(REVERB_SEND[id]).toBeLessThanOrEqual(1);
    }
  });
});

describe('ambiente', () => {
  it('el mar suena si se ve agua, los pájaros sobre el bosque y el viento en la montaña', () => {
    const sea = ambienceMix({ water: 200, forest: 0, cold: 0, meadow: 0, swamp: 0, total: 256 }, Season.SUMMER, 10);
    const forest = ambienceMix({ water: 0, forest: 180, cold: 0, meadow: 0, swamp: 0, total: 256 }, Season.SUMMER, 10);
    const peaks = ambienceMix({ water: 0, forest: 0, cold: 200, meadow: 0, swamp: 0, total: 256 }, Season.SUMMER, 10);
    expect(sea.sea).toBeGreaterThan(0.5);
    expect(sea.birds).toBe(0);
    expect(forest.birds).toBeGreaterThan(0.5);
    expect(forest.sea).toBe(0);
    expect(peaks.wind).toBeGreaterThan(forest.wind);
  });

  it('en invierno apenas cantan los pájaros y sopla más viento; de lejos se oyen menos', () => {
    const sample = { water: 0, forest: 180, cold: 0, meadow: 0, swamp: 0, total: 256 };
    const summer = ambienceMix(sample, Season.SUMMER, 10);
    const winter = ambienceMix(sample, Season.WINTER, 10);
    expect(winter.birds).toBeLessThan(summer.birds * 0.3);
    expect(winter.wind).toBeGreaterThan(summer.wind);
    expect(ambienceMix(sample, Season.SUMMER, 2).birds).toBeLessThan(summer.birds);
  });

  it('sin casillas a la vista sólo queda el viento de fondo y todo está entre 0 y 1', () => {
    const empty = ambienceMix({ water: 0, forest: 0, cold: 0, meadow: 0, swamp: 0, total: 0 }, Season.SUMMER, 10);
    expect(empty.sea).toBe(0);
    expect(empty.birds).toBe(0);
    const full = ambienceMix({ water: 0, forest: 256, cold: 256, meadow: 0, swamp: 0, total: 256 }, Season.WINTER, 40);
    for (const v of Object.values(full)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('se oyen balidos si hay herbívoros a la vista y aullidos sólo si hay lobos', () => {
    const sample = { water: 0, forest: 0, cold: 0, meadow: 0, swamp: 0, total: 256 };
    const quiet = ambienceMix(sample, Season.SUMMER, 10);
    expect(quiet.bleats).toBe(0);
    expect(quiet.howls).toBe(0);
    const herd = ambienceMix(sample, Season.SUMMER, 12, { herbivores: 12, wolves: 0 });
    expect(herd.bleats).toBeCloseTo(1, 5);
    expect(herd.howls).toBe(0);
    const wolves = ambienceMix(sample, Season.SUMMER, 12, { herbivores: 0, wolves: 2 });
    expect(wolves.howls).toBeGreaterThan(0.5);
    // De lejos, los balidos apenas se oyen.
    expect(ambienceMix(sample, Season.SUMMER, 2, { herbivores: 12, wolves: 0 }).bleats).toBeLessThan(0.3);
  });

  it('de noche callan los pájaros y cantan grillos en la hierba, ranas en el pantano y búhos en el bosque', () => {
    const sample = { water: 0, forest: 80, cold: 0, meadow: 120, swamp: 50, total: 256 };
    const day = ambienceMix(sample, Season.SUMMER, 12, undefined, 1);
    const night = ambienceMix(sample, Season.SUMMER, 12, undefined, 0);
    expect(day.crickets).toBe(0);
    expect(day.frogs).toBe(0);
    expect(day.owls).toBe(0);
    expect(day.birds).toBeGreaterThan(0.4);
    expect(night.birds).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.5);
    expect(night.frogs).toBeGreaterThan(0.5);
    expect(night.owls).toBeGreaterThan(0.5);
    // En invierno no hay grillos ni ranas, pero el búho sigue ahí.
    const cold = ambienceMix(sample, Season.WINTER, 12, undefined, 0);
    expect(cold.crickets).toBe(0);
    expect(cold.frogs).toBe(0);
    expect(cold.owls).toBeGreaterThan(0.5);
    // Sin bosque no hay búhos; en el desierto, sin hierba, tampoco grillos.
    const sand = ambienceMix({ water: 0, forest: 0, cold: 0, meadow: 0, swamp: 0, total: 256 }, Season.SUMMER, 12, undefined, 0);
    expect(sand.owls).toBe(0);
    expect(sand.crickets).toBe(0);
  });

  it('la muestra de la vista cuenta agua, bosque y frío', () => {
    const w = new World(32, 32);
    for (let i = 0; i < w.size; i++) {
      w.setHeight(i, TERRAIN_INFO[(i % 32) < 16 ? Terrain.OCEAN : Terrain.SOIL_LOW].paintHeight);
      if (i % 32 >= 16) w.flora[i] = Flora.TREE;
    }
    const s = sampleView(w, { left: 0, top: 0, width: 32, height: 32 });
    expect(s.total).toBe(256);
    expect(s.water).toBe(128);
    expect(s.forest).toBe(128);
    // Fuera del mapa no cuenta.
    expect(sampleView(w, { left: -100, top: -100, width: 10, height: 10 }).total).toBe(0);
  });

  it('la muestra cuenta la hierba sin árbol y el pantano (el agua no es pantano)', () => {
    const w = new World(32, 32);
    for (let i = 0; i < w.size; i++) {
      const x = i % 32;
      w.setHeight(i, TERRAIN_INFO[x < 8 ? Terrain.SHALLOW : Terrain.SOIL_LOW].paintHeight);
      w.setBiome(i, x < 16 ? Biome.SWAMP : x < 24 ? Biome.GRASS : Biome.DESERT);
    }
    const s = sampleView(w, { left: 0, top: 0, width: 32, height: 32 });
    expect(s.water).toBe(64);
    expect(s.swamp).toBe(64);
    expect(s.meadow).toBe(64);
  });

  it('la noche llega poco a poco al anochecer, el otoño apaga a medias los grillos y todo queda entre 0 y 1', () => {
    const sample = { water: 0, forest: 0, cold: 0, meadow: 256, swamp: 0, total: 256 };
    expect(ambienceMix(sample, Season.SUMMER, 12, undefined, 0.85).crickets).toBe(0);
    expect(ambienceMix(sample, Season.SUMMER, 12, undefined, 0.55).crickets).toBeCloseTo(0.5, 5);
    expect(ambienceMix(sample, Season.AUTUMN, 12, undefined, 0).crickets).toBeCloseTo(0.6, 5);
    const full = ambienceMix({ water: 256, forest: 256, cold: 256, meadow: 256, swamp: 256, total: 256 }, Season.SUMMER, 40, { herbivores: 99, wolves: 9 }, 0);
    for (const v of Object.values(full)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
