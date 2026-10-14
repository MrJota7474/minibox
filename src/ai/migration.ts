import { TICKS_PER_YEAR } from '../core/time';
import type { Rng } from '../core/rng';
import { ANIMAL_IDS, SPECIES } from '../entities/species';
import { spawnInBrush } from '../powers/brush';
import type { AiContext } from './context';
import { habitatTiles, inHabitat } from './habitat';

/**
 * Migración: si una especie salvaje casi desaparece del mapa (por los depredadores, las
 * aldeas o un desastre) y su hábitat sigue ahí, de vez en cuando llega un grupito de fuera.
 * Así ninguna se extingue para siempre. Sólo en mundos que ya tienen fauna: un mundo vacío
 * sigue vacío.
 */
const MIGRATION_INTERVAL = TICKS_PER_YEAR;
/** Se revisa a mitad de año para no coincidir con los demás pasos anuales. */
const MIGRATION_OFFSET = TICKS_PER_YEAR / 2;
/** Por debajo de esta población la especie puede recibir migrantes. */
const MIGRATION_MIN = 6;
const MIGRATION_CHANCE = 0.5;
/** Animales salvajes que debe tener el mundo para que lleguen más. */
const MIN_WILD = 20;
/** Pincel con el que llega el grupo (unos 4 animales, machos y hembras). */
const GROUP_BRUSH = 7;
/** Hábitat mínimo (en cupos de un animal) para que valga la pena llegar. */
const MIN_HABITAT_SHARES = 2;
const PLACE_TRIES = 40;

export function stepMigrations(ctx: AiContext, rng: Rng): void {
  if (ctx.tick === 0 || ctx.tick % MIGRATION_INTERVAL !== MIGRATION_OFFSET) return;
  const u = ctx.units;
  let wild = 0;
  for (const id of ANIMAL_IDS) wild += u.speciesCount[id];
  if (wild < MIN_WILD) return;
  const w = ctx.world;
  for (const id of ANIMAL_IDS) {
    const def = SPECIES[id];
    const habitat = def.animal?.habitat;
    if (!habitat || u.speciesCount[id] >= MIGRATION_MIN) continue;
    if (habitatTiles(w, id) < habitat.tilesPer * MIN_HABITAT_SHARES || !rng.chance(MIGRATION_CHANCE)) continue;
    for (let k = 0; k < PLACE_TRIES; k++) {
      const i = rng.int(w.size);
      if (!w.canWalk(i) || !inHabitat(def, w, i)) continue;
      spawnInBrush(w, u, rng, id, i % w.width, Math.floor(i / w.width), GROUP_BRUSH, ctx.unitLimit);
      break;
    }
  }
}
