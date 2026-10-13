import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE_COUNT, DeathCause, killUnit, type AiContext } from '../src/ai/context';
import { Pathfinder } from '../src/ai/pathfinder';
import { updateUnits } from '../src/ai/update';
import { CivSystem } from '../src/civ/civ-system';
import { loyaltyOf, opinion, runKingdomAi } from '../src/civ/diplomacy';
import { BuildingType, type Village } from '../src/civ/model';
import { clanName, cultureName, religionName } from '../src/civ/names';
import { CULTURE_TRAITS, CultureTrait, TECHS, TENETS, Tech, Tenet, buildBonus, cultureOf, faithOf, farmBonus, gearBonus, healBonus, stepSociety, warriorBonus, workBonus } from '../src/civ/society';
import { Rng } from '../src/core/rng';
import { TICKS_PER_YEAR } from '../src/core/time';
import { SPECIES, Species } from '../src/entities/species';
import { SpatialHash } from '../src/entities/spatial';
import { Sex, UnitStore } from '../src/entities/units';
import { HazardSystem } from '../src/powers/hazards';
import { defaultLaws } from '../src/sim/laws';
import { neutralClimate } from '../src/world/climate';
import { Biome, TERRAIN_INFO, Terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

const SIZE = 128;
const NO_TOUCH = new Set<number>();

function makeCtx(): AiContext {
  const w = new World(SIZE, SIZE);
  for (let i = 0; i < w.size; i++) {
    w.setHeight(i, TERRAIN_INFO[Terrain.SOIL_LOW].paintHeight);
    w.setBiome(i, Biome.GRASS);
  }
  w.computeRegions();
  const units = new UnitStore(400);
  const ctx: AiContext = {
    world: w,
    units,
    spatial: new SpatialHash(SIZE, SIZE, 400),
    rng: new Rng(3),
    tick: 0,
    unitLimit: 400,
    stats: { births: 0, deaths: new Uint32Array(DEATH_CAUSE_COUNT) },
    pathfinder: new Pathfinder(w),
    civ: new CivSystem(w, units),
    laws: defaultLaws(),
    climate: neutralClimate(),
    hazards: new HazardSystem(w),
  };
  ctx.laws.hunger = false;
  ctx.laws.aging = false;
  ctx.laws.monsters = false;
  return ctx;
}

function adults(ctx: AiContext, n: number, x: number, y: number, species: number = Species.HUMAN): number[] {
  const def = SPECIES[species];
  return Array.from({ length: n }, (_, k) =>
    ctx.units.spawn(species as 3, x + (k % 3), y + Math.floor(k / 3), { sex: k % 2, ageTicks: def.adultTicks + 100 + k, generation: 0, thinkOffset: k, nameSeed: k * 31 + x }),
  );
}

function found(ctx: AiContext, x: number, y: number, species: number = Species.HUMAN, kingdom = -1, members = 4): { v: Village; ids: number[] } {
  const ids = adults(ctx, members, x, y, species);
  ctx.spatial.rebuild(ctx.units);
  const v = ctx.civ.foundVillage(species as 3, x, y, ids, ctx, kingdom);
  if (!v) throw new Error('no se pudo fundar');
  return { v, ids };
}

function run(ctx: AiContext, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    ctx.tick++;
    ctx.pathfinder.resetBudget();
    ctx.spatial.rebuild(ctx.units);
    ctx.civ.update(ctx);
    updateUnits(ctx);
  }
}

/** Levanta de golpe el santuario de una aldea (como si lo acabaran los constructores). */
function buildShrine(ctx: AiContext, v: Village, dx = 5): void {
  const b = ctx.civ.placeBuilding(v, BuildingType.SHRINE, v.cx + dx, v.cy);
  ctx.civ.addWork(b, 1000);
}

