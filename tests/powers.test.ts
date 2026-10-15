import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, DeathCause, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { UnitStore } from '../src/entities/units';
import { PowerSystem, type PowerId } from '../src/powers/disasters';
import { HazardSystem } from '../src/powers/hazards';
import { PLAGUE_DURATION, Status, damageMultiplier, damageTakenMultiplier } from '../src/powers/status';
import { StrokeController } from '../src/powers/stroke';
import { toolById } from '../src/powers/tools';
import type { Command } from '../src/sim/commands';
import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { Simulation } from '../src/sim/simulation';
import { deserialize, describe as describeSave, serialize } from '../src/persistence/snapshot';
import { Biome, Flora, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 64;

interface Rig {
  ctx: AiContext;
  hazards: HazardSystem;
  powers: PowerSystem;
  rng: Rng;
}

function rig(forest = false): Rig {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
    w.setGrass(i, 150);
    if (forest) w.flora[i] = Flora.TREE;
  }
  w.computeRegions();
  const units = new UnitStore(200);
  const hazards = new HazardSystem(w);
  const ctx: AiContext = {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, 200),
    rng: new Rng(1),
    tick: 0,
    unitLimit: 200,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards,
  };
  return { ctx, hazards, powers: new PowerSystem(w, units, hazards), rng: new Rng(9) };
}

function sheep(r: Rig, x: number, y: number): number {
  const def = SPECIES[Species.SHEEP];
  return r.ctx.units.spawn(Species.SHEEP, x, y, { sex: 0, ageTicks: def.adultTicks, generation: 0, thinkOffset: 0 });
}

function apply(r: Rig, power: PowerId, x: number, y: number, size = 3): void {
  r.ctx.spatial.rebuild(r.ctx.units);
  r.powers.apply(power, x, y, size, r.ctx, r.rng, r.ctx.civ);
}

function run(r: Rig, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    r.ctx.tick++;
    r.ctx.spatial.rebuild(r.ctx.units);
    r.hazards.step(r.ctx, r.rng, r.ctx.laws.fireSpread, r.ctx.civ);
    r.powers.step(r.ctx, r.rng, r.ctx.civ);
    updateUnits(r.ctx);
  }
}

