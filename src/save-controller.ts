import { tickToDate } from './core/time';
import { AUTOSAVE_SLOT, SaveStore, storageErrorMessage, type SlotInfo } from './persistence/db';
import { decodeSave, describe, encodeSave, type SaveMeta } from './persistence/snapshot';
import type { Simulation } from './sim/simulation';
import type { SaveActions } from './ui/saves-panel';
import type { Settings } from './ui/settings';

/** Lo que el controlador necesita del juego. */
export interface SaveHost {
  sim(): Simulation | null;
  /** Sustituye la partida en curso por una cargada. */
  adopt(sim: Simulation, label: string): void;
  toast(text: string): void;
  settings(): Settings;
}

const MS_PER_MINUTE = 60_000;
/** Tamaño máximo de un archivo importado (evita colgar el navegador con algo que no es una partida). */
const MAX_IMPORT_BYTES = 256 * 1024 * 1024;

function safeFileName(text: string): string {
  return text.replace(/[^a-z0-9áéíóúñü_-]+/gi, '-').slice(0, 40) || 'mundo';
}

/** Guardar, cargar, autoguardar, exportar e importar partidas. */
export class SaveController implements SaveActions {
  private readonly store = SaveStore.available ? new SaveStore() : null;
  private lastAutosave = 0;
  private lastAutosaveTick = -1;
  private busy = false;
  /** Autoguardado pedido mientras se guardaba otra cosa: se hace al terminar. */
  private autosavePending = false;

  constructor(private readonly host: SaveHost) {}

  canSave(): boolean {
    return this.host.sim() !== null;
  }

  async list(): Promise<SlotInfo[]> {
    if (!this.store) throw new Error('Sin almacenamiento');
    return this.store.list();
  }

  /** Partida guardada más reciente (para «Continuar»). */
  async latest(): Promise<SlotInfo | null> {
    if (!this.store) return null;
    try {
      const slots = await this.store.list();
      return slots.filter((s) => s.meta).sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0))[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Guarda en una ranura. Devuelve true si se escribió. */
  async save(slot: string, quiet = false): Promise<boolean> {
    const sim = this.host.sim();
    if (!sim || !this.store) return false;
    if (this.busy) {
      if (!quiet) this.host.toast('Espera: se está guardando la partida');
      return false;
    }
    this.busy = true;
    try {
      const tick = sim.tick;
      const meta = describe(sim, sim.options.seedText, Date.now());
      await this.store.put(slot, meta, await encodeSave(sim, meta));
      if (slot === AUTOSAVE_SLOT) this.lastAutosaveTick = tick;
      if (!quiet) this.host.toast(`Partida guardada (${slot === AUTOSAVE_SLOT ? 'autoguardado' : `ranura ${slot}`})`);
      return true;
    } catch (err) {
      this.host.toast(`No se pudo guardar: ${storageErrorMessage(err)}`);
      return false;
    } finally {
      this.busy = false;
      if (this.autosavePending) {
        this.autosavePending = false;
        this.saveNow();
      }
    }
  }

  async load(slot: string): Promise<void> {
    if (!this.store) return;
    try {
      const data = await this.store.get(slot);
      if (!data) {
        this.host.toast('Esa ranura está vacía');
        return;
      }
      const sim = await decodeSave(data);
      this.host.adopt(sim, `Partida «${sim.options.seedText}» cargada`);
      this.markSaved(sim);
    } catch (err) {
      this.host.toast(`No se pudo cargar: ${storageErrorMessage(err)}`);
    }
  }

  async remove(slot: string): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.remove(slot);
      this.host.toast('Partida borrada');
    } catch (err) {
      this.host.toast(`No se pudo borrar: ${storageErrorMessage(err)}`);
    }
  }

  async exportFile(): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return;
    try {
      const meta: SaveMeta = describe(sim, sim.options.seedText, Date.now());
      const data = await encodeSave(sim, meta);
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `minibox-${safeFileName(sim.options.seedText)}-año${tickToDate(sim.tick).year}.minibox`;
      document.body.append(a);
      a.click();
      a.remove();
      // Se da tiempo al navegador a empezar la descarga antes de liberar el enlace.
      window.setTimeout(() => URL.revokeObjectURL(url), MS_PER_MINUTE);
      this.host.toast('Partida exportada');
    } catch (err) {
      this.host.toast(`No se pudo exportar: ${storageErrorMessage(err)}`);
    }
  }

  async importFile(file: File): Promise<void> {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('El archivo es demasiado grande');
      const sim = await decodeSave(new Uint8Array(await file.arrayBuffer()));
      this.host.adopt(sim, `Partida «${sim.options.seedText}» importada`);
      this.markSaved(sim);
    } catch (err) {
      this.host.toast(`No se pudo importar: ${storageErrorMessage(err)}`);
    }
  }

  /** Autoguardado periódico (sólo si el mundo ha avanzado desde el último). */
  tick(now: number): void {
    const s = this.host.settings();
    const sim = this.host.sim();
    if (!s.autosave || !sim) return;
    if (this.lastAutosave === 0) this.lastAutosave = now;
    if (now - this.lastAutosave < s.autosaveMinutes * MS_PER_MINUTE) return;
    this.lastAutosave = now;
    this.saveNow();
  }

  /** Autoguardado inmediato (al ocultar la pestaña o cerrar la app). */
  saveNow(): void {
    const sim = this.host.sim();
    if (!this.host.settings().autosave || !sim || sim.tick === this.lastAutosaveTick) return;
    if (this.busy) {
      this.autosavePending = true;
      return;
    }
    // `lastAutosaveTick` sólo avanza si la escritura sale bien (si falla, se reintenta).
    void this.save(AUTOSAVE_SLOT, true);
  }

  /** Una partida recién creada o cargada no necesita autoguardarse hasta que avance. */
  markSaved(sim: Simulation): void {
    this.lastAutosaveTick = sim.tick;
    this.lastAutosave = 0;
  }
}
