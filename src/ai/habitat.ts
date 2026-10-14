import { SPECIES, type SpeciesDef } from '../entities/species';
import { BIOME_INFO, TERRAIN_INFO } from '../world/terrain';
import type { World } from '../world/world';

/**
 * Hábitat de los animales: en qué casillas está a gusto cada especie y cuántas hay en el
 * mapa. El recuento se deriva sólo del terreno y los biomas, y se rehace cuando el mundo
 * cambia (`world.landVersion`), así que una partida cargada obtiene los mismos números.
 */
const TERRAIN_COUNT = TERRAIN_INFO.length;
const COMBOS = BIOME_INFO.length * TERRAIN_COUNT;

/** Para cada especie, qué combinaciones bioma × terreno son su hábitat (vacío si no es animal). */
const MATCHES: readonly Uint8Array[] = SPECIES.map((def) => {
  const table = new Uint8Array(COMBOS);
  const h = def.animal?.habitat;
  if (!h) return table;
  for (let b = 0; b < BIOME_INFO.length; b++) {
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      if (TERRAIN_INFO[t].water) continue;
      if (h.biomes.includes(b) || (h.terrains?.includes(t) ?? false)) table[b * TERRAIN_COUNT + t] = 1;
    }
  }
  return table;
});

/** Refugio: de una especie con menos de estos animales en el mundo nadie caza (así no se extingue). */
export const PREY_REFUGE = 10;

/** ¿Quedan tan pocos de esa especie que no se cazan? */
export function isScarce(speciesCount: Uint32Array, species: number): boolean {
  return speciesCount[species] < PREY_REFUGE;
}

/** Mínimo de animales que se permiten de una especie si tiene algo de hábitat. */
const MIN_CAP = 4;

interface Census {
  version: number;
  tiles: Int32Array;
}

const censuses = new WeakMap<World, Census>();

/** ¿Está la casilla dentro del hábitat de la especie? */
export function inHabitat(def: SpeciesDef, world: World, i: number): boolean {
  return MATCHES[def.id][world.biome[i] * TERRAIN_COUNT + world.terrain[i]] === 1;
}

/** Casillas de hábitat de la especie en el mapa (recalculado sólo si el terreno cambió). */
export function habitatTiles(world: World, species: number): number {
  let c = censuses.get(world);
  if (!c || c.version !== world.landVersion) {
    c = { version: world.landVersion, tiles: countHabitats(world) };
    censuses.set(world, c);
  }
  return c.tiles[species];
}

function countHabitats(world: World): Int32Array {
  // Primero cuántas casillas hay de cada combinación y luego se suman por especie.
  const combos = new Int32Array(COMBOS);
  for (let i = 0; i < world.size; i++) combos[world.biome[i] * TERRAIN_COUNT + world.terrain[i]]++;
  const tiles = new Int32Array(SPECIES.length);
  for (let s = 0; s < SPECIES.length; s++) {
    const m = MATCHES[s];
    let n = 0;
    for (let k = 0; k < COMBOS; k++) if (m[k] === 1) n += combos[k];
    tiles[s] = n;
  }
  return tiles;
}

/**
 * Cuántos animales de la especie caben en su hábitat. Aunque no tenga ninguno (el jugador
 * puso dromedarios donde no hay desierto), puede mantener un grupito.
 */
export function habitatCap(world: World, def: SpeciesDef): number {
  const h = def.animal?.habitat;
  if (!h) return 0;
  return Math.max(MIN_CAP, Math.floor(habitatTiles(world, def.id) / h.tilesPer));
}