describe('desastres', () => {
  it('el rayo mata a las criaturas del punto y prende fuego', () => {
    const r = rig(true);
    const s = sheep(r, 20.5, 20.5);
    apply(r, 'lightning', 20, 20, 1);
    expect(r.ctx.units.isAlive(s)).toBe(false);
    expect(r.ctx.stats.deaths[DeathCause.DISASTER]).toBe(1);
    expect(r.hazards.burningCount).toBeGreaterThan(0);
    expect(r.powers.fx.some((f) => f.kind === 'lightning')).toBe(true);
  });

  it('el meteorito abre un cráter, mata y destruye edificios', () => {
    const r = rig();
    const before = r.ctx.world.heightMap[r.ctx.world.idx(32, 32)];
    const s = sheep(r, 32.5, 32.5);
    const members = [0, 1, 2].map((k) => sheep(r, 40 + k, 40));
    r.ctx.spatial.rebuild(r.ctx.units);
    const v = r.ctx.civ.foundVillage(Species.HUMAN, 32, 32, members, r.ctx);
    apply(r, 'meteor', 32, 32, 5);
    expect(r.ctx.world.heightMap[r.ctx.world.idx(32, 32)]).toBeLessThan(before);
    expect(r.ctx.units.isAlive(s)).toBe(false);
    expect(v?.alive).toBe(false);
  });

  it('el fuego se propaga por el bosque y se apaga dejando tierra quemada', () => {
    const r = rig(true);
    apply(r, 'fire', 32, 32, 1);
    run(r, 60);
    expect(r.hazards.burningCount).toBeGreaterThan(3);
    run(r, 4000);
    expect(r.hazards.burningCount).toBe(0);
    let burnt = 0;
    for (let i = 0; i < r.ctx.world.size; i++) if (r.ctx.world.flora[i] === Flora.NONE) burnt++;
    expect(burnt).toBeGreaterThan(10);
  });

  it('el meteorito deja una zona chamuscada redonda y el bosque de alrededor sobrevive', () => {
    const r = rig(true);
    const w = r.ctx.world;
    apply(r, 'meteor', 32, 32, 3);
    run(r, 3000);
    expect(r.hazards.burningCount).toBe(0);
    // Cráter de radio 4,5 y zona chamuscada hasta 9: dentro casi no quedan árboles.
    const treesWithin = (r0: number, r1: number): { trees: number; tiles: number } => {
      let trees = 0;
      let tiles = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const d = Math.hypot(x + 0.5 - 32.5, y + 0.5 - 32.5);
          if (d < r0 || d >= r1) continue;
          tiles++;
          if (w.flora[w.idx(x, y)] === Flora.TREE) trees++;
        }
      }
      return { trees, tiles };
    };
    expect(treesWithin(0, 4.5).trees).toBe(0);
    const scorched = treesWithin(4.5, 9);
    expect(scorched.trees / scorched.tiles).toBeLessThan(0.6);
    // Las llamas del borde se apagan a pocas casillas: lejos el bosque sigue intacto.
    const far = treesWithin(18, 99);
    expect(far.trees).toBe(far.tiles);
  });

  it('un incendio del pincel quema una mancha y se apaga sin arrasar el bosque', () => {
    const r = rig(true);
    apply(r, 'fire', 32, 32, 3);
    run(r, 3000);
    expect(r.hazards.burningCount).toBe(0);
    let burnt = 0;
    for (let i = 0; i < r.ctx.world.size; i++) if (r.ctx.world.flora[i] === Flora.NONE) burnt++;
    expect(burnt).toBeGreaterThan(20);
    expect(burnt).toBeLessThan(SIZE * SIZE * 0.15);
  });

  it('el fuego se contagia menos por la hierba que por el bosque', () => {
    const burntWith = (forest: boolean): number => {
      const r = rig(forest);
      apply(r, 'fire', 32, 32, 1);
      run(r, 3000);
      let n = 0;
      for (let i = 0; i < r.ctx.world.size; i++) if (r.ctx.world.grass[i] === 0) n++;
      return n;
    };
    expect(burntWith(false)).toBeLessThan(burntWith(true));
  });

  it('un fuego de una partida antigua (sin fuerza) se apaga sin contagiar', () => {
    const r = rig(true);
    const i = r.ctx.world.idx(32, 32);
    // Formato anterior: sólo el tiempo que le queda (≤ 12).
    r.ctx.world.fire[i] = 12;
    r.hazards.rebuildLists();
    run(r, 60);
    expect(r.hazards.burningCount).toBe(0);
    let burnt = 0;
    for (let k = 0; k < r.ctx.world.size; k++) if (r.ctx.world.flora[k] === Flora.NONE) burnt++;
    expect(burnt).toBe(1);
  });

  it('con la ley de propagación desactivada el fuego no se extiende', () => {
    const r = rig(true);
    r.ctx.laws.fireSpread = false;
    apply(r, 'fire', 32, 32, 1);
    run(r, 30);
    expect(r.hazards.burningCount).toBeLessThanOrEqual(1);
  });

  it('la lava fluye, impide el paso y se enfría en roca', () => {
    const r = rig();
    apply(r, 'lava', 32, 32, 3);
    const i = r.ctx.world.idx(32, 32);
    expect(r.ctx.world.lava[i]).toBeGreaterThan(0);
    expect(r.ctx.world.isWalkableAt(32.5, 32.5)).toBe(false);
    run(r, 3000);
    expect(r.hazards.lavaCount).toBe(0);
    expect(r.ctx.world.terrain[i]).toBe(Terrain.HILLS);
  });

  it('terremoto, tornado, lluvia ácida y volcán duran un tiempo y terminan', () => {
    const r = rig(true);
    for (const p of ['earthquake', 'tornado', 'acid-rain', 'volcano'] as PowerId[]) apply(r, p, 32, 32, 5);
    expect(r.powers.effects).toHaveLength(4);
    run(r, 600);
    expect(r.powers.effects).toHaveLength(0);
    expect(r.ctx.world.terrain[r.ctx.world.idx(32, 32)]).not.toBe(Terrain.SOIL_LOW);
  });
});

