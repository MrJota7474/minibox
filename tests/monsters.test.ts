import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, DeathCause, killUnit, type AiContext } from '../src/ai/context';
import { canSpawnMonster, monsterCount, stepMonsterSpawns } from '../src/ai/monster-spawn';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { BuildingType, Job, type Building, type Village } from '../src/civ/model';
import { Rng } from '../src/core/rng';
import { TICKS_PER_YEAR } from '../src/core/time';
import { MONSTER_IDS, SPECIES, Species, isMonster, type SpeciesId } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { NO_UNIT, UnitState, UnitStore } from '../src/entities/units';
import { spawnInBrush } from '../src/powers/brush';
import { PowerSystem } from '../src/powers/disasters';
import { HazardSystem } from '../src/powers/hazards';
import { Status, curse, infect } from '../src/powers/status';
import { TABS, TOOLS, commandFor, toolById } from '../src/powers/tools';
import { defaultLaws } from '../src/sim/laws';
import { Simulation } from '../src/sim/simulation';
import { neutralClimate } from '../src/world/climate';
import { Biome, Flora, TERRAIN_INFO, Terrain, type BiomeId } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 96;
const CAPACITY = 300;

interface Rig {
  ctx: AiContext;
  powers: PowerSystem;
  rng: Rng;
}

function rig(biome: BiomeId = Biome.GRASS): Rig {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, biome);
  }
  w.computeRegions();
  const units = new UnitStore(CAPACITY);
  const hazards = new HazardSystem(w);
  const ctx: AiContext = {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, CAPACITY),
    rng: new Rng(5),
    tick: 0,
    unitLimit: CAPACITY,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards,
  };
  // Sin hambre ni vejez: las pruebas miden sólo el comportamiento.
  ctx.laws.hunger = false;
  ctx.laws.aging = false;
  return { ctx, powers: new PowerSystem(w, units, hazards), rng: new Rng(9) };
}

function spawn(r: Rig, species: SpeciesId, x: number, y: number): number {
  return r.ctx.units.spawn(species, x, y, { sex: 0, ageTicks: SPECIES[species].adultTicks + 10, generation: 0, thinkOffset: 0, nameSeed: 7 });
}

