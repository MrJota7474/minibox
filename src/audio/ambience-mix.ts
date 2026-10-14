import { Season } from '../world/climate';
import { Biome, Flora, Terrain } from '../world/terrain';
import type { World } from '../world/world';
import type { ViewRect } from './sound-map';

/**
 * Qué ambiente suena según lo que hay en pantalla: olas si se ve el mar, viento en montañas
 * y nieve, pájaros sobre los bosques. Es lógica pura (sin WebAudio) para poder probarla.
 */
export interface ViewSample {
  water: number;
  forest: number;
  cold: number;
  total: number;
}

/** Volumen de cada capa del ambiente (0-1). */
export interface AmbienceLevels {
  sea: number;
  wind: number;
  birds: number;
}

/** Casillas que se miran por eje (16 × 16 = 256 por muestra). */
const SAMPLES_PER_AXIS = 16;
/** Viento de fondo que sopla siempre, algo más fuerte en invierno. */
const BASE_WIND = 0.12;
const WINTER_WIND = 0.2;
/** Zoom a partir del cual los pájaros se oyen enteros; de lejos, una cuarta parte. */
const CLOSE_ZOOM = 12;
const FAR_ZOOM = 2;
const FAR_SHARE = 0.25;

/** Muestra una rejilla de casillas de la vista: cuántas son agua, bosque o frío. */
export function sampleView(world: World, view: ViewRect): ViewSample {
  const out: ViewSample = { water: 0, forest: 0, cold: 0, total: 0 };
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
      if (world.terrain[i] >= Terrain.MOUNTAIN || world.biome[i] === Biome.SNOW) out.cold++;
    }
  }
  return out;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Mezcla del ambiente para lo que se ve, la estación y lo cerca que está la cámara. */
export function ambienceMix(sample: ViewSample, season: number, zoom: number): AmbienceLevels {
  if (sample.total === 0) return { sea: 0, wind: BASE_WIND, birds: 0 };
  const water = sample.water / sample.total;
  const forest = sample.forest / sample.total;
  const cold = sample.cold / sample.total;
  const near = FAR_SHARE + (1 - FAR_SHARE) * clamp01((zoom - FAR_ZOOM) / (CLOSE_ZOOM - FAR_ZOOM));
  const winter = season === Season.WINTER;
  return {
    // El mar se oye también de lejos.
    sea: clamp01(Math.sqrt(water) * (0.5 + 0.5 * near)),
    wind: clamp01(BASE_WIND + cold * 0.8 + (winter ? WINTER_WIND : 0)),
    birds: clamp01(Math.sqrt(forest) * near * (winter ? 0.15 : 1)),
  };
}
