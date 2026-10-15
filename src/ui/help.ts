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
  ['Razas', 'Humanos (se expanden rápido), silvanos (longevos, buenos en el bosque), petrinos (mineros y constructores), colmilludos (fuertes y prolíficos) y escamados (grandes pescadores; el barro no los frena y no enferman de plaga)'],
  ['Recursos', 'Recolectores, leñadores, mineros, granjeros y cazadores llevan comida, madera, piedra, hierro y oro al almacén'],
  ['Crecer', 'Con casas libres y comida nacen niños; la aldea construye, mejora el ayuntamiento y amplía su territorio'],
  ['Colonos', 'Las aldeas grandes envían colonos que fundan nuevas aldeas'],
  ['Inspeccionar', 'Toca un edificio para ver su aldea, o un aldeano para ver su oficio'],
  ['Reinos', 'Cada aldea fundada es un reino; sus colonias le pertenecen. El rey y su carácter deciden guerras y alianzas'],
  ['Guerras', 'Los guerreros conquistan aldeas enemigas sin defensores; las conquistadas pueden rebelarse con el tiempo'],
  ['Poderes', 'En la ficha de una aldea puedes forzar guerra, paz, alianza o una rebelión'],
  ['Desastres', 'Rayo, meteorito, bomba, terremoto, tornado, lluvia ácida, volcán, maremoto (sólo en la costa), ventisca (deja nieve), langostas (se comen las cosechas), fuego, lava y plaga'],
  ['Poderes de la naturaleza', 'La lluvia fértil reverdece, hace brotar árboles y adelanta las cosechas; la ofrenda llena los almacenes de las aldeas que toques; la fertilidad sacia a las criaturas y las deja listas para criar; la paz divina hace que los reinos de las aldeas tocadas firmen la paz'],
  ['Imán', 'Mantén pulsado sobre criaturas para cogerlas, arrastra y suelta para dejarlas en otro sitio'],
  ['Leyes', 'En el menú puedes desactivar el hambre, la vejez, las guerras, las rebeliones, las plantas o el fuego'],
  ['Rasgos', 'Cada criatura puede tener rasgos (Fuerte, Longevo, Fértil…) que hereda de sus padres; Veterano y Superviviente se ganan'],
  ['Biomas', 'Pinta nieve, pantano, selva, sabana, arboleda mágica (cura y se extiende) o yermo maldito (hiere y marchita) desde Naturaleza'],
  ['Estaciones y eras', 'En invierno no crecen las cosechas y la hierba apenas vuelve; cada unos 40 años empieza una era nueva. En Leyes puedes imponer una'],
  ['Monstruos', 'Los penantes salen del yermo maldito y de los muertos malditos (la luz divina los deshace), los escorios nacen de la lava y los cenagosos, de los pantanos. Asaltan las aldeas y los guerreros las defienden; se desactivan en Leyes'],
  ['Cultura', 'Cada aldea que se funda sola crea una cultura con un rasgo propio; con el tiempo descubre agricultura, albañilería, forja y medicina. Las aldeas conquistadas acaban adoptando la de su nuevo reino'],
  ['Religión', 'Las aldeas con ayuntamiento levantan un santuario y adoptan o fundan una fe. Compartirla une a aldeas y reinos; las fes distintas los enfrentan'],
  ['Clanes', 'Cada aldeano pertenece a un clan que hereda de su padre. El trono pasa dentro del clan reinante; si el linaje se extingue hay cambio de dinastía y las aldeas se inquietan'],
  ['Caminos', 'Donde los aldeanos pasan a menudo se marca un sendero y luego un camino, por los que se anda más deprisa; los reinos tienden calzadas hasta sus colonias y tú puedes pintarlas con «Calzada» (Terreno)'],
  ['Puentes', 'Cruzan ríos y estrechos (no el abismo): los reinos los tienden hacia sus colonias y tú puedes pintarlos con «Puente» (Terreno). Unen islas para aldeanos, ejércitos y mercaderes'],
  ['Comercio', 'Las aldeas con gente de sobra tienen mercaderes que llevan excedentes a la aldea vecina y traen lo que allí abunda; da oro a las dos y reconcilia a los reinos'],
  ['Sonido','Menú › Ajustes: activa o silencia el sonido y elige el volumen'],
  ['Mar','Las aldeas de la costa construyen un muelle: allí pescan y botan barcos que llevan colonos a otras islas o ejércitos a costas enemigas'],
  ['Partidas', 'Menú › Guardar / cargar: 5 ranuras, autoguardado y exportar o importar un archivo .minibox'],
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
