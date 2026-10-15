import { Season } from '../world/climate';
import { Biome, Flora, Terrain } from '../world/terrain';
import type { World } from '../world/world';
import type { ViewRect } from './sound-map';

/**
 * Qué ambiente suena según lo que hay en pantalla: olas si se ve el mar, viento en montañas
 * y nieve, pájaros sobre los bosques y, de noche, grillos, ranas y búhos. Es lógica pura
 * (sin WebAudio) para poder probarla.
 */
export interface ViewSample {
  water: number;
  forest: number;
  cold: number;
  /** Tierra abierta con hierba (pradera, sabana, selva, bosque y arboleda sin árbol encima). */
  meadow: number;
  swamp: number;
  total: number;
}

/** Volumen de cada capa del ambiente (0-1). */
export interface AmbienceLevels {
  sea: number;
  wind: number;
  birds: number;
  /** Balidos y voces de herbívoros a la vista (0-1). */
  bleats: number;
  /** Aullidos de lobo (0-1): sólo si hay lobos a la vista. */
  howls: number;
  /** De noche: grillos en la hierba, ranas en el pantano (los dos sólo de cerca) y algún búho en el bosque, que como el lobo se oye también de lejos (0-1). */
  crickets: number;
  frogs: number;
  owls: number;
}

/** Animales a la vista (los cuenta el juego cada vez que actualiza el ambiente). */
export interface VisibleAnimals {
  herbivores: number;
  wolves: number;
}

/** Herbívoros a la vista con los que los balidos suenan al máximo. */
const FULL_HERD = 12;

/** Casillas que se miran por eje (16 × 16 = 256 por muestra). */
const SAMPLES_PER_AXIS = 16;
/** Viento de fondo que sopla siempre, algo más fuerte en invierno. */
const BASE_WIND = 0.12;
const WINTER_WIND = 0.2;
/** Zoom a partir del cual los pájaros se oyen enteros; de lejos, una cuarta parte. */
const CLOSE_ZOOM = 12;
const FAR_ZOOM = 2;
const FAR_SHARE = 0.25;
/** Luz (1 = día, 0 = noche) por debajo de la cual empieza a sonar la noche, y su tramo de subida. */
const NIGHT_FROM = 0.85;
const NIGHT_RAMP = 0.6;
/** Bosque a la vista con el que el búho ya se oye entero. */
const OWL_FOREST = 0.25;
/** Biomas con hierba donde cantan los grillos. */
const MEADOW_BIOMES: ReadonlySet<number> = new Set([Biome.GRASS, Biome.FOREST, Biome.JUNGLE, Biome.SAVANNA, Biome.GROVE]);

/** Muestra una rejilla de casillas de la vista: cuántas son agua, bosque o frío. */
export function sampleView(world: World, view: ViewRect): ViewSample {
  const out: ViewSample = { water: 0, forest: 0, cold: 0, meadow: 0, swamp: 0, total: 0 };
  for (let sy = 0; sy < SAMPLES_PER_AXIS; sy++) {
    for (let sx = 0; sx < SAMPLES_PER_AXIS; sx++) {
      const x = Math.floor(view.left + ((sx + 0.5) / SAMPLES_PER_AXIS) * view.width);
      const y = Math.floor(view.top + ((sy + 0.5) / SAMPLES_PER_AXIS) * view.height);
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      out.total++;
      if (world.isWaterIdx(i)) {
        out.water++;
        continue;
      }
      if (world.flora[i] === Flora.TREE) out.forest++;
      else if (MEADOW_BIOMES.has(world.biome[i])) out.meadow++;
      if (world.biome[i] === Biome.SWAMP) out.swamp++;
      if (world.terrain[i] >= Terrain.MOUNTAIN || world.biome[i] === Biome.SNOW) out.cold++;
    }
  }
  return out;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Mezcla del ambiente para lo que se ve, la estación, lo cerca que está la cámara y la luz del
 * día (`light`: 1 de día, 0 en plena noche; ver world/daylight.ts).
 */
export function ambienceMix(sample: ViewSample, season: number, zoom: number, animals: VisibleAnimals = { herbivores: 0, wolves: 0 }, light = 1): AmbienceLevels {
  if (sample.total === 0) return { sea: 0, wind: BASE_WIND, birds: 0, bleats: 0, howls: 0, crickets: 0, frogs: 0, owls: 0 };
  const water = sample.water / sample.total;
  const forest = sample.forest / sample.total;
  const cold = sample.cold / sample.total;
  const meadow = sample.meadow / sample.total;
  const swamp = sample.swamp / sample.total;
  const near = FAR_SHARE + (1 - FAR_SHARE) * clamp01((zoom - FAR_ZOOM) / (CLOSE_ZOOM - FAR_ZOOM));
  const winter = season === Season.WINTER;
  // Los insectos y las ranas callan en invierno y cantan menos en otoño.
  const warm = winter ? 0 : season === Season.AUTUMN ? 0.6 : 1;
  const night = clamp01((NIGHT_FROM - light) / NIGHT_RAMP);
  return {
    // El mar se oye también de lejos.
    sea: clamp01(Math.sqrt(water) * (0.5 + 0.5 * near)),
    wind: clamp01(BASE_WIND + cold * 0.8 + (winter ? WINTER_WIND : 0)),
    // Los pájaros cantan de día (y aún algo al alba y al atardecer).
    birds: clamp01(Math.sqrt(forest) * near * (winter ? 0.15 : 1) * clamp01(light * 1.2)),
    // Los animales sólo se oyen de cerca; los lobos, también de algo más lejos.
    bleats: clamp01((animals.herbivores / FULL_HERD) * near),
    howls: animals.wolves > 0 ? clamp01(0.4 + 0.6 * near) : 0,
    crickets: clamp01(Math.sqrt(meadow + forest * 0.5) * night * near * warm),
    frogs: clamp01(Math.sqrt(swamp) * 1.4 * night * near * warm),
    owls: clamp01(night * (0.4 + 0.6 * near) * Math.min(1, forest / OWL_FOREST)),
  };
}
