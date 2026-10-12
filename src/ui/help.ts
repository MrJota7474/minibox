import { el } from './dom';

const PC_CONTROLS: readonly (readonly [string, string])[] = [
  ['Clic izquierdo', 'Usar la herramienta (mantener y arrastrar para pintar)'],
  ['Clic derecho / central + arrastrar', 'Mover el mapa'],
  ['Espacio + arrastrar', 'Mover el mapa'],
  ['Rueda', 'Zoom'],
  ['Espacio', 'Pausa / continuar'],
  ['1 · 2 · 3', 'Velocidad x1 · x2 · x5'],
  ['[ y ]', 'Tamaño del pincel'],
  ['Q y E', 'Pestaña anterior / siguiente'],
  ['I · M', 'Inspeccionar · modo mover'],
  ['Flechas', 'Mover el mapa'],
  ['F · P · Esc', 'Pantalla completa · rendimiento · cerrar'],
];

const TOUCH_CONTROLS: readonly (readonly [string, string])[] = [
  ['Tocar / arrastrar un dedo', 'Usar la herramienta'],
  ['Dos dedos', 'Pellizcar para zoom y arrastrar para mover'],
  ['Botón «Mover»', 'Con un dedo mueves el mapa sin pintar'],
  ['«Inspeccionar» + tocar', 'Ver datos de una criatura o casilla'],
  ['Flecha de la barra', 'Plegar o desplegar las herramientas'],
];

const VILLAGE_TIPS: readonly (readonly [string, string])[] = [
  ['Fundar una aldea', 'Suelta al menos 3 aldeanos de la misma raza juntos (pincel 5 o más) en tierra libre'],
  ['Recursos', 'Recolectores, leñadores, mineros, granjeros y cazadores llevan comida, madera, piedra, hierro y oro al almacén'],
  ['Crecer', 'Con casas libres y comida nacen niños; la aldea construye, mejora el ayuntamiento y amplía su territorio'],
  ['Colonos', 'Las aldeas grandes envían colonos que fundan nuevas aldeas'],
  ['Inspeccionar', 'Toca un edificio para ver su aldea, o un aldeano para ver su oficio'],
];

function table(rows: readonly (readonly [string, string])[]): HTMLElement {
  return el('dl', { class: 'help-list' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

export function helpContent(): HTMLElement {
  return el('div', { class: 'help' }, [
    el('h3', { text: 'En PC' }),
    table(PC_CONTROLS),
    el('h3', { text: 'En el celular' }),
    table(TOUCH_CONTROLS),
    el('h3', { text: 'Aldeas' }),
    table(VILLAGE_TIPS),
  ]);
}
