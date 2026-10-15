import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, type AiContext } from '../src/ai/context';
import { canHunt } from '../src/ai/animal-ai';
import { stepMigrations } from '../src/ai/migration';
import { TICKS_PER_YEAR } from '../src/core/time';
import { habitatCap, habitatTiles, inHabitat } from '../src/ai/habitat';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { Rng } from '../src/core/rng';
import { ANIMAL_IDS, SPECIES, Species, type SpeciesId } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { Sex, UnitState, UnitStore } from '../src/entities/units';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { HazardSystem } from '../src/powers/hazards';
import { defaultLaws } from '../src/sim/laws';
import { Simulation } from '../src/sim/simulation';
import { neutralClimate } from '../src/world/climate';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 64;

function makeWorld(biome: number = Biome.GRASS, terrain: number = Terrain.SOIL_LOW): World {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[terrain].paintHeight);
    w.setBiome(i, biome as 0);
    w.setGrass(i, 200);
  }
  return w;
}

function makeCtx(world: World, capacity = 600): AiContext {
  world.computeRegions();
  const units = new UnitStore(capacity);
  return {
    world,
    units,
    pathfinder: new Pathfinder(world),
    civ: new CivSystem(world, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards: new HazardSystem(world),
    spatial: new SpatialHash(world.width, world.height, capacity),
    rng: new Rng(3),
    tick: 0,
    unitLimit: capacity,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
  };
}

function spawn(ctx: AiContext, species: SpeciesId, x: number, y: number, sex: number = Sex.FEMALE): number {
  const def = SPECIES[species];
  return ctx.units.spawn(species, x, y, { sex, ageTicks: def.adultTicks, generation: 0, thinkOffset: 0 });
}

function run(ctx: AiContext, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick = t;
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

describe('especies nuevas', () => {
  it('hay ocho animales salvajes, cada uno con su hábitat', () => {
    expect(ANIMAL_IDS).toEqual([Species.SHEEP, Species.RABBIT, Species.WOLF, Species.DEER, Species.GOAT, Species.CAMEL, Species.FOX, Species.BEAR]);
    for (const id of ANIMAL_IDS) {
      const a = SPECIES[id].animal;
      expect(a?.habitat.tilesPer).toBeGreaterThan(0);
      expect((a?.habitat.biomes.length ?? 0) + (a?.habitat.terrains?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('cada depredador caza según su tamaño: el zorro presas pequeñas, el oso cualquier herbívoro', () => {
    const s = (id: SpeciesId) => SPECIES[id];
    expect(canHunt(s(Species.FOX), s(Species.RABBIT))).toBe(true);
    expect(canHunt(s(Species.FOX), s(Species.SHEEP))).toBe(true);
    expect(canHunt(s(Species.FOX), s(Species.DEER))).toBe(false);
    expect(canHunt(s(Species.WOLF), s(Species.DEER))).toBe(true);
    expect(canHunt(s(Species.WOLF), s(Species.CAMEL))).toBe(false);
    expect(canHunt(s(Species.BEAR), s(Species.CAMEL))).toBe(true);
    // Ni entre depredadores ni a las personas.
    expect(canHunt(s(Species.BEAR), s(Species.WOLF))).toBe(false);
    expect(canHunt(s(Species.BEAR), s(Species.HUMAN))).toBe(false);
  });

  it('un ciervo no huye de un zorro (no puede cazarlo), pero sí de un lobo', () => {
    const fleesFrom = (hunter: SpeciesId): boolean => {
      const ctx = makeCtx(makeWorld(Biome.FOREST));
      const deer = spawn(ctx, Species.DEER, 20.5, 20.5);
      const h = spawn(ctx, hunter, 24.5, 20.5);
      ctx.units.hunger[deer] = SPECIES[Species.DEER].maxHunger;
      ctx.units.hunger[h] = SPECIES[hunter].maxHunger;
      for (let t = 0; t < 12; t++) {
        run(ctx, 1);
        if (ctx.units.state[deer] === UnitState.FLEE) return true;
      }
      return false;
    };
    expect(fleesFrom(Species.FOX)).toBe(false);
    expect(fleesFrom(Species.WOLF)).toBe(true);
  });
});

describe('hábitat', () => {
  it('cuenta las casillas de cada hábitat y se rehace al pintar', () => {
    const w = makeWorld(Biome.GRASS);
    expect(habitatTiles(w, Species.SHEEP)).toBe(SIZE * SIZE);
    expect(habitatTiles(w, Species.DEER)).toBe(0);
    for (let i = 0; i < 400; i++) w.setBiome(i, Biome.FOREST);
    expect(habitatTiles(w, Species.DEER)).toBe(400);
    expect(habitatTiles(w, Species.SHEEP)).toBe(SIZE * SIZE - 400);
    // Las cabras viven en las alturas, sea cual sea el bioma.
    w.setHeight(1000, TERRAIN_INFO[Terrain.MOUNTAIN].paintHeight);
    expect(inHabitat(SPECIES[Species.GOAT], w, 1000)).toBe(true);
    expect(inHabitat(SPECIES[Species.GOAT], w, 1001)).toBe(false);
  });

  it('el cupo sale del hábitat, con un mínimo para grupos puestos donde no les toca', () => {
    const w = makeWorld(Biome.GRASS);
    expect(habitatCap(w, SPECIES[Species.SHEEP])).toBe(Math.floor((SIZE * SIZE) / 380));
    expect(habitatCap(w, SPECIES[Species.CAMEL])).toBe(4);
    expect(habitatCap(w, SPECIES[Species.HUMAN])).toBe(0);
  });

  it('las ovejas crían hasta llenar su hábitat y no pasan de ahí', () => {
    const ctx = makeCtx(makeWorld(Biome.GRASS));
    const cap = habitatCap(ctx.world, SPECIES[Species.SHEEP]);
    for (let k = 0; k < 6; k++) spawn(ctx, Species.SHEEP, 10.5 + k * 8, 30.5, k % 2);
    run(ctx, 4000);
    const n = ctx.units.speciesCount[Species.SHEEP];
    expect(n).toBeGreaterThan(6);
    expect(n).toBeLessThanOrEqual(cap);
  });

  it('un grupo apiñado se dispersa', () => {
    const ctx = makeCtx(makeWorld(Biome.GRASS));
    const ids: number[] = [];
    for (let k = 0; k < 10; k++) ids.push(spawn(ctx, Species.SHEEP, 32.5 + (k % 3) * 0.3, 32.5 + Math.floor(k / 3) * 0.3, k % 2));
    const spread = (): number => {
      const u = ctx.units;
      let max = 0;
      for (const i of ids) for (const j of ids) if (u.isAlive(i) && u.isAlive(j)) max = Math.max(max, Math.hypot(u.x[i] - u.x[j], u.y[i] - u.y[j]));
      return max;
    };
    const before = spread();
    run(ctx, 300);
    expect(spread()).toBeGreaterThan(before + 10);
  });

  it('un grupo apiñado contra el agua se dispersa por tierra, sin quedarse atascado en la orilla', () => {
    const w = makeWorld(Biome.GRASS);
    // Mar a la izquierda (x < 20): el grupo está en la orilla y «lejos del grupo» apunta al agua.
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < 20; x++) w.setHeight(w.idx(x, y), TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    const ctx = makeCtx(w);
    const ids: number[] = [];
    for (let k = 0; k < 10; k++) ids.push(spawn(ctx, Species.SHEEP, 20.5 + (k % 2) * 0.4, 30.5 + Math.floor(k / 2) * 0.4, k % 2));
    run(ctx, 400);
    const u = ctx.units;
    let maxX = 0;
    for (const i of ids) {
      if (!u.isAlive(i)) continue;
      expect(w.isWaterIdx(w.idx(Math.floor(u.x[i]), Math.floor(u.y[i])))).toBe(false);
      maxX = Math.max(maxX, u.x[i]);
    }
    expect(maxX).toBeGreaterThan(28);
  });

  it('una partida cargada calcula el mismo hábitat que la original', () => {
    const sim = new Simulation({ seedText: 'habitat', size: 128, capacity: 600, populate: true });
    sim.apply({ type: 'brush', tool: 'forest', x: 60, y: 60, size: 15 });
    for (let t = 0; t < 200; t++) sim.step();
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Hábitat', 1)));
    for (const id of ANIMAL_IDS) expect(habitatCap(loaded.world, SPECIES[id])).toBe(habitatCap(sim.world, SPECIES[id]));
  });
});

describe('manadas', () => {
  it('cuando una oveja ve un lobo y huye, las de su lado huyen también aunque no lo vean', () => {
    const ctx = makeCtx(makeWorld(Biome.GRASS));
    // A ve al lobo (a 6 casillas, su vista es 7); B está a 5 de A y a 11 del lobo: no lo ve.
    const a = spawn(ctx, Species.SHEEP, 20.5, 30.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 15.5, 30.5, Sex.FEMALE);
    const wolf = spawn(ctx, Species.WOLF, 26.5, 30.5);
    for (const i of [a, b]) ctx.units.hunger[i] = SPECIES[Species.SHEEP].maxHunger;
    ctx.units.hunger[wolf] = SPECIES[Species.WOLF].maxHunger;
    let fled = false;
    for (let t = 0; t < 12 && !fled; t++) {
      run(ctx, 1);
      fled = ctx.units.state[b] === UnitState.FLEE;
    }
    expect(fled).toBe(true);
  });

  it('dos ovejas sueltas acaban juntándose en una manada', () => {
    const ctx = makeCtx(makeWorld(Biome.GRASS));
    const a = spawn(ctx, Species.SHEEP, 15.5, 30.5, Sex.FEMALE);
    const b = spawn(ctx, Species.SHEEP, 29.5, 30.5, Sex.FEMALE);
    for (const i of [a, b]) ctx.units.hunger[i] = SPECIES[Species.SHEEP].maxHunger;
    run(ctx, 600);
    const u = ctx.units;
    expect(Math.hypot(u.x[a] - u.x[b], u.y[a] - u.y[b])).toBeLessThan(9);
  });
});

describe('migración', () => {
  /** Mitad de bosque (ciervos) y mitad de pradera (ovejas). */
  function mixedCtx(): AiContext {
    const w = makeWorld(Biome.GRASS);
    for (let i = 0; i < w.size; i++) if (i % SIZE < SIZE / 2) w.setBiome(i, Biome.FOREST);
    return makeCtx(w);
  }

  it('si falta una especie y su hábitat sigue ahí, llega un grupito de machos y hembras', () => {
    const ctx = mixedCtx();
    for (let k = 0; k < 30; k++) spawn(ctx, Species.SHEEP, 40.5 + (k % 10), 10.5 + Math.floor(k / 10) * 4, k % 2);
    // Varios años: en cada uno hay un 50 % de que lleguen.
    for (let y = 1; y <= 6 && ctx.units.speciesCount[Species.DEER] === 0; y++) {
      ctx.tick = y * TICKS_PER_YEAR + TICKS_PER_YEAR / 2;
      stepMigrations(ctx, ctx.rng);
    }
    const u = ctx.units;
    expect(u.speciesCount[Species.DEER]).toBeGreaterThanOrEqual(2);
    const sexes = new Set<number>();
    for (let i = 0; i < u.highWater; i++) {
      if (!u.alive[i] || u.species[i] !== Species.DEER) continue;
      sexes.add(u.sex[i]);
      expect(inHabitat(SPECIES[Species.DEER], ctx.world, ctx.world.idx(Math.floor(u.x[i]), Math.floor(u.y[i])))).toBe(true);
    }
    expect(sexes.size).toBe(2);
    // No llegan especies sin hábitat en el mapa (aquí no hay desierto ni montaña).
    expect(u.speciesCount[Species.CAMEL]).toBe(0);
    expect(u.speciesCount[Species.GOAT]).toBe(0);
  });

  it('un mundo sin fauna sigue vacío', () => {
    const ctx = mixedCtx();
    for (let y = 1; y <= 6; y++) {
      ctx.tick = y * TICKS_PER_YEAR + TICKS_PER_YEAR / 2;
      stepMigrations(ctx, ctx.rng);
    }
    expect(ctx.units.count).toBe(0);
  });
});

describe('población inicial', () => {
  it('reparte grupos pequeños de cada especie por su hábitat, sin manadas enormes', () => {
    const sim = new Simulation({ seedText: 'fauna', size: 256, capacity: 2000, populate: true });
    const counts = sim.units.speciesCount;
    const present = ANIMAL_IDS.filter((id) => counts[id] > 0);
    expect(present.length).toBeGreaterThanOrEqual(6);
    let total = 0;
    let inside = 0;
    const u = sim.units;
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0) continue;
      total++;
      const def = SPECIES[u.species[i]];
      if (inHabitat(def, sim.world, sim.world.idx(Math.floor(u.x[i]), Math.floor(u.y[i])))) inside++;
    }
    expect(total).toBeLessThan(300);
    expect(inside / total).toBeGreaterThan(0.8);
  });

  it('a los diez años la fauna sigue con medida y la partida se guarda y carga igual', () => {
    const sim = new Simulation({ seedText: 'fauna', size: 192, capacity: 2000, populate: true });
    for (let t = 0; t < 6000; t++) sim.step();
    let animals = 0;
    for (const id of ANIMAL_IDS) {
      animals += sim.units.speciesCount[id];
      // Varias parejas pueden criar a la vez justo antes de llenar el cupo: se admite un pequeño exceso.
      expect(sim.units.speciesCount[id]).toBeLessThanOrEqual(Math.ceil(habitatCap(sim.world, SPECIES[id]) * 1.15) + 3);
    }
    expect(animals).toBeLessThan(600);
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Fauna', 1)));
    for (let t = 0; t < 300; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });
});
