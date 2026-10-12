import type { SaveMeta } from './snapshot';

const DB_NAME = 'minibox';
const DB_VERSION = 1;
/** Resúmenes (lista rápida) y datos (pesados) van en almacenes separados. */
const META_STORE = 'meta';
const DATA_STORE = 'data';

export const AUTOSAVE_SLOT = 'auto';
export const MANUAL_SLOTS = ['1', '2', '3', '4', '5'] as const;
export const SLOT_IDS: readonly string[] = [AUTOSAVE_SLOT, ...MANUAL_SLOTS];

export interface SlotInfo {
  slot: string;
  meta: SaveMeta | null;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error de IndexedDB'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Operación cancelada'));
    tx.onerror = () => reject(tx.error ?? new Error('Error de IndexedDB'));
  });
}

function checkSlot(slot: string): void {
  if (!SLOT_IDS.includes(slot)) throw new Error(`Ranura desconocida: ${slot}`);
}

/** Traduce los errores del navegador a mensajes para el jugador. */
export function storageErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') return 'No queda espacio en el navegador para guardar';
  if (err instanceof Error && err.message) return err.message;
  return 'No se pudo acceder al almacenamiento del navegador';
}

/** Ranuras de partidas guardadas en IndexedDB (autoguardado + 5 manuales). */
export class SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  static get available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
          if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
        };
        req.onsuccess = () => {
          const db = req.result;
          // Otra pestaña con una versión más nueva necesita la base: se cierra y se reabrirá al usarla.
          db.onversionchange = () => {
            db.close();
            this.db = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('No se pudo abrir el almacenamiento'));
        // Si otra pestaña bloquea la apertura, la petición sigue pendiente y se resuelve al liberarse.
      });
      // Si falla, el siguiente intento vuelve a abrir.
      this.db.catch(() => (this.db = null));
    }
    return this.db;
  }

  async list(): Promise<SlotInfo[]> {
    const db = await this.open();
    const store = db.transaction(META_STORE, 'readonly').objectStore(META_STORE);
    const metas = await Promise.all(SLOT_IDS.map((slot) => promisify(store.get(slot) as IDBRequest<SaveMeta | undefined>)));
    return SLOT_IDS.map((slot, k) => ({ slot, meta: metas[k] ?? null }));
  }

  async put(slot: string, meta: SaveMeta, data: Uint8Array): Promise<void> {
    checkSlot(slot);
    const db = await this.open();
    const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
    // Se guarda una copia exacta del búfer (sin bytes de más).
    tx.objectStore(DATA_STORE).put(data.slice().buffer, slot);
    tx.objectStore(META_STORE).put(meta, slot);
    await done(tx);
  }

  async get(slot: string): Promise<Uint8Array | null> {
    checkSlot(slot);
    const db = await this.open();
    const buf = await promisify(db.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).get(slot) as IDBRequest<ArrayBuffer | undefined>);
    return buf ? new Uint8Array(buf) : null;
  }

  async remove(slot: string): Promise<void> {
    checkSlot(slot);
    const db = await this.open();
    const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
    tx.objectStore(DATA_STORE).delete(slot);
    tx.objectStore(META_STORE).delete(slot);
    await done(tx);
  }
}
