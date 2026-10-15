import { Species } from '../entities/species';
import { Pose } from './creature-art';

/** Cómo celebra cada raza sus fiestas: partículas sobre la hoguera y paso de baile. */
export interface FestiveLook {
  /** Estilo de partícula (ver fx.ts). */
  readonly particle: string;
  /** Partículas por salida y probabilidad de salida en cada fotograma. */
  readonly count: number;
  readonly chance: number;
  /** Altura (casillas) sobre la hoguera a la que salen y cuánto se reparten alrededor. */
  readonly height: number;
  readonly spread: number;
  /** Las dos posturas que alternan al bailar. */
  readonly dance: readonly [number, number];
}

const HUMAN_LOOK: FestiveLook = { particle: 'festive', count: 2, chance: 0.45, height: 0.6, spread: 0, dance: [Pose.RAISE, 1] };

const LOOKS: Readonly<Record<number, FestiveLook>> = {
  [Species.HUMAN]: HUMAN_LOOK,
  // Silvanos: farolillos que suben despacio.
  [Species.SILVAN]: { particle: 'lantern', count: 1, chance: 0.3, height: 0.8, spread: 1.5, dance: [Pose.RAISE, 1] },
  // Petrinos: de vez en cuando, un fuego artificial bien alto.
  [Species.PETRINO]: { particle: 'firework', count: 18, chance: 0.035, height: 4, spread: 2, dance: [Pose.RAISE, 2] },
  // Colmilludos: brasas de una hoguera enorme y pisotones.
  [Species.TUSKER]: { particle: 'feastEmber', count: 3, chance: 0.6, height: 0.4, spread: 0.5, dance: [Pose.STRIKE, 0] },
  // Escamados: luciérnagas por todo el corro.
  [Species.SCALEFOLK]: { particle: 'firefly', count: 2, chance: 0.35, height: 0.3, spread: 3, dance: [Pose.RAISE, 3] },
  // Dunarios: incienso y chispas doradas.
  [Species.DUNEFOLK]: { particle: 'incense', count: 2, chance: 0.4, height: 0.7, spread: 0.6, dance: [Pose.RAISE, 1] },
};

/** El festejo de una raza (las que no tienen el suyo, el humano). */
export function festiveLook(race: number): FestiveLook {
  return LOOKS[race] ?? HUMAN_LOOK;
}