describe('poderes sobre criaturas', () => {
  it('la plaga contagia, mata o deja inmunes a los supervivientes', () => {
    const r = rig();
    const herd = [0, 1, 2, 3].map((k) => sheep(r, 30.5 + k * 0.5, 30.5));
    apply(r, 'plague', 30, 30, 1);
    expect(r.ctx.units.plague[herd[0]]).toBe(PLAGUE_DURATION);
    run(r, 200);
    expect(herd.filter((i) => r.ctx.units.plague[i] > 0 || !r.ctx.units.isAlive(i)).length).toBeGreaterThan(1);
    const infected = new Set<number>();
    for (let t = 0; t < PLAGUE_DURATION + 250; t++) {
      for (const i of herd) if (r.ctx.units.plague[i] > 0) infected.add(i);
      run(r, 1);
    }
    for (const i of infected) {
      if (r.ctx.units.isAlive(i)) expect(r.ctx.units.status[i] & Status.IMMUNE).toBeTruthy();
    }
  });

  it('bendición y maldición cambian el daño hecho y recibido; la luz divina cura', () => {
    const r = rig();
    const a = sheep(r, 10.5, 10.5);
    apply(r, 'bless', 10, 10, 1);
    expect(damageMultiplier(r.ctx.units, a)).toBeGreaterThan(1);
    expect(damageTakenMultiplier(r.ctx.units, a)).toBeLessThan(1);
    apply(r, 'curse', 10, 10, 1);
    expect(damageMultiplier(r.ctx.units, a)).toBeLessThan(1);
    r.ctx.units.hp[a] = 1;
    apply(r, 'heal', 10, 10, 1);
    expect(r.ctx.units.hp[a]).toBe(SPECIES[Species.SHEEP].maxHp);
    expect(r.ctx.units.status[a] & Status.CURSED).toBe(0);
  });

  it('una criatura enloquecida ataca a sus vecinas', () => {
    const r = rig();
    const mad = r.ctx.units.spawn(Species.WOLF, 20.5, 20.5, { sex: 0, ageTicks: 2000, generation: 0, thinkOffset: 0 });
    const victim = sheep(r, 22.5, 20.5);
    r.ctx.units.hunger[mad] = 1500;
    apply(r, 'madness', 20, 20, 1);
    run(r, 400);
    expect(r.ctx.units.isAlive(victim)).toBe(false);
  });

  it('el imán coge criaturas y las suelta en otro sitio', () => {
    const r = rig();
    const s = sheep(r, 10.5, 10.5);
    r.ctx.spatial.rebuild(r.ctx.units);
    expect(r.powers.grab(10, 10, 3, r.ctx)).toBe(1);
    expect(r.ctx.units.status[s] & Status.HELD).toBeTruthy();
    run(r, 10);
    r.powers.drop(40, 40);
    expect(Math.floor(r.ctx.units.x[s])).toBeGreaterThan(36);
    expect(r.ctx.units.status[s] & Status.HELD).toBe(0);
  });

  it('el trazo del imán emite coger al empezar y soltar al terminar', () => {
    const out: Command[] = [];
    const ctl = new StrokeController((c) => out.push(c));
    ctl.tool = toolById('magnet') ?? null;
    ctl.start(5, 5, 0);
    ctl.move(20, 9, 10);
    ctl.end();
    expect(out.map((c) => c.type)).toEqual(['grab', 'drop']);
    expect(out[1]).toMatchObject({ x: 20, y: 9 });
  });
});

