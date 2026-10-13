import { JOB_COUNT } from '../civ/model';
import { ABOARD_FLAG, MAX_CAPACITY } from '../entities/units';
import { LAW_IDS, defaultLaws, type WorldLaws } from '../sim/laws';
import { ERA_INFO } from '../world/climate';
import { Simulation } from '../sim/simulation';
import { checkSave, validateLoaded } from './validate';

/**
 * Formato de partida guardada:
 *   "MBX1" · u32 longitud de la cabecera · cabecera JSON · (relleno a 8) · arrays tipados
 * Los arrays (mapa y criaturas) van en bruto, alineados a 8 bytes, en el orden de
 * `world.dataViews()` + `units.dataViews()`. El conjunto se comprime con gzip.
 */
const MAGIC = [0x4d, 0x42, 0x58, 0x31];
export const SAVE_VERSION = 3;
/** Versiones que se pueden cargar (las anteriores se migran al cargar). */
const SUPPORTED_VERSIONS: readonly number[] = [1, 2, 3];
const ALIGN = 8;
const MIN_SIZE = 32;
const MAX_SIZE = 1024;
/** Tope de datos descomprimidos (una partida real ocupa unos pocos MB). */
const MAX_UNPACKED_BYTES = 128 * 1024 * 1024;
/** Arrays del mapa (`world.dataViews()`) según la versión: la 2 añadió los mares. */
const worldViewCount = (version: number): number => (version >= 2 ? 12 : 11);

/** Resumen visible de una partida (lista de ranuras). */
export interface SaveMeta {
  name: string;
  seedText: string;
  size: number;
  tick: number;
  savedAt: number;
  population: number;
  villages: number;
  kingdoms: number;
}

type Civ = Simulation['civ'];

interface Header {
  version: number;
  meta: SaveMeta;
  options: { seedText: string; size: number; capacity: number };
  tick: number;
  unitLimit: number;
  laws: WorldLaws;
  /** Era del mundo (desde la versión 3). */
  climate?: { era: number; eraIndex: number };
  births: number;
  deaths: number[];
  rng: number[][];
  vegCursor: number;
  regionsDirty: boolean;
  units: { highWater: number; freeTop: number };
  hazards: { burning: number[]; molten: number[] };
  powers: { effects: Simulation['powers']['effects']; held: number[] };
  civ: {
    tick: number;
    villages: Civ['villages'];
    buildings: Civ['buildings'];
    chronicle: Civ['chronicle'];
    kingdoms: Civ['kingdoms']['kingdoms'];
    wars: Civ['kingdoms']['wars'];
    /** Desde la versión 2. */
    boats?: Civ['boats'];
  };
  /** Longitud en bytes de cada array (comprobación al cargar). */
  views: number[];
}

function allViews(sim: Simulation, version = SAVE_VERSION): ArrayBufferView[] {
  return [...sim.world.dataViews().slice(0, worldViewCount(version)), ...sim.units.dataViews()];
}

function bytesOf(v: ArrayBufferView): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

const align = (n: number): number => Math.ceil(n / ALIGN) * ALIGN;

/** Resumen de la partida para la lista de ranuras. */
export function describe(sim: Simulation, name: string, savedAt: number): SaveMeta {
  return {
    name,
    seedText: sim.options.seedText,
    size: sim.options.size,
    tick: sim.tick,
    savedAt,
    population: sim.units.count,
    villages: sim.civ.villages.filter((v) => v.alive).length,
    kingdoms: sim.civ.kingdoms.kingdoms.filter((k) => k.alive).length,
  };
}