describe('cultura', () => {
  it('cada aldea que se funda sola crea su cultura; las colonias heredan la de su reino', () => {
    const ctx = makeCtx();
    const { v: a } = found(ctx, 20, 20);
    const { v: b } = found(ctx, 90, 20, Species.TUSKER);
    const { v: colony } = found(ctx, 20, 90, Species.HUMAN, a.kingdom);
    expect(ctx.civ.cultures).toHaveLength(2);
    expect(a.culture).not.toBe(b.culture);
    expect(colony.culture).toBe(a.culture);
    const culture = cultureOf(ctx.civ, a);
    expect(culture?.name.length).toBeGreaterThan(4);
    expect(culture?.trait).toBeLessThan(CULTURE_TRAITS.length);
    expect(culture?.level).toBe(0);
  });

  it('acumula saber con sus adultos y descubre las tecnologías en orden', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20, Species.HUMAN, -1, 9);
    run(ctx, 31);
    const culture = ctx.civ.cultures[v.culture];
    expect(farmBonus(ctx.civ, v)).toBe(1);
    const perPass = (v.adults / 10) * (culture.trait === CultureTrait.SCHOLARLY ? 1.5 : 1);
    const before = culture.knowledge;
    stepSociety(ctx.civ, ctx);
    expect(culture.knowledge - before).toBeCloseTo(perPass, 5);
    for (let k = 0; k < 60; k++) stepSociety(ctx.civ, ctx);
    expect(culture.level).toBe(Tech.FARMING);
    expect(farmBonus(ctx.civ, v)).toBe(1.25);
    expect(buildBonus(ctx.civ, v)).toBe(1);
    culture.knowledge = 10000;
    stepSociety(ctx.civ, ctx);
    expect(culture.level).toBe(TECHS.length);
    expect([buildBonus(ctx.civ, v), gearBonus(ctx.civ, v), healBonus(ctx.civ, v)]).toEqual([1.3, 1.25, 2]);
    const discoveries = ctx.civ.chronicle.filter((e) => e.type === 'culture');
    expect(discoveries.map((e) => e.text.split(': ')[1])).toEqual(TECHS.map((t) => t.name));
  });

  it('el rasgo de la cultura da su ventaja y sólo esa', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20);
    const trait = ctx.civ.cultures[v.culture].trait;
    expect(workBonus(ctx.civ, v)).toBe(trait === CultureTrait.INDUSTRIOUS ? 1.1 : 1);
    expect(warriorBonus(ctx.civ, v)).toBe(trait === CultureTrait.WARLIKE ? 1.1 : 1);
    expect(workBonus(ctx.civ, null)).toBe(1);
  });

  it('la albañilería acelera las obras', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20);
    const plain = ctx.civ.placeBuilding(v, BuildingType.HOUSE, v.cx + 4, v.cy);
    ctx.civ.addWork(plain, 10);
    expect(plain.progress).toBe(10);
    ctx.civ.cultures[v.culture].level = Tech.MASONRY;
    const fast = ctx.civ.placeBuilding(v, BuildingType.HOUSE, v.cx + 8, v.cy);
    ctx.civ.addWork(fast, 10);
    expect(fast.progress).toBe(13);
  });

  it('una aldea de otra cultura es menos leal y, tras años en el reino, se asimila', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 20, 20);
    const { v: other } = found(ctx, 50, 20);
    const same = found(ctx, 20, 50, Species.HUMAN, capital.kingdom).v;
    const ks = ctx.civ.kingdoms;
    ks.conquer(other, capital.kingdom);
    other.capturedTick = -1;
    // Aparte de la cultura ajena (−15), una cultura hospitalaria da +10 a sus aldeas.
    const welcoming = (v: Village): number => (cultureOf(ctx.civ, v)?.trait === CultureTrait.WELCOMING ? 10 : 0);
    expect(loyaltyOf(ks, same) - loyaltyOf(ks, other)).toBe(15 + welcoming(same) - welcoming(other));
    // Recién llegada no se asimila; pasados los años, sí.
    for (let k = 0; k < 50; k++) stepSociety(ctx.civ, ctx);
    expect(other.culture).not.toBe(capital.culture);
    ctx.civ.tick = 16 * TICKS_PER_YEAR;
    for (let k = 0; k < 200 && other.culture !== capital.culture; k++) stepSociety(ctx.civ, ctx);
    expect(other.culture).toBe(capital.culture);
    expect(ctx.civ.chronicle.some((e) => e.type === 'culture' && e.text.includes(other.name))).toBe(true);
  });
});

