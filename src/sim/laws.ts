/** Leyes del mundo: interruptores globales que el jugador puede cambiar en cualquier momento. */
export interface WorldLaws {
  hunger: boolean;
  aging: boolean;
  wars: boolean;
  rebellions: boolean;
  vegetation: boolean;
  fireSpread: boolean;
  /** Primavera, verano, otoño e invierno (si no, verano eterno). */
  seasons: boolean;
  /** La arboleda mágica y el yermo maldito se extienden solos. */
  magicSpread: boolean;
  /** Los monstruos aparecen solos (yermo, pantanos, lava) y los muertos pueden levantarse. */
  monsters: boolean;
}

export type LawId = keyof WorldLaws;

export const LAW_LABELS: Readonly<Record<LawId, string>> = {
  hunger: 'Hambre',
  aging: 'Vejez',
  wars: 'Guerras espontáneas',
  rebellions: 'Rebeliones',
  vegetation: 'Crecimiento de plantas',
  fireSpread: 'El fuego se propaga',
  seasons: 'Estaciones',
  magicSpread: 'Los biomas mágicos se extienden',
  monsters: 'Aparecen monstruos',
};

export const LAW_IDS: readonly LawId[] = ['hunger', 'aging', 'wars', 'rebellions', 'vegetation', 'fireSpread', 'seasons', 'magicSpread', 'monsters'];

export function defaultLaws(): WorldLaws {
  return { hunger: true, aging: true, wars: true, rebellions: true, vegetation: true, fireSpread: true, seasons: true, magicSpread: true, monsters: true };
}

export function lawsHash(laws: WorldLaws): number {
  let h = 0;
  LAW_IDS.forEach((id, k) => {
    if (laws[id]) h |= 1 << k;
  });
  return h;
}
