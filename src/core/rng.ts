/**
 * Generador pseudoaleatorio determinista (sfc32).
 * Toda la simulación usa esta clase: nunca Math.random.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = (seed ^ 0xdeadbeef) >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  static fromString(text: string): Rng {
    return new Rng(hashString(text));
  }

  /** Entero sin signo de 32 bits. */
  nextU32(): number {
    const t0 = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const t = (t0 + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Flotante en [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Entero en [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Entero en [min, max] (ambos incluidos). */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Crea un flujo independiente derivado de este. */
  fork(salt: number): Rng {
    return new Rng((this.nextU32() ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  }

  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: readonly [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = state;
  }
}

/** Hash de texto a 32 bits (cyrb53 truncado). */
export function hashString(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}