describe('religión', () => {
  it('al terminar el santuario una aldea sin fe funda una religión', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20);
    expect(v.religion).toBe(-1);
    expect(faithOf(ctx.civ, v)).toBeNull();
    buildShrine(ctx, v);
    expect(ctx.civ.religions).toHaveLength(1);
    const faith = faithOf(ctx.civ, v);
    expect(faith?.origin).toBe(v.id);
    expect(faith?.tenet).toBeLessThan(TENETS.length);
    expect(ctx.civ.chronicle.some((e) => e.type === 'faith')).toBe(true);
  });

  it('una colonia adopta la fe de su capital en vez de fundar otra', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 20, 20);
    const { v: colony } = found(ctx, 20, 90, Species.HUMAN, capital.kingdom);
    buildShrine(ctx, capital);
    buildShrine(ctx, colony);
    expect(ctx.civ.religions).toHaveLength(1);
    expect(colony.religion).toBe(capital.religion);
  });

  it('una aldea con el santuario lejos de toda fe funda la suya', () => {
    const ctx = makeCtx();
    const { v: a } = found(ctx, 15, 15);
    const { v: b } = found(ctx, 110, 110, Species.PETRINO);
    buildShrine(ctx, a);
    buildShrine(ctx, b);
    expect(ctx.civ.religions).toHaveLength(2);
    expect(a.religion).not.toBe(b.religion);
  });

  it('compartir la fe de la capital da lealtad; otra fe la quita y acaba en conversión', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 20, 20);
    const { v: colony } = found(ctx, 60, 20, Species.HUMAN, capital.kingdom);
    const ks = ctx.civ.kingdoms;
    const base = loyaltyOf(ks, colony);
    buildShrine(ctx, capital);
    buildShrine(ctx, colony);
    const devout = ctx.civ.religions[capital.religion].tenet === Tenet.DEVOUT;
    expect(loyaltyOf(ks, colony) - base).toBe(devout ? 20 : 10);
    // Otra fe: se crea a mano una segunda religión.
    ctx.civ.religions.push({ ...ctx.civ.religions[0], id: 1, name: 'Fe de prueba' });
    colony.religion = 1;
    expect(loyaltyOf(ks, colony) - base).toBe(-15);
    for (let k = 0; k < 200 && colony.religion !== capital.religion; k++) stepSociety(ctx.civ, ctx);
    expect(colony.religion).toBe(capital.religion);
  });

  it('los reinos de la misma fe se miran mejor que los de fes distintas', () => {
    const ctx = makeCtx();
    const { v: a } = found(ctx, 20, 20);
    const { v: b } = found(ctx, 60, 20);
    const ks = ctx.civ.kingdoms;
    const before = opinion(ks, a.kingdom, b.kingdom, NO_TOUCH);
    ctx.civ.religions.push({ id: 0, name: 'Fe A', race: Species.HUMAN, founded: 0, origin: a.id, tenet: Tenet.DEVOUT }, { id: 1, name: 'Fe B', race: Species.HUMAN, founded: 0, origin: b.id, tenet: Tenet.ZEALOUS });
    a.religion = 0;
    b.religion = 0;
    expect(opinion(ks, a.kingdom, b.kingdom, NO_TOUCH) - before).toBe(20);
    b.religion = 1;
    expect(opinion(ks, a.kingdom, b.kingdom, NO_TOUCH) - before).toBe(-15);
    // El celoso odia más al infiel.
    expect(opinion(ks, b.kingdom, a.kingdom, NO_TOUCH)).toBeLessThan(opinion(ks, a.kingdom, b.kingdom, NO_TOUCH));
  });

  it('la aldea levanta sola su santuario cuando tiene ayuntamiento, gente y materiales', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 60, 60, Species.HUMAN, -1, 14);
    const hall = ctx.civ.buildings[v.hallId];
    hall.level = 2;
    v.resources = [200, 200, 200, 0, 0];
    for (let k = 0; k < 400 && v.religion < 0; k++) {
      v.resources[0] = 200;
      run(ctx, 30);
    }
    expect(v.buildingIds.some((id) => ctx.civ.buildings[id].type === BuildingType.SHRINE && ctx.civ.buildings[id].level === 1)).toBe(true);
    expect(v.religion).toBe(0);
  });
});