describe('regresiones de la revisión', () => {
  it('pintar agua sobre lava la apaga y el lago no vuelve a ser roca', () => {
    const r = rig();
    apply(r, 'lava', 20, 20, 1);
    const i = r.ctx.world.idx(20, 20);
    r.ctx.world.setHeight(i, TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    expect(r.ctx.world.lava[i]).toBe(0);
    run(r, 400);
    expect(r.ctx.world.terrain[i]).toBe(Terrain.OCEAN);
  });

  it('una criatura sujeta por el imán no puede ser atacada ni encontrada', () => {
    const r = rig();
    const s = sheep(r, 10.5, 10.5);
    r.ctx.spatial.rebuild(r.ctx.units);
    r.powers.grab(10, 10, 1, r.ctx);
    r.ctx.spatial.rebuild(r.ctx.units);
    expect(r.ctx.spatial.nearest(r.ctx.units, 10.5, 10.5, 5, () => true)).toBe(-1);
    apply(r, 'lightning', 10, 10, 3);
    expect(r.ctx.units.isAlive(s)).toBe(true);
  });
});

describe('leyes y determinismo', () => {
  it('sin hambre ni vejez las criaturas no se debilitan', () => {
    const r = rig();
    r.ctx.laws.hunger = false;
    r.ctx.laws.aging = false;
    const s = sheep(r, 30.5, 30.5);
    r.ctx.units.age[s] = SPECIES[Species.SHEEP].lifespanTicks + 10;
    const hunger = r.ctx.units.hunger[s];
    run(r, 3000);
    expect(r.ctx.units.isAlive(s)).toBe(true);
    expect(r.ctx.units.hunger[s]).toBeGreaterThanOrEqual(hunger - 5);
  });

  it('la simulación con desastres es determinista', () => {
    const make = (): Simulation => {
      const sim = new Simulation({ seedText: 'desastres', size: 96, capacity: 300, populate: true });
      sim.apply({ type: 'power', power: 'meteor', x: 48, y: 48, size: 5 });
      sim.apply({ type: 'power', power: 'tornado', x: 30, y: 30, size: 5 });
      sim.apply({ type: 'law', law: 'fireSpread', value: true });
      for (let t = 0; t < 400; t++) sim.step();
      sim.apply({ type: 'power', power: 'fire', x: 40, y: 60, size: 9 });
      for (let t = 0; t < 400; t++) sim.step();
      return sim;
    };
    expect(make().stateHash()).toBe(make().stateHash());
  });
});

describe('desastres y poderes de la naturaleza', () => {
  /** Mitad izquierda mar (x < 30), mitad derecha tierra llana. */
  function coast(): Rig {
    const r = rig();
    const w = r.ctx.world;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < 30; x++) w.setHeight(w.idx(x, y), TERRAIN_INFO[Terrain.OCEAN].paintHeight);
    w.computeRegions();
    return r;
  }

  it('el maremoto barre la costa: hiere y empuja tierra adentro; tierra adentro no pasa nada', () => {
    const r = coast();
    // Un dromedario (50 de vida) aguanta el golpe de la ola (45) y se ve arrastrado.
    const camel = SPECIES[Species.CAMEL];
    const s = r.ctx.units.spawn(Species.CAMEL, 31.5, 32.5, { sex: 0, ageTicks: camel.adultTicks, generation: 0, thinkOffset: 0 });
    apply(r, 'tsunami', 30, 32, 3);
    const u = r.ctx.units;
    expect(u.isAlive(s)).toBe(true);
    expect(u.hp[s]).toBeLessThan(camel.maxHp);
    expect(u.x[s]).toBeGreaterThan(31.5);
    expect(r.powers.fx.some((f) => f.kind === 'wave')).toBe(true);
    // Lejos del mar: ni daño ni ola.
    const inland = rig();
    const t = sheep(inland, 32.5, 32.5);
    apply(inland, 'tsunami', 32, 32, 3);
    expect(inland.ctx.units.hp[t]).toBe(SPECIES[Species.SHEEP].maxHp);
    expect(inland.powers.fx.some((f) => f.kind === 'wave')).toBe(false);
  });

  it('la ventisca dura un tiempo, hiere poco a poco y deja tierra nevada', () => {
    const r = rig();
    const s = sheep(r, 32.5, 32.5);
    apply(r, 'blizzard', 32, 32, 5);
    expect(r.powers.effects.some((e) => e.kind === 'blizzard')).toBe(true);
    run(r, 300);
    expect(r.powers.effects.some((e) => e.kind === 'blizzard')).toBe(false);
    let snow = 0;
    for (let i = 0; i < r.ctx.world.size; i++) if (r.ctx.world.biome[i] === Biome.SNOW) snow++;
    expect(snow).toBeGreaterThan(5);
    const u = r.ctx.units;
    expect(!u.isAlive(s) || u.hp[s] < SPECIES[Species.SHEEP].maxHp).toBe(true);
  });

  it('las langostas devoran la hierba sin herir a nadie', () => {
    const r = rig();
    const s = sheep(r, 32.5, 32.5);
    r.ctx.units.hunger[s] = SPECIES[Species.SHEEP].maxHunger;
    const grassAround = (): number => {
      let g = 0;
      for (let y = 26; y < 38; y++) for (let x = 26; x < 38; x++) g += r.ctx.world.grass[r.ctx.world.idx(x, y)];
      return g;
    };
    const before = grassAround();
    apply(r, 'locusts', 32, 32, 3);
    run(r, 100);
    expect(grassAround()).toBeLessThan(before * 0.9);
    expect(r.ctx.stats.deaths[DeathCause.DISASTER]).toBe(0);
  });

  it('la lluvia fértil reverdece, vuelve a dar bayas y apaga el fuego', () => {
    const r = rig();
    const w = r.ctx.world;
    const i = w.idx(32, 32);
    w.setGrass(i, 0);
    w.setFlora(w.idx(33, 32), Flora.BUSH);
    r.hazards.ignite(w.idx(31, 32));
    apply(r, 'rain', 32, 32, 5);
    expect(w.grass[i]).toBeGreaterThan(100);
    expect(w.flora[w.idx(33, 32)]).toBe(Flora.BERRY_BUSH);
    expect(w.fire[w.idx(31, 32)]).toBe(0);
    expect(r.powers.fx.some((f) => f.kind === 'rain')).toBe(true);
  });

  it('la ofrenda llena el almacén de la aldea tocada, sin pasar de su capacidad', () => {
    const r = rig();
    const members = [0, 1, 2].map((k) => sheep(r, 40 + k, 40));
    r.ctx.spatial.rebuild(r.ctx.units);
    const v = r.ctx.civ.foundVillage(Species.HUMAN, 32, 32, members, r.ctx);
    expect(v).not.toBeNull();
    if (!v) return;
    const food = v.resources[0];
    apply(r, 'offering', 32, 32, 3);
    expect(v.resources[0]).toBeGreaterThan(food);
    for (let k = 0; k < 20; k++) apply(r, 'offering', 32, 32, 3);
    for (const amount of v.resources) expect(amount).toBeLessThanOrEqual(v.storageCap);
  });

  it('apagar con la lluvia un fuego que vuelve a prender no lo duplica en la lista de fuegos', () => {
    const r = rig(true);
    const i = r.ctx.world.idx(32, 32);
    r.hazards.ignite(i);
    apply(r, 'rain', 32, 32, 1);
    expect(r.ctx.world.fire[i]).toBe(0);
    r.hazards.ignite(i);
    expect(r.hazards.burningTiles().filter((t) => t === i)).toHaveLength(1);
  });

  it('la fertilidad sacia a las criaturas y las deja listas para criar (a los monstruos no)', () => {
    const r = rig();
    const s = sheep(r, 32.5, 32.5);
    const u = r.ctx.units;
    u.cooldown[s] = 500;
    u.hunger[s] = 10;
    const ghost = u.spawn(Species.PENANTE, 33.5, 32.5, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 });
    u.cooldown[ghost] = 50;
    apply(r, 'fertility', 32, 32, 3);
    expect(u.cooldown[s]).toBe(0);
    expect(u.hunger[s]).toBe(SPECIES[Species.SHEEP].maxHunger);
    expect(u.cooldown[ghost]).toBe(50);
    expect(r.powers.fx.some((f) => f.kind === 'fertility')).toBe(true);
  });

  it('la paz divina termina las guerras de los reinos con aldeas en el círculo', () => {
    const sim = new Simulation({ seedText: 'paz', size: 128, capacity: 400, populate: false });
    for (let y = 30; y < 100; y++) for (let x = 20; x < 110; x++) sim.world.setHeight(sim.world.idx(x, y), TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    sim.apply({ type: 'spawn', species: Species.HUMAN, x: 40, y: 64, size: 9 });
    sim.apply({ type: 'spawn', species: Species.TUSKER, x: 90, y: 64, size: 9 });
    for (let t = 0; t < 150; t++) sim.step();
    expect(sim.civ.kingdoms.kingdoms.length).toBeGreaterThanOrEqual(2);
    sim.apply({ type: 'diplomacy', action: 'war', a: 0, b: 1 });
    expect(sim.civ.kingdoms.wars.some((w) => w.active)).toBe(true);
    const hall = sim.civ.building(sim.civ.villages[0].hallId);
    expect(hall).not.toBeNull();
    if (!hall) return;
    sim.apply({ type: 'power', power: 'peace', x: hall.x, y: hall.y, size: 3 });
    expect(sim.civ.kingdoms.wars.some((w) => w.active)).toBe(false);
  });

  it('una partida con ventisca y langostas en marcha se guarda y continúa igual', () => {
    const sim = new Simulation({ seedText: 'naturaleza', size: 96, capacity: 300, populate: true });
    sim.apply({ type: 'power', power: 'blizzard', x: 40, y: 40, size: 5 });
    sim.apply({ type: 'power', power: 'locusts', x: 60, y: 50, size: 3 });
    for (let t = 0; t < 30; t++) sim.step();
    const loaded = deserialize(serialize(sim, describeSave(sim, 'Naturaleza', 1)));
    for (let t = 0; t < 200; t++) {
      sim.step();
      loaded.step();
    }
    expect(loaded.stateHash()).toBe(sim.stateHash());
  });
});
