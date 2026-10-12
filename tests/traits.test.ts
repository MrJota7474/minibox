import { describe, expect, it } from 'vitest';
import { scaledStep, setBreedCooldown } from '../src/ai/life';
import { Rng } from '../src/core/rng';
import { SPECIES, Species } from '../src/entities/species';
import { TRAITS, Trait, addTrait, hasTrait, inheritTraits, randomTraits, traitMods, traitNames } from '../src/entities/traits';
import { UnitStore, VETERAN_KILLS } from '../src/entities/units';
import { damageMultiplier, damageTakenMultiplier, infect } from '../src/powers/status';
import { Simulation } from '../src/sim/simulation';

const bit = (id: number): number => 1 << id;

describe('rasgos', () => {
  it('hay al menos 20 rasgos con nombre, descripción e id coherente', () => {
    expect(TRAITS.length).toBeGreaterThanOrEqual(20);
    TRAITS.forEach((t, k) => {
      expect(t.id).toBe(k);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      if (t.opposite !== undefined) expect(TRAITS[t.opposite].opposite).toBe(t.id);
    });
    expect(TRAITS.length).toBeLessThanOrEqual(32);
  });

  it('combina modificadores multiplicando', () => {
    expect(traitMods(0).damage).toBe(1);
    expect(traitMods(bit(Trait.STRONG)).damage).toBeCloseTo(1.3);
    expect(traitMods(bit(Trait.STRONG) | bit(Trait.BRAVE)).damage).toBeCloseTo(1.3 * 1.15);
    expect(traitMods(bit(Trait.GIANT)).hunger).toBeCloseTo(1.2);
    expect(traitMods(bit(Trait.IMMUNE)).plagueImmune).toBe(true);
    expect(traitMods(bit(Trait.STRONG))).toBe(traitMods(bit(Trait.STRONG)));
  });

  it('un rasgo sustituye a su opuesto', () => {
    const m = addTrait(bit(Trait.STRONG), Trait.WEAK);
    expect(hasTrait(m, Trait.WEAK)).toBe(true);
    expect(hasTrait(m, Trait.STRONG)).toBe(false);
    expect(traitNames(addTrait(m, Trait.HEALER))).toEqual(['Débil', 'Sanador']);
  });

  it('los rasgos aleatorios son 0-2, heredables y sin opuestos juntos', () => {
    const rng = new Rng(7);
    for (let k = 0; k < 500; k++) {
      const m = randomTraits(rng);
      const ids = TRAITS.filter((t) => hasTrait(m, t.id));
      expect(ids.length).toBeLessThanOrEqual(2);
      for (const t of ids) {
        expect(t.inheritable).toBe(true);
        if (t.opposite !== undefined) expect(hasTrait(m, t.opposite)).toBe(false);
      }
    }
  });

  it('la herencia transmite rasgos de los padres y no los adquiridos', () => {
    const rng = new Rng(3);
    const father = bit(Trait.STRONG) | bit(Trait.VETERAN);
    const mother = bit(Trait.LONG_LIVED) | bit(Trait.SURVIVOR);
    let strong = 0;
    let longLived = 0;
    const N = 2000;
    for (let k = 0; k < N; k++) {
      const child = inheritTraits(father, mother, rng);
      expect(hasTrait(child, Trait.VETERAN)).toBe(false);
      expect(hasTrait(child, Trait.SURVIVOR)).toBe(false);
      if (hasTrait(child, Trait.STRONG)) strong++;
      if (hasTrait(child, Trait.LONG_LIVED)) longLived++;
    }
    expect(strong / N).toBeGreaterThan(0.4);
    expect(strong / N).toBeLessThan(0.65);
    expect(longLived / N).toBeGreaterThan(0.4);
  });

  it('la herencia es determinista por semilla', () => {
    const a = new Rng(11);
    const b = new Rng(11);
    for (let k = 0; k < 50; k++) expect(inheritTraits(5, 96, a)).toBe(inheritTraits(5, 96, b));
  });
});

