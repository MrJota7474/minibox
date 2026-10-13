import { Species, type SpeciesId } from '../entities/species';
import type { BrushToolId, Command } from '../sim/commands';
import type { PowerId } from './disasters';

export type TabId = 'terreno' | 'naturaleza' | 'animales' | 'razas' | 'monstruos' | 'desastres' | 'poderes';

export interface TabDef {
  readonly id: TabId;
  readonly label: string;
}

export const TABS: readonly TabDef[] = [
  { id: 'terreno', label: 'Terreno' },
  { id: 'naturaleza', label: 'Naturaleza' },
  { id: 'animales', label: 'Animales' },
  { id: 'razas', label: 'Razas' },
  { id: 'monstruos', label: 'Monstruos' },
  { id: 'desastres', label: 'Desastres' },
  { id: 'poderes', label: 'Poderes' },
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
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly tab: TabId;
      readonly kind: 'power';
      readonly power: PowerId;
      /** Repetición mientras se mantiene pulsado (ms). */
      readonly repeatMs?: number;
      /** true: se aplica a lo largo del trazo, como un pincel. */
      readonly continuous?: boolean;
    }
  | { readonly id: string; readonly label: string; readonly tab: TabId; readonly kind: 'magnet' };

const power = (tab: TabId, id: PowerId, label: string, repeatMs?: number, continuous = false): ToolDef => ({ id, label, tab, kind: 'power', power: id, repeatMs, continuous });

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
  brush('naturaleza', 'snow', 'Nieve'),
  brush('naturaleza', 'swamp', 'Pantano'),
  brush('naturaleza', 'jungle', 'Selva'),
  brush('naturaleza', 'savanna', 'Sabana'),
  brush('naturaleza', 'grove', 'Arboleda mágica'),
  brush('naturaleza', 'blight', 'Yermo maldito'),
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
  { id: 'penante', label: 'Penante', tab: 'monstruos', kind: 'spawn', species: Species.PENANTE, repeatMs: SPAWN_REPEAT_MS },
  { id: 'escorio', label: 'Escorio', tab: 'monstruos', kind: 'spawn', species: Species.ESCORIO, repeatMs: SPAWN_REPEAT_MS },
  { id: 'cenagoso', label: 'Cenagoso', tab: 'monstruos', kind: 'spawn', species: Species.CENAGOSO, repeatMs: SPAWN_REPEAT_MS },
  power('desastres', 'lightning', 'Rayo', 250),
  power('desastres', 'meteor', 'Meteorito', 700),
  power('desastres', 'bomb', 'Bomba', 400),
  power('desastres', 'earthquake', 'Terremoto'),
  power('desastres', 'tornado', 'Tornado'),
  power('desastres', 'acid-rain', 'Lluvia ácida'),
  power('desastres', 'volcano', 'Volcán'),
  power('desastres', 'fire', 'Fuego', 150, true),
  power('desastres', 'lava', 'Lava', 150, true),
  power('desastres', 'plague', 'Plaga', 300, true),
  power('poderes', 'bless', 'Bendición', 300, true),
  power('poderes', 'curse', 'Maldición', 300, true),
  power('poderes', 'madness', 'Locura', 300, true),
  power('poderes', 'heal', 'Luz divina', 300, true),
  { id: 'magnet', label: 'Imán', tab: 'poderes', kind: 'magnet' },
];

export function toolById(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function commandFor(tool: ToolDef, x: number, y: number, size: number): Command {
  if (tool.kind === 'brush') return { type: 'brush', tool: tool.brush, x, y, size };
  if (tool.kind === 'spawn') return { type: 'spawn', species: tool.species, x, y, size };
  if (tool.kind === 'power') return { type: 'power', power: tool.power, x, y, size };
  return { type: 'grab', x, y, size };
}