describe('clanes', () => {
  it('el censo reparte a los fundadores en dos clanes y los recién llegados entran en el menor', () => {
    const ctx = makeCtx();
    const { v, ids } = found(ctx, 20, 20, Species.HUMAN, -1, 6);
    expect(ctx.units.clan[ids[0]]).toBe(0);
    run(ctx, 31);
    const u = ctx.units;
    expect(ctx.civ.clans).toHaveLength(2);
    expect(new Set(ids.map((i) => u.clan[i])).size).toBe(2);
    expect(ctx.civ.clans.map((c) => c.members)).toEqual([3, 3]);
    expect(ctx.civ.clans[0].name).toMatch(/^Clan /);
    const newcomer = adults(ctx, 1, v.cx + 2, v.cy + 3)[0];
    ctx.civ.joinVillage(newcomer, v);
    run(ctx, 30);
    expect(u.clan[newcomer]).toBeGreaterThan(0);
    expect(ctx.civ.clans).toHaveLength(2);
    expect(ctx.civ.clans.reduce((n, c) => n + c.members, 0)).toBe(7);
  });

  it('los hijos heredan el clan del padre', () => {
    const ctx = makeCtx();
    ctx.laws.hunger = true;
    const { v, ids } = found(ctx, 60, 60, Species.HUMAN, -1, 8);
    v.resources = [500, 100, 100, 0, 0];
    const u = ctx.units;
    const before = u.count;
    for (let k = 0; k < 200 && u.count === before; k++) run(ctx, 30);
    expect(u.count).toBeGreaterThan(before);
    const founders = new Set(ids);
    const fatherClans = new Set(ids.filter((i) => u.sex[i] === Sex.MALE).map((i) => u.clan[i]));
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0 || founders.has(i)) continue;
      expect(fatherClans.has(u.clan[i])).toBe(true);
    }
  });

  it('el trono pasa dentro del clan reinante mientras quede alguien del linaje', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20, Species.HUMAN, -1, 8);
    run(ctx, 31);
    const ks = ctx.civ.kingdoms;
    const K = ks.kingdoms[v.kingdom];
    runKingdomAi(ks, ctx);
    const u = ctx.units;
    const first = u.resolve(K.king);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(K.clan).toBe(u.clan[first] - 1);
    const house = K.clan;
    killUnit(ctx, first, DeathCause.AGE);
    runKingdomAi(ks, ctx);
    const second = u.resolve(K.king);
    expect(second).not.toBe(first);
    expect(u.clan[second] - 1).toBe(house);
    expect(K.clan).toBe(house);
    expect(ctx.civ.clans[house].crowns).toBe(2);
    expect(ctx.civ.chronicle.some((e) => e.type === 'dynasty')).toBe(false);
    expect(ctx.civ.chronicle.some((e) => e.type === 'king' && e.text.includes(ctx.civ.clans[house].name))).toBe(true);
  });

  it('si del linaje sólo quedan menores, reina un niño antes que otra casa', () => {
    const ctx = makeCtx();
    const { v } = found(ctx, 20, 20, Species.HUMAN, -1, 8);
    run(ctx, 31);
    const ks = ctx.civ.kingdoms;
    const K = ks.kingdoms[v.kingdom];
    runKingdomAi(ks, ctx);
    const u = ctx.units;
    const house = K.clan;
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] === 1 && u.clan[i] - 1 === house) killUnit(ctx, i, DeathCause.AGE);
    const child = u.spawn(Species.HUMAN, v.cx + 1, v.cy + 3, { sex: 0, ageTicks: TICKS_PER_YEAR, generation: 1, thinkOffset: 0, nameSeed: 77, village: v.id, clan: house + 1 });
    runKingdomAi(ks, ctx);
    expect(u.resolve(K.king)).toBe(child);
    expect(K.clan).toBe(house);
    expect(ctx.civ.chronicle.some((e) => e.type === 'dynasty')).toBe(false);
  });

  it('si el linaje se extingue sube otro clan: cambio de dinastía y lealtad resentida', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 20, 20, Species.HUMAN, -1, 8);
    const { v: colony } = found(ctx, 60, 20, Species.HUMAN, capital.kingdom);
    run(ctx, 31);
    const ks = ctx.civ.kingdoms;
    const K = ks.kingdoms[capital.kingdom];
    runKingdomAi(ks, ctx);
    const u = ctx.units;
    const house = K.clan;
    const calm = loyaltyOf(ks, colony);
    for (let i = 0; i < u.highWater; i++) if (u.alive[i] === 1 && u.clan[i] - 1 === house) killUnit(ctx, i, DeathCause.AGE);
    runKingdomAi(ks, ctx);
    expect(u.resolve(K.king)).toBeGreaterThanOrEqual(0);
    expect(K.clan).not.toBe(house);
    expect(K.dynastyTick).toBe(ctx.civ.tick);
    expect(ctx.civ.chronicle.some((e) => e.type === 'dynasty' && e.text.includes(ctx.civ.clans[K.clan].name))).toBe(true);
    expect(loyaltyOf(ks, colony)).toBeLessThan(calm);
    // Pasados diez años, el descontento se olvida.
    const unrest = loyaltyOf(ks, colony);
    ctx.civ.tick += 11 * TICKS_PER_YEAR;
    expect(loyaltyOf(ks, colony)).toBe(unrest + 15);
  });

  it('una aldea cuyo líder es del clan reinante es más leal', () => {
    const ctx = makeCtx();
    const { v: capital } = found(ctx, 20, 20, Species.HUMAN, -1, 6);
    const { v: colony, ids } = found(ctx, 60, 20, Species.HUMAN, capital.kingdom);
    run(ctx, 31);
    const ks = ctx.civ.kingdoms;
    const K = ks.kingdoms[capital.kingdom];
    runKingdomAi(ks, ctx);
    const base = loyaltyOf(ks, colony);
    expect(ks.leaderClan(colony)).not.toBe(K.clan);
    ctx.units.clan[ctx.units.resolve(colony.leader)] = K.clan + 1;
    expect(ids.length).toBe(4);
    expect(loyaltyOf(ks, colony)).toBe(base + 10);
  });
});

describe('nombres', () => {
  it('son deterministas y propios de cada raza', () => {
    expect(cultureName(Species.HUMAN, 5)).toBe(cultureName(Species.HUMAN, 5));
    expect(cultureName(Species.HUMAN, 5)).not.toBe(cultureName(Species.TUSKER, 5));
    expect(religionName(Species.SILVAN, 9)).toMatch(/^(Culto|Fe|Senda|Orden) de [A-Z]/);
    expect(clanName(Species.PETRINO, 3)).toMatch(/^Clan [A-Z][a-z]+$/);
  });
});
