import { describe, expect, it } from 'vitest';
import { RACE_IDS, Species } from '../src/entities/species';
import { festiveLook } from '../src/render/festive-look';
import { PARTICLE_STYLES } from '../src/render/fx';

describe('festejos de cada raza', () => {
  it('cada raza celebra con partículas que existen y un paso de baile propio', () => {
    for (const race of RACE_IDS) {
      const look = festiveLook(race);
      expect(PARTICLE_STYLES).toContain(look.particle);
      expect(look.count).toBeGreaterThan(0);
      expect(look.chance).toBeGreaterThan(0);
      expect(look.chance).toBeLessThanOrEqual(1);
      expect(look.dance[0]).not.toBe(look.dance[1]);
    }
  });

  it('las razas no celebran igual: farolillos silvanos, fuegos artificiales petrinos, brasas colmilludas', () => {
    const kinds = new Set(RACE_IDS.map((r) => festiveLook(r).particle));
    expect(kinds.size).toBe(RACE_IDS.length);
    expect(festiveLook(Species.SILVAN).particle).toBe('lantern');
    expect(festiveLook(Species.PETRINO).particle).toBe('firework');
    // Una especie sin festejo propio usa el humano.
    expect(festiveLook(Species.SHEEP)).toEqual(festiveLook(Species.HUMAN));
  });
});
