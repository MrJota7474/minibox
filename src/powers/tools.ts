import { Species, type SpeciesId } from '../entities/species';
import type { BrushToolId, Command } from '../sim/commands';

export type TabId = 'terreno' | 'naturaleza' | 'animales' | 'razas';

export interface TabDef {
  readonly id: TabId;
  readonly label: string;
}

export const TABS: readonly TabDef[] = [
  { id: 'terreno', label: 'Terreno' },
  { id: 'naturaleza', label: 'Naturaleza' },
  { id: 'animales', label: 'Animales' },
  { id: 'razas', label: 'Razas' },
];

export type ToolDef =
  | {
      readonly id: string;
      readonly label: string;
      readonly tab: TabId;
      readonly kind: 'brush';
      readonly brush: BrushToolId;
      /** Repite la aplicación mientras se mantiene pulsado (ms). */
      readonly repeatMs?: number;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly tab: TabId;
      readonly kind: 'spawn';
      readonly species: SpeciesId;
      readonly repeatMs: number;
    };

const brush = (tab: TabId, id: BrushToolId, label: string, repeatMs?: number): ToolDef => ({
  id,
  label,
  tab,
  kind: 'brush',
  brush: id,
  repeatMs,
});

const SPAWN_REPEAT_MS = 250;
const HEIGHT_REPEAT_MS = 120;

export const TOOLS: readonly ToolDef[] = [
  brush('terreno', 'deep', 'Abismo'),
  brush('terreno', 'ocean', 'Océano'),
  brush('terreno', 'water', 'Agua'),
  brush('terreno', 'sand', 'Arena'),
  brush('terreno', 'soil', 'Tierra'),
  brush('terreno', 'hills', 'Colina'),
  brush('terreno', 'mountain', 'Montaña'),
  brush('terreno', 'raise', 'Elevar', HEIGHT_REPEAT_MS),
  brush('terreno', 'lower', 'Hundir', HEIGHT_REPEAT_MS),
  brush('terreno', 'sponge', 'Secar'),
  brush('naturaleza', 'grass', 'Pradera'),
  brush('naturaleza', 'forest', 'Bosque'),
  brush('naturaleza', 'desert', 'Desierto'),
  brush('naturaleza', 'tree', 'Árbol'),
  brush('naturaleza', 'bush', 'Bayas'),
  brush('naturaleza', 'clear-flora', 'Talar'),
  { id: 'sheep', label: 'Oveja', tab: 'animales', kind: 'spawn', species: Species.SHEEP, repeatMs: SPAWN_REPEAT_MS },
  { id: 'rabbit', label: 'Conejo', tab: 'animales', kind: 'spawn', species: Species.RABBIT, repeatMs: SPAWN_REPEAT_MS },
  { id: 'wolf', label: 'Lobo', tab: 'animales', kind: 'spawn', species: Species.WOLF, repeatMs: SPAWN_REPEAT_MS },
  { id: 'human', label: 'Humanos', tab: 'razas', kind: 'spawn', species: Species.HUMAN, repeatMs: SPAWN_REPEAT_MS },
  { id: 'silvan', label: 'Silvanos', tab: 'razas', kind: 'spawn', species: Species.SILVAN, repeatMs: SPAWN_REPEAT_MS },
  { id: 'petrino', label: 'Petrinos', tab: 'razas', kind: 'spawn', species: Species.PETRINO, repeatMs: SPAWN_REPEAT_MS },
  { id: 'tusker', label: 'Colmilludos', tab: 'razas', kind: 'spawn', species: Species.TUSKER, repeatMs: SPAWN_REPEAT_MS },
];

export function toolById(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function commandFor(tool: ToolDef, x: number, y: number, size: number): Command {
  return tool.kind === 'brush'
    ? { type: 'brush', tool: tool.brush, x, y, size }
    : { type: 'spawn', species: tool.species, x, y, size };
}
