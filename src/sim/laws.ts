/** Leyes del mundo: interruptores globales que el jugador puede cambiar en cualquier momento. */
export interface WorldLaws {
  hunger: boolean;
  aging: boolean;
  wars: boolean;
  rebellions: boolean;
  vegetation: boolean;
  fireSpread: boolean;
}

export type LawId = keyof WorldLaws;

export const LAW_LABELS: Readonly<Record<LawId, string>> = {
  hunger: 'Hambre',
  aging: 'Vejez',
  wars: 'Guerras espontáneas',
  rebellions: 'Rebeliones',
  vegetation: 'Crecimiento de plantas',
  fireSpread: 'El fuego se propaga',
};

export const LAW_IDS: readonly LawId[] = ['hunger', 'aging', 'wars', 'rebellions', 'vegetation', 'fireSpread'];

export function defaultLaws(): WorldLaws {
  return { hunger: true, aging: true, wars: true, rebellions: true, vegetation: true, fireSpread: true };
}

export function lawsHash(laws: WorldLaws): number {
  let h = 0;
  LAW_IDS.forEach((id, k) => {
    if (laws[id]) h |= 1 << k;
  });
  return h;
}
