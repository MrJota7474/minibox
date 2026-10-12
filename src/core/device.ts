/** Perfil del dispositivo: decide tamaño de mapa y límite de criaturas. */
export type Tier = 'bajo' | 'medio' | 'alto' | 'ultra';

export interface TierSettings {
  mapSize: number;
  unitCap: number;
  dprCap: number;
}

export const TIER_SETTINGS: Readonly<Record<Tier, TierSettings>> = {
  bajo: { mapSize: 192, unitCap: 400, dprCap: 1 },
  medio: { mapSize: 256, unitCap: 800, dprCap: 1.5 },
  alto: { mapSize: 384, unitCap: 2000, dprCap: 2 },
  ultra: { mapSize: 512, unitCap: 4000, dprCap: 2 },
};

export const TIER_ORDER: readonly Tier[] = ['bajo', 'medio', 'alto', 'ultra'];

export interface DeviceInfo {
  cores: number;
  memoryGb: number | undefined;
  isTouch: boolean;
  /** Milisegundos de la micro-prueba (menos es mejor). */
  benchMs: number;
}

export interface DeviceProfile extends TierSettings {
  tier: Tier;
  isTouch: boolean;
}

const SLOW_BENCH_MS = 40;
const FAST_BENCH_MS = 12;

/** Clasificación pura (testeable) a partir de datos del dispositivo. */
export function classifyDevice(info: DeviceInfo): Tier {
  const mem = info.memoryGb ?? 4;
  if (info.isTouch) {
    if (info.cores <= 4 || mem <= 2 || info.benchMs > SLOW_BENCH_MS) return 'bajo';
    return 'medio';
  }
  if (info.cores <= 2 || mem <= 2 || info.benchMs > SLOW_BENCH_MS) return 'medio';
  if (info.cores >= 12 && mem >= 8 && info.benchMs < FAST_BENCH_MS) return 'ultra';
  return 'alto';
}

export function profileForTier(tier: Tier, isTouch: boolean): DeviceProfile {
  return { tier, isTouch, ...TIER_SETTINGS[tier] };
}

/** Micro-prueba de CPU sobre arrays tipados (similar a la carga de la simulación). */
function runBenchmark(): number {
  const n = 1 << 16;
  const a = new Float32Array(n);
  const b = new Uint16Array(n);
  const start = performance.now();
  for (let pass = 0; pass < 20; pass++) {
    for (let i = 0; i < n; i++) {
      a[i] = a[i] * 0.98 + (b[i] & 7) * 0.5;
      b[i] = (b[i] + i * 31) & 0xffff;
    }
  }
  return performance.now() - start;
}

export function detectDevice(): DeviceProfile {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || nav.maxTouchPoints > 1;
  const info: DeviceInfo = {
    cores: nav.hardwareConcurrency || 4,
    memoryGb: nav.deviceMemory,
    isTouch,
    benchMs: runBenchmark(),
  };
  return profileForTier(classifyDevice(info), isTouch);
}