describe('efectos de los rasgos', () => {
  const store = (): UnitStore => {
    const u = new UnitStore(10);
    u.spawn(Species.WOLF, 1, 1, { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0, traits: bit(Trait.STRONG) | bit(Trait.STURDY) });
    u.spawn(Species.WOLF, 2, 1, { sex: 1, ageTicks: 0, generation: 0, thinkOffset: 0 });
    return u;
  };

  it('modifican el daño hecho y recibido', () => {
    const u = store();
    expect(damageMultiplier(u, 0)).toBeCloseTo(1.3);
    expect(damageTakenMultiplier(u, 0)).toBeCloseTo(0.75);
    expect(damageMultiplier(u, 1)).toBe(1);
  });

  it('el inmune nato no contrae la plaga', () => {
    const u = store();
    u.traits[1] = bit(Trait.IMMUNE);
    expect(infect(u, 1)).toBe(false);
    expect(infect(u, 0)).toBe(true);
  });

  it('las bajas convierten en veterano', () => {
    const u = store();
    for (let k = 0; k < VETERAN_KILLS - 1; k++) u.addKill(1);
    expect(hasTrait(u.traits[1], Trait.VETERAN)).toBe(false);
    u.addKill(1);
    expect(hasTrait(u.traits[1], Trait.VETERAN)).toBe(true);
    expect(u.kills[1]).toBe(VETERAN_KILLS);
  });

  it('la fertilidad cambia la espera entre crías', () => {
    const u = store();
    const def = SPECIES[Species.WOLF];
    u.traits[0] = bit(Trait.FERTILE);
    u.traits[1] = bit(Trait.BARREN);
    setBreedCooldown(u, 0, def);
    setBreedCooldown(u, 1, def);
    expect(u.cooldown[0]).toBe(Math.round(def.breedCooldownTicks * 0.7));
    expect(u.cooldown[1]).toBe(Math.min(0xffff, Math.round(def.breedCooldownTicks * 1.6)));
  });

  it('reparte ritmos fraccionarios sin perder ni ganar', () => {
    let sum = 0;
    for (let t = 0; t < 1000; t++) sum += scaledStep(1, 1.3, t);
    expect(sum).toBe(1300);
    sum = 0;
    for (let t = 0; t < 1000; t++) sum += scaledStep(1, 0.75, t);
    expect(sum).toBe(750);
    expect(scaledStep(2, 1, 5)).toBe(2);
  });

  it('el glotón pasa hambre antes que el frugal', () => {
    const sim = new Simulation({ seedText: 'hambre', size: 64, capacity: 50, populate: false });
    const opts = { sex: 0, ageTicks: 0, generation: 0, thinkOffset: 0 };
    const glutton = sim.units.spawn(Species.WOLF, 2, 2, { ...opts, traits: bit(Trait.GLUTTON) });
    const frugal = sim.units.spawn(Species.WOLF, 3, 2, { ...opts, traits: bit(Trait.FRUGAL) });
    const start = sim.units.hunger[glutton];
    for (let t = 0; t < 200; t++) sim.step();
    const lostG = start - sim.units.hunger[glutton];
    const lostF = start - sim.units.hunger[frugal];
    expect(lostG).toBeGreaterThan(lostF);
  });

  it('las crías heredan rasgos y cuentan como hijos de ambos', () => {
    const sim = new Simulation({ seedText: 'crias', size: 96, capacity: 400, populate: true });
    for (let t = 0; t < 3000; t++) sim.step();
    const u = sim.units;
    let parents = 0;
    let traited = 0;
    for (let i = 0; i < u.highWater; i++) {
      if (u.alive[i] === 0) continue;
      if (u.children[i] > 0) parents++;
      if (u.generation[i] > 0 && u.traits[i] !== 0) traited++;
    }
    expect(sim.stats.births).toBeGreaterThan(0);
    expect(parents).toBeGreaterThan(0);
    expect(traited).toBeGreaterThan(0);
  });
});
