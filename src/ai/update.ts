import { updateVillager } from '../civ/villager';
import { SPECIES } from '../entities/species';
import { updateAnimal } from './animal-ai';
import type { AiContext } from './context';
import { updateLife } from './life';
import { OFFMAP_FLAGS } from '../entities/units';
import { updateMadness, updatePlague } from '../powers/status';

/** Actualiza todas las criaturas un tick, en orden de índice (determinista). */
export function updateUnits(ctx: AiContext): void {
  const u = ctx.units;
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0) continue;
    u.px[i] = u.x[i];
    u.py[i] = u.y[i];
  }
  for (let i = 0; i < u.highWater; i++) {
    if (u.alive[i] === 0) continue;
    // Las criaturas sujetas por el imán divino o a bordo de un barco quedan en suspenso.
    if ((u.status[i] & OFFMAP_FLAGS) !== 0) continue;
    const def = SPECIES[u.species[i]];
    if (!updateLife(ctx, i, def)) continue;
    if (!updatePlague(ctx, i)) continue;
    const before = u.state[i];
    if (updateMadness(ctx, i, def)) {
      if (u.isAlive(i)) u.stateTicks[i] = 0;
      continue;
    }
    if (def.diet === 'civilized') updateVillager(ctx, i, def);
    else updateAnimal(ctx, i, def);
    if (!u.isAlive(i)) continue;
    u.stateTicks[i] = u.state[i] === before ? Math.min(0xffff, u.stateTicks[i] + 1) : 0;
  }
}
