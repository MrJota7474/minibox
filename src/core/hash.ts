/** Hash FNV-1a de 32 bits sobre el contenido binario de varios arrays tipados. */
export function hashViews(views: readonly ArrayBufferView[], seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (const view of views) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h = Math.imul(h ^ bytes[i], 0x01000193);
    }
  }
  return h >>> 0;
}

/** Mezcla un número entero en un hash existente. */
export function hashMix(h: number, value: number): number {
  return Math.imul((h ^ value) >>> 0, 0x01000193) >>> 0;
}