/** Avanza la simulación; `withCiv = false` deja las aldeas tal cual (sin censo ni oficios). */
function run(r: Rig, ticks: number, withCiv = true): void {
  const { ctx } = r;
  for (let t = 0; t < ticks; t++) {
    ctx.tick++;
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.hazards.step(ctx, r.rng, ctx.laws.fireSpread, ctx.civ);
    if (withCiv) ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

function found(r: Rig, x: number, y: number, members: number): { v: Village; ids: number[] } {
  const ids = Array.from({ length: members }, (_, k) => spawn(r, Species.HUMAN, x + (k % 3), y + Math.floor(k / 3)));
  r.ctx.spatial.rebuild(r.ctx.units);
  const v = r.ctx.civ.foundVillage(Species.HUMAN, x, y, ids, r.ctx);
  if (!v) throw new Error('no se pudo fundar la aldea');
  return { v, ids };
}

function finishedHouse(r: Rig, v: Village, x: number, y: number): Building {
  const b = r.ctx.civ.placeBuilding(v, BuildingType.HOUSE, x, y);
  b.level = 1;
  b.underConstruction = false;
  return b;
}

describe('especies de monstruos', () => {
  it('los tres monstruos son una dieta aparte: ni comen ni crían ni llevan rasgos', () => {
    expect(MONSTER_IDS).toEqual([Species.PENANTE, Species.ESCORIO, Species.CENAGOSO]);
    for (const id of MONSTER_IDS) {
      const def = SPECIES[id];
      expect(isMonster(id)).toBe(true);
      expect(def.diet).toBe('monster');
      expect(def.hungerRate).toBe(0);
      expect(def.litterMax).toBe(0);
      expect(def.monster).toBeDefined();
    }
    expect(isMonster(Species.WOLF) || isMonster(Species.HUMAN)).toBe(false);
    const r = rig();
    const out = spawnInBrush(r.ctx.world, r.ctx.units, r.rng, Species.CENAGOSO, 40, 40, 9, CAPACITY);
    expect(out.spawned).toBeGreaterThan(0);
    for (let i = 0; i < r.ctx.units.highWater; i++) expect(r.ctx.units.traits[i]).toBe(0);
  });

  it('tienen su pestaña y sus herramientas de creación', () => {
    expect(TABS.some((t) => t.id === 'monstruos')).toBe(true);
    expect(TOOLS.filter((t) => t.tab === 'monstruos').map((t) => t.id)).toEqual(['penante', 'escorio', 'cenagoso']);
    const tool = toolById('escorio');
    expect(tool && commandFor(tool, 3, 4, 5)).toEqual({ type: 'spawn', species: Species.ESCORIO, x: 3, y: 4, size: 5 });
  });
});

describe('comportamiento', () => {
  it('un monstruo ataca al aldeano que tiene a la vista y lo mata', () => {
    const r = rig();
    const beast = spawn(r, Species.CENAGOSO, 40.5, 40.5);
    const human = spawn(r, Species.HUMAN, 41, 40.5);
    run(r, 20);
    expect(r.ctx.units.state[beast]).toBe(UnitState.FIGHT);
    expect(r.ctx.units.hp[human]).toBeLessThan(SPECIES[Species.HUMAN].maxHp);
    run(r, 400);
    expect(r.ctx.units.isAlive(human) && r.ctx.units.species[human] === Species.HUMAN).toBe(false);
    expect(r.ctx.stats.deaths[DeathCause.KILLED]).toBe(1);
    expect(r.ctx.units.kills[beast]).toBe(1);
  });

  it('tras matar, el cenagoso se calma un tiempo y deja de buscar presas lejanas', () => {
    const r = rig();
    const beast = spawn(r, Species.CENAGOSO, 40.5, 40.5);
    spawn(r, Species.HUMAN, 41, 40.5);
    run(r, 400);
    expect(r.ctx.units.cooldown[beast]).toBeGreaterThan(0);
    const far = spawn(r, Species.HUMAN, r.ctx.units.x[beast] + 8, r.ctx.units.y[beast]);
    run(r, 10);
    expect(r.ctx.units.state[beast]).not.toBe(UnitState.FIGHT);
    expect(r.ctx.units.hp[far]).toBe(SPECIES[Species.HUMAN].maxHp);
  });

  it('ignora a los herbívoros lejanos, a los depredadores y a los demás monstruos', () => {
    const r = rig();
    const beast = spawn(r, Species.CENAGOSO, 40.5, 40.5);
    spawn(r, Species.SHEEP, 47.5, 40.5);
    spawn(r, Species.PENANTE, 41.5, 40.5);
    const wolf = spawn(r, Species.WOLF, 40.5, 41.5);
    r.ctx.units.cooldown[wolf] = 1000;
    run(r, 30);
    expect(r.ctx.units.state[beast]).not.toBe(UnitState.FIGHT);
    expect(r.ctx.stats.deaths[DeathCause.KILLED]).toBe(0);
  });

  it('se lleva por delante al herbívoro que se le cruza', () => {
    const r = rig();
    const beast = spawn(r, Species.CENAGOSO, 40.5, 40.5);
    const rabbit = spawn(r, Species.RABBIT, 41.5, 40.5);
    r.ctx.units.cooldown[rabbit] = 1000;
    run(r, 6);
    expect(r.ctx.units.state[beast]).toBe(UnitState.FIGHT);
  });

  it('las ovejas huyen de los monstruos', () => {
    const r = rig();
    const sheep = spawn(r, Species.SHEEP, 44.5, 40.5);
    spawn(r, Species.ESCORIO, 40.5, 40.5);
    r.ctx.units.cooldown[1] = 1000;
    run(r, 6);
    expect(r.ctx.units.state[sheep]).toBe(UnitState.FLEE);
  });

  it('marcha hasta la aldea y arrasa sus edificios, el ayuntamiento el último', () => {
    const r = rig();
    const { v, ids } = found(r, 48, 48, 3);
    for (const i of ids) r.ctx.units.kill(i);
    const house = finishedHouse(r, v, 54, 48);
    const hall = r.ctx.civ.buildings[v.hallId];
    const penante = spawn(r, Species.PENANTE, 30.5, 48.5);
    run(r, 5, false);
    expect(r.ctx.units.state[penante]).toBe(UnitState.MARCH);
    let sawRaze = false;
    for (let k = 0; k < 400 && house.alive; k++) {
      run(r, 10, false);
      sawRaze ||= r.ctx.units.state[penante] === UnitState.RAZE;
    }
    expect(sawRaze).toBe(true);
    expect(house.alive).toBe(false);
    expect(hall.alive).toBe(true);
    for (let k = 0; k < 400 && v.alive; k++) run(r, 10, false);
    expect(v.alive).toBe(false);
    expect(r.ctx.civ.chronicle.some((e) => e.type === 'abandoned')).toBe(true);
  });

  it('los edificios dañados se reparan solos con el tiempo', () => {
    const r = rig();
    const { v } = found(r, 48, 48, 4);
    const hall = r.ctx.civ.buildings[v.hallId];
    r.ctx.civ.burnBuildingAt(r.ctx.world.idx(hall.x, hall.y), 10);
    expect(hall.burn).toBe(10);
    run(r, 95);
    expect(hall.burn).toBeLessThan(10);
    expect(hall.alive).toBe(true);
  });
});

describe('defensa de las aldeas', () => {
  it('con monstruos cerca la aldea recluta guerreros, que los combaten en tiempo de paz', () => {
    const r = rig();
    const { v } = found(r, 48, 48, 9);
    run(r, 31);
    const peaceWarriors = v.jobCounts[Job.WARRIOR];
    spawn(r, Species.PENANTE, 58.5, 48.5);
    const u = r.ctx.units;
    let fighting = false;
    let fleeing = false;
    for (let t = 0; t < 600 && !(fighting && fleeing); t++) {
      run(r, 1);
      for (let i = 0; i < u.highWater; i++) {
        if (u.alive[i] === 0 || u.species[i] !== Species.HUMAN) continue;
        const target = u.resolve(u.target[i]);
        if (u.job[i] === Job.WARRIOR && u.state[i] === UnitState.FIGHT && target !== NO_UNIT && isMonster(u.species[target])) fighting = true;
        if (u.job[i] !== Job.WARRIOR && u.state[i] === UnitState.FLEE) fleeing = true;
      }
    }
    expect(r.ctx.civ.kingdoms.isAtWar(v.kingdom)).toBe(false);
    expect(v.jobCounts[Job.WARRIOR]).toBeGreaterThan(peaceWarriors);
    expect(fighting).toBe(true);
    expect(fleeing).toBe(true);
  });

  it('una milicia acaba con un penante solitario', () => {
    const r = rig();
    found(r, 48, 48, 9);
    run(r, 31);
    spawn(r, Species.PENANTE, 56.5, 48.5);
    r.ctx.laws.monsters = false;
    for (let k = 0; k < 300 && monsterCount(r.ctx.units) > 0; k++) run(r, 10);
    expect(monsterCount(r.ctx.units)).toBe(0);
  });
});

describe('penantes', () => {
  it('un aldeano maldito se levanta como penante al morir; sin la ley, no', () => {
    const r = rig();
    const human = spawn(r, Species.HUMAN, 40.5, 40.5);
    curse(r.ctx.units, human);
    killUnit(r.ctx, human, DeathCause.AGE);
    expect(r.ctx.units.speciesCount[Species.PENANTE]).toBe(1);
    expect(r.ctx.units.speciesCount[Species.HUMAN]).toBe(0);
    expect(r.ctx.civ.chronicle.some((e) => e.type === 'monster')).toBe(true);

    const off = rig();
    off.ctx.laws.monsters = false;
    const other = spawn(off, Species.HUMAN, 40.5, 40.5);
    curse(off.ctx.units, other);
    killUnit(off.ctx, other, DeathCause.AGE);
    expect(monsterCount(off.ctx.units)).toBe(0);
  });

  it('ni los animales ni quien muere de viejo sin maldición se levantan', () => {
    const r = rig();
    const sheep = spawn(r, Species.SHEEP, 40.5, 40.5);
    curse(r.ctx.units, sheep);
    killUnit(r.ctx, sheep, DeathCause.KILLED);
    killUnit(r.ctx, spawn(r, Species.HUMAN, 42.5, 40.5), DeathCause.AGE);
    killUnit(r.ctx, spawn(r, Species.HUMAN, 44.5, 40.5), DeathCause.HUNGER);
    expect(monsterCount(r.ctx.units)).toBe(0);
  });

  it('parte de las víctimas de un penante y de la plaga se levantan', () => {
    const r = rig();
    const penante = spawn(r, Species.PENANTE, 10.5, 10.5);
    for (let k = 0; k < 60; k++) killUnit(r.ctx, spawn(r, Species.HUMAN, 40.5, 40.5), DeathCause.KILLED, penante);
    const bitten = r.ctx.units.speciesCount[Species.PENANTE] - 1;
    expect(bitten).toBeGreaterThan(10);
    expect(bitten).toBeLessThan(36);
    for (let k = 0; k < 60; k++) killUnit(r.ctx, spawn(r, Species.HUMAN, 60.5, 60.5), DeathCause.PLAGUE);
    const total = r.ctx.units.speciesCount[Species.PENANTE] - 1;
    // Nunca pasan del tope de monstruos que aparecen solos.
    expect(total).toBeGreaterThan(bitten);
    expect(monsterCount(r.ctx.units)).toBeLessThanOrEqual(Math.floor(CAPACITY * 0.12));
  });

  it('la luz divina los deshace y cura a los demás', () => {
    const r = rig();
    const penante = spawn(r, Species.PENANTE, 40.5, 40.5);
    const sheep = spawn(r, Species.SHEEP, 41.5, 40.5);
    r.ctx.units.hp[sheep] = 5;
    r.ctx.spatial.rebuild(r.ctx.units);
    r.powers.apply('heal', 40, 40, 5, r.ctx, r.rng, r.ctx.civ);
    expect(r.ctx.units.isAlive(penante)).toBe(true);
    expect(r.ctx.units.hp[penante]).toBeLessThan(SPECIES[Species.PENANTE].maxHp);
    expect(r.ctx.units.hp[sheep]).toBe(SPECIES[Species.SHEEP].maxHp);
    r.powers.apply('heal', 40, 40, 5, r.ctx, r.rng, r.ctx.civ);
    expect(r.ctx.units.isAlive(penante)).toBe(false);
    expect(r.ctx.stats.deaths[DeathCause.DIVINE]).toBe(1);
  });

  it('el yermo maldito los cura y la arboleda mágica los hiere', () => {
    const blight = rig(Biome.BLIGHT);
    const a = spawn(blight, Species.PENANTE, 40.5, 40.5);
    blight.ctx.units.hp[a] = 10;
    run(blight, 130);
    expect(blight.ctx.units.hp[a]).toBeGreaterThan(10);

    const grove = rig(Biome.GROVE);
    const b = spawn(grove, Species.PENANTE, 40.5, 40.5);
    run(grove, 130);
    expect(grove.ctx.units.hp[b]).toBeLessThan(SPECIES[Species.PENANTE].maxHp);
  });

  it('son inmunes a la plaga', () => {
    const r = rig();
    const penante = spawn(r, Species.PENANTE, 40.5, 40.5);
    expect(infect(r.ctx.units, penante)).toBe(false);
    expect(r.ctx.units.plague[penante]).toBe(0);
  });
});

describe('escorios', () => {
  it('ni el fuego ni la lava les hacen daño', () => {
    const r = rig();
    const escorio = spawn(r, Species.ESCORIO, 40.5, 40.5);
    const human = spawn(r, Species.HUMAN, 40.5, 40.5);
    r.ctx.units.cooldown[escorio] = 1000;
    r.ctx.hazards.ignite(r.ctx.world.idx(40, 40));
    r.ctx.laws.monsters = false;
    for (let t = 0; t < 40; t++) {
      r.ctx.tick++;
      r.ctx.spatial.rebuild(r.ctx.units);
      r.ctx.hazards.step(r.ctx, r.rng, false, r.ctx.civ);
    }
    expect(r.ctx.units.hp[escorio]).toBe(SPECIES[Species.ESCORIO].maxHp);
    expect(r.ctx.units.isAlive(human)).toBe(false);
  });

  it('la lava que los cubre no los atrapa ni los mata', () => {
    const r = rig();
    const escorio = spawn(r, Species.ESCORIO, 40.5, 40.5);
    for (let y = 30; y <= 50; y++) for (let x = 30; x <= 50; x++) r.ctx.hazards.pourLava(r.ctx.world.idx(x, y), 250);
    r.ctx.laws.monsters = false;
    run(r, 120, false);
    expect(r.ctx.units.isAlive(escorio)).toBe(true);
    expect(r.ctx.units.hp[escorio]).toBe(SPECIES[Species.ESCORIO].maxHp);
  });

  it('al morir se enfrían en una roca', () => {
    const r = rig();
    const escorio = spawn(r, Species.ESCORIO, 40.5, 40.5);
    killUnit(r.ctx, escorio, DeathCause.AGE);
    expect(r.ctx.world.flora[r.ctx.world.idx(40, 40)]).toBe(Flora.ROCK);
  });

  it('la lava, al enfriarse, despierta a alguno (y nunca más de su tope)', () => {
    const r = rig();
    for (let y = 30; y < 60; y++) for (let x = 30; x < 60; x++) r.ctx.hazards.pourLava(r.ctx.world.idx(x, y));
    for (let k = 0; k < 400 && r.ctx.hazards.lavaCount > 0; k++) run(r, 10, false);
    expect(r.ctx.hazards.lavaCount).toBe(0);
    const born = r.ctx.units.speciesCount[Species.ESCORIO];
    expect(born).toBeGreaterThan(0);
    expect(born).toBeLessThanOrEqual(Math.floor(CAPACITY * 0.01));
    expect(r.ctx.civ.chronicle.filter((e) => e.type === 'monster' && e.text.includes('escorio'))).toHaveLength(1);
  });
});

describe('apariciones espontáneas', () => {
  function months(r: Rig, n: number, from = 0): void {
    const rng = new Rng(21);
    for (let m = 1; m <= n; m++) {
      r.ctx.tick = from + m * 50;
      stepMonsterSpawns(r.ctx, rng);
    }
  }

  it('el yermo maldito engendra penantes hasta el tope de monstruos', () => {
    const r = rig(Biome.BLIGHT);
    months(r, 12);
    const first = r.ctx.units.speciesCount[Species.PENANTE];
    expect(first).toBeGreaterThan(0);
    months(r, 600, 600);
    expect(r.ctx.units.speciesCount[Species.PENANTE]).toBe(Math.floor(CAPACITY * 0.12));
    expect(canSpawnMonster(r.ctx, Species.PENANTE)).toBe(false);
    expect(r.ctx.civ.chronicle.some((e) => e.text.includes('yermo'))).toBe(true);
  });

  it('los pantanos sin dueño sueltan un cenagoso, pero no en los primeros años ni en territorio de una aldea', () => {
    const early = rig(Biome.SWAMP);
    months(early, 35);
    expect(monsterCount(early.ctx.units)).toBe(0);

    const r = rig(Biome.SWAMP);
    months(r, 2000, 8 * TICKS_PER_YEAR);
    // Un mapa de 96×96 sólo admite uno.
    expect(r.ctx.units.speciesCount[Species.CENAGOSO]).toBe(1);

    const owned = rig(Biome.SWAMP);
    owned.ctx.world.zoneOwner.fill(1);
    months(owned, 2000, 8 * TICKS_PER_YEAR);
    expect(monsterCount(owned.ctx.units)).toBe(0);
  });

  it('con la ley desactivada no aparece ninguno', () => {
    const r = rig(Biome.BLIGHT);
    r.ctx.laws.monsters = false;
    months(r, 200);
    expect(monsterCount(r.ctx.units)).toBe(0);
  });
});

describe('simulación con monstruos', () => {
  function world(): Simulation {
    const sim = new Simulation({ seedText: 'monstruos', size: 128, capacity: 400, populate: true });
    sim.apply({ type: 'spawn', species: Species.HUMAN, x: 60, y: 64, size: 9 });
    sim.apply({ type: 'brush', tool: 'blight', x: 80, y: 64, size: 15 });
    for (let t = 0; t < 300; t++) sim.step();
    sim.apply({ type: 'spawn', species: Species.PENANTE, x: 70, y: 64, size: 5 });
    sim.apply({ type: 'spawn', species: Species.ESCORIO, x: 50, y: 60, size: 1 });
    sim.apply({ type: 'spawn', species: Species.CENAGOSO, x: 64, y: 74, size: 1 });
    sim.apply({ type: 'power', power: 'curse', x: 60, y: 64, size: 9 });
    for (let t = 0; t < 900; t++) sim.step();
    return sim;
  }

  it('es determinista: mismos comandos, mismo estado', () => {
    const a = world();
    const b = world();
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.stats.deaths[DeathCause.KILLED]).toBeGreaterThan(0);
  });

  it('los monstruos no pertenecen a ninguna aldea ni reino', () => {
    const sim = world();
    const u = sim.units;
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || !isMonster(u.species[i])) continue;
      expect(u.village[i]).toBe(-1);
      expect(sim.civ.kingdoms.kingdomOfUnit(i)).toBe(-1);
      expect(u.status[i] & Status.IMMUNE).toBe(0);
    }
  });
});