/** Serializa el estado completo de la simulación (sin comprimir). */
export function serialize(sim: Simulation, meta: SaveMeta): Uint8Array {
  const views = allViews(sim);
  const civ = sim.civ;
  const header: Header = {
    version: SAVE_VERSION,
    meta,
    options: { seedText: sim.options.seedText, size: sim.options.size, capacity: sim.units.capacity },
    tick: sim.tick,
    unitLimit: sim.unitLimit,
    laws: { ...sim.laws },
    climate: { era: sim.climate.era, eraIndex: sim.climate.eraIndex },
    births: sim.stats.births,
    deaths: [...sim.stats.deaths],
    rng: sim.getRngStates(),
    vegCursor: sim.vegetation.getCursor(),
    regionsDirty: sim.world.regionsDirty,
    units: sim.units.getCounters(),
    hazards: sim.hazards.getLists(),
    powers: { effects: sim.powers.effects, held: sim.powers.held },
    civ: { tick: civ.tick, villages: civ.villages, buildings: civ.buildings, chronicle: civ.chronicle, kingdoms: civ.kingdoms.kingdoms, wars: civ.kingdoms.wars, boats: civ.boats },
    views: views.map((v) => v.byteLength),
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  let total = align(8 + json.length);
  for (const v of views) total += align(v.byteLength);
  const out = new Uint8Array(total);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let off = align(8 + json.length);
  for (const v of views) {
    out.set(bytesOf(v), off);
    off += align(v.byteLength);
  }
  return out;
}

function fail(reason: string): never {
  checkSave(false, reason);
}

function readHeader(bytes: Uint8Array): { header: Header; dataStart: number } {
  if (bytes.length < 8 || MAGIC.some((b, k) => bytes[k] !== b)) fail('no es un archivo de MiniBox');
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (8 + len > bytes.length) fail('archivo cortado');
  let header: Header;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len))) as Header;
  } catch {
    fail('cabecera dañada');
  }
  if (!SUPPORTED_VERSIONS.includes(header.version)) fail(`versión ${String(header.version)} no compatible`);
  return { header, dataStart: align(8 + len) };
}

/** Lee sólo el resumen (sin reconstruir el mundo). */
export function readMeta(bytes: Uint8Array): SaveMeta {
  return readHeader(bytes).header.meta;
}

function validateHeader(h: Header): void {
  const { size, capacity } = h.options ?? {};
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) fail('tamaño de mapa');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) fail('capacidad de criaturas');
  if (typeof h.options.seedText !== 'string') fail('semilla');
  if (!Number.isInteger(h.tick) || h.tick < 0) fail('fecha');
  // Las leyes nuevas (estaciones, biomas mágicos) no existían antes de la versión 3: activadas.
  if (h.version < 3 && h.laws && typeof h.laws === 'object') h.laws = { ...defaultLaws(), ...h.laws };
  for (const id of LAW_IDS) if (typeof h.laws?.[id] !== 'boolean') fail('leyes del mundo');
  if (h.version >= 3 && (!h.climate || !isCount(h.climate.eraIndex) || !isCount(h.climate.era) || h.climate.era >= ERA_INFO.length)) fail('era del mundo');
  const c = h.civ;
  if (!c || !Array.isArray(c.villages) || !Array.isArray(c.buildings) || !Array.isArray(c.kingdoms) || !Array.isArray(c.wars) || !Array.isArray(c.chronicle)) fail('civilizaciones');
  const indexed = (list: readonly { id: number }[]): boolean => list.every((x, k) => x && x.id === k);
  if (h.version >= 2 && !Array.isArray(c.boats)) fail('barcos');
  if (!indexed(c.villages) || !indexed(c.buildings) || !indexed(c.kingdoms) || !indexed(c.wars) || !indexed(c.boats ?? [])) fail('identificadores de civilización');
  if (!Array.isArray(h.deaths) || !h.deaths.every(isCount) || !isCount(h.births)) fail('estadísticas');
  if (!Array.isArray(h.powers?.effects) || !Array.isArray(h.powers?.held)) fail('efectos');
  if (!Array.isArray(h.hazards?.burning) || !Array.isArray(h.hazards?.molten)) fail('fuego y lava');
  if (!isCount(h.units?.highWater) || !isCount(h.units?.freeTop)) fail('contadores de criaturas');
  if (!isCount(h.vegCursor) || !isCount(h.unitLimit) || typeof h.regionsDirty !== 'boolean') fail('estado del mundo');
  if (!Array.isArray(h.views) || !h.views.every(isCount)) fail('estructura');
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Antes de reservar memoria: los datos deben existir y cuadrar con el tamaño declarado. */
function checkDataSize(h: Header, bytes: Uint8Array, dataStart: number): void {
  const { size, capacity } = h.options;
  if (h.views[0] !== size * size || h.views[worldViewCount(h.version)] !== capacity) fail('tamaño de los datos');
  const total = h.views.reduce((n, len) => n + align(len), 0);
  if (dataStart + total > bytes.length) fail('archivo cortado');
}

