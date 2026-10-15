import { describe, expect, it } from 'vitest';
import { Job } from '../src/civ/model';
import { SPECIES, Species } from '../src/entities/species';
import { UnitState, UnitStore } from '../src/entities/units';
import { CARAVAN_GAP, CaravanTrail, leadsCaravan } from '../src/render/caravan';

function adult(u: UnitStore, species: number): number {
  return u.spawn(species as 0, 5.5, 5.5, { sex: 0, ageTicks: SPECIES[species].adultTicks, generation: 0, thinkOffset: 0 });
}

describe('caravanas', () => {
  it('sólo los mercaderes dunarios en viaje (o volviendo cargados) llevan dromedario', () => {
    const u = new UnitStore(8);
    const dune = adult(u, Species.DUNEFOLK);
    const human = adult(u, Species.HUMAN);
    for (const i of [dune, human]) {
      u.job[i] = Job.MERCHANT;
      u.state[i] = UnitState.TRADE;
    }
    expect(leadsCaravan(u, dune)).toBe(true);
    expect(leadsCaravan(u, human)).toBe(false);
    // A la vuelta: ya no está en TRADE, pero trae carga.
    u.state[dune] = UnitState.IDLE;
    u.carry[dune] = 2;
    expect(leadsCaravan(u, dune)).toBe(true);
    // En casa y sin carga, el dromedario se queda en el corral.
    u.carry[dune] = 0;
    expect(leadsCaravan(u, dune)).toBe(false);
    // Un dunario con otro oficio no lleva caravana.
    u.job[dune] = Job.FARMER;
    u.state[dune] = UnitState.TRADE;
    expect(leadsCaravan(u, dune)).toBe(false);
  });

  it('el dromedario va detrás según hacia dónde camina el mercader y gira poco a poco', () => {
    const trail = new CaravanTrail(4);
    // Hacia la derecha: el dromedario a su izquierda, mirando a la derecha.
    const right = trail.follow(1, 10, 10, 0.1, 0);
    expect(right.x).toBeCloseTo(10 - CARAVAN_GAP, 5);
    expect(right.y).toBeCloseTo(10, 5);
    expect(right.flip).toBe(false);
    // Media vuelta: no salta de golpe al otro lado.
    const turning = trail.follow(1, 10, 10, -0.1, 0);
    expect(turning.x).toBeLessThan(10);
    // Tras unos pasos hacia la izquierda ya va detrás, a su derecha, y mirando a la izquierda.
    let p = turning;
    for (let k = 0; k < 40; k++) p = trail.follow(1, 10, 10, -0.1, 0);
    expect(p.x).toBeCloseTo(10 + CARAVAN_GAP, 2);
    expect(p.flip).toBe(true);
    // Quieto, mantiene el rumbo.
    const still = trail.follow(1, 10, 10, 0, 0);
    expect(still.x).toBeCloseTo(p.x, 5);
  });
});