/** Una criatura marcada «a bordo» que no viaja en ningún barco vivo vuelve al mundo. */
function releaseOrphanPassengers(sim: Simulation): void {
  const u = sim.units;
  const aboard = new Set<number>();
  for (const b of sim.civ.boats) if (b.alive) for (const h of b.passengers) aboard.add(u.resolve(h));
  for (let i = 0; i < u.highWater; i++) if (u.alive[i] === 1 && (u.status[i] & ABOARD_FLAG) !== 0 && !aboard.has(i)) u.status[i] &= ~ABOARD_FLAG;
}

/** Reconstruye una simulación a partir de una partida sin comprimir. */
export function deserialize(bytes: Uint8Array): Simulation {
  const { header: h, dataStart } = readHeader(bytes);
  validateHeader(h);
  checkDataSize(h, bytes, dataStart);
  const sim = new Simulation({ seedText: h.options.seedText, size: h.options.size, capacity: h.options.capacity, populate: false, blank: true });
  const views = allViews(sim, h.version);
  if (views.length !== h.views.length || views.some((v, k) => v.byteLength !== h.views[k])) fail('datos del mapa o de las criaturas');
  let off = dataStart;
  for (const v of views) {
    if (off + v.byteLength > bytes.length) fail('archivo cortado');
    bytesOf(v).set(bytes.subarray(off, off + v.byteLength));
    off += align(v.byteLength);
  }
  sim.units.setCounters(h.units);
  sim.world.regionsDirty = h.regionsDirty === true;
  // Los mares se guardan desde la versión 2; antes se calculan al cargar.
  if (h.version < 2) sim.world.computeSeas();
  else sim.world.rebuildSeaSizes();
  sim.world.markAllDirty();
  sim.hazards.setLists(h.hazards);
  sim.tick = h.tick;
  sim.unitLimit = Math.max(1, Math.min(sim.units.capacity, Math.floor(h.unitLimit)));
  Object.assign(sim.laws, h.laws);
  if (h.climate) {
    sim.climate.eraIndex = h.climate.eraIndex;
    sim.climate.era = h.climate.era as typeof sim.climate.era;
  } else {
    // Partida anterior a las eras: empieza la que le toca por su fecha.
    sim.climate.update(h.tick);
  }
  sim.stats.births = h.births;
  sim.stats.deaths.set(h.deaths.slice(0, sim.stats.deaths.length));
  sim.setRngStates(h.rng);
  sim.vegetation.setCursor(h.vegCursor);
  sim.powers.effects.push(...h.powers.effects);
  sim.powers.held.push(...h.powers.held);
  const civ = sim.civ;
  civ.tick = h.civ.tick;
  civ.villages.push(...h.civ.villages);
  civ.buildings.push(...h.civ.buildings);
  civ.chronicle.push(...h.civ.chronicle);
  civ.kingdoms.kingdoms.push(...h.civ.kingdoms);
  civ.kingdoms.wars.push(...h.civ.wars);
  civ.boats.push(...(h.civ.boats ?? []));
  // Versión 1: aún no existía el oficio de pescador.
  for (const v of civ.villages) while (Array.isArray(v.jobCounts) && v.jobCounts.length < JOB_COUNT) v.jobCounts.push(0);
  validateLoaded(sim);
  releaseOrphanPassengers(sim);
  civ.kingdoms.rebuildHostility();
  // El registro de comandos no viaja con la partida: ya no se puede repetir desde la semilla.
  sim.logTruncated = true;
  return sim;
}

const GZIP = [0x1f, 0x8b];

/** Pasa los datos por un (des)compresor, con un tope de tamaño para la salida. */
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_UNPACKED_BYTES) {
      await reader.cancel();
      fail('demasiado grande');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Partida lista para guardar: resumen + datos comprimidos. */
export async function encodeSave(sim: Simulation, meta: SaveMeta): Promise<Uint8Array> {
  return pipe(serialize(sim, meta), new CompressionStream('gzip'));
}

/** Descomprime (si hace falta) los datos de una partida. */
export async function unpackSave(data: Uint8Array): Promise<Uint8Array> {
  if (data[0] === GZIP[0] && data[1] === GZIP[1]) {
    try {
      return await pipe(data, new DecompressionStream('gzip'));
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Partida no válida')) throw err;
      fail('archivo comprimido dañado');
    }
  }
  return data;
}

export async function decodeSave(data: Uint8Array): Promise<Simulation> {
  return deserialize(await unpackSave(data));
}
