# MiniBox

Simulador de dios 2D por píxeles para el navegador, jugable en PC y en celular. Crea un mundo a partir de una semilla, pinta el terreno, siembra bosques y suelta animales para ver cómo el ecosistema se equilibra (o se desmorona).

**Jugar:** https://minibox-seven.vercel.app/ (PC y celular; se puede instalar como app)

> Proyecto original inspirado en el género «god game». No usa nombres, sprites, sonidos ni otros recursos de otros juegos.

## Estado

- **Fase A (MVP)** — mundo generado por ruido, pintar terreno y biomas, ovejas, conejos y lobos que comen, cazan, huyen, se reproducen y envejecen, control del tiempo (pausa, x1, x2, x5), controles de ratón, teclado y táctiles, PWA instalable.
- **Fase B (aldeas)** — cuatro razas (Humanos, Silvanos, Petrinos, Colmilludos) que fundan aldeas, reparten oficios, recogen comida, madera, piedra, hierro y oro, construyen y mejoran edificios, amplían su territorio y envían colonos. Búsqueda de caminos A*.
- **Fase C (reinos)** — reinos con capital, rey y personalidad; opinión entre reinos, guerras con ejércitos de guerreros (armas de hierro), conquista de aldeas, alianzas defensivas, treguas, rebeliones, sucesión y caída de reinos. Poderes de dios para forzar guerra, paz, alianza o rebelión, y crónica del mundo.
- **Fase D (desastres)** — rayo, meteorito, bomba, terremoto, tornado, lluvia ácida, volcán, fuego que se propaga y quema edificios, lava que fluye y se enfría en roca, plaga contagiosa con inmunidad; bendición, maldición, locura, luz divina e imán divino; leyes del mundo; partículas y sacudida de cámara.
- **Fase E (rasgos y partidas)** — 21 rasgos (fuerza, aguante, longevidad, fertilidad, apetito, trabajo, curación, inmunidad…) que se heredan y mutan, más Veterano y Superviviente que se ganan; inspector con rasgos, hijos, bajas y estadísticas efectivas; guardar y cargar en IndexedDB (5 ranuras + autoguardado), «Continuar» al abrir, exportar e importar archivo `.minibox`; ajustes (autoguardado, nombres, territorios).
- **Fase F (mar)** — las aldeas costeras construyen muelles; los pescadores traen pescado (los peces se reponen solos); los barcos llevan colonos a fundar aldeas en otras islas (del mismo reino) y, en guerra, flotas de guerreros que desembarcan junto a la aldea enemiga. Rayos, meteoritos, bombas y tornados hunden barcos (el pasaje se ahoga). Inspector y cámara que sigue a un barco. Las partidas de la Fase E se migran solas al cargarlas.
- **Fase G (biomas y estaciones)** — seis biomas nuevos: tundra nevada, pantano, selva y sabana (generados por calor, humedad y altitud) y dos mágicos que pinta el jugador: la arboleda mágica (cura y se extiende) y el yermo maldito (hiere, marchita las plantas y se extiende). Cada bioma cambia la velocidad al caminar, el hambre y las cosechas. Cuatro estaciones con su color en el mapa (nieve en invierno, ocres en otoño): en invierno no crecen las cosechas y la hierba apenas vuelve. Eras de unos 40 años (abundancia, glacial, de hierro, de la concordia, arcana…) que cambian la naturaleza o la diplomacia; el jugador puede imponer una desde Leyes del mundo.
- **Renovación visual** — todo el pixel art rehecho y generado por código: criaturas con silueta propia por raza (humanos, silvanos de orejas puntiagudas, petrinos barbudos con casco, colmilludos con colmillos), ropa del color de su reino, la herramienta de su oficio en la mano y animaciones de caminar, trabajar, luchar y comer; animales nuevos; edificios con arquitectura de cada raza y bandera del reino; granjas con surcos y cultivos; árboles propios de cada bioma que cambian con la estación, arbustos, rocas, vetas y matas de hierba; llamas animadas, rayos, ondas expansivas, tornados y partículas al talar, picar, luchar o tener crías; iconos nuevos de 16×16 en el menú.
- **Estaciones largas y más detalle** — cada estación dura 5 años por defecto (se puede elegir 3 meses, 1 año, 5 o 10 años en Leyes del mundo), con inviernos más suaves para que las aldeas aguanten. Relieve con luz y sombra en montañas y colinas, espuma en la orilla, arena mojada, destellos en el agua, nieve que cae en invierno (lluvia en los biomas cálidos), hojas en otoño, pétalos en primavera y placas con el nombre de cada aldea.
- **Fase H (monstruos)** — tres criaturas propias que asaltan las aldeas: los **penantes** (almas en pena que salen del yermo maldito y de los aldeanos malditos al morir; la luz divina los deshace), los **escorios** (bestias de roca y lava que nacen de la lava al enfriarse, prenden lo que golpean y acaban convertidos en roca) y los **cenagosos** (moles de fango que salen solas de los pantanos y atacan en oleadas). Arrasan edificios, los guerreros defienden la aldea aunque haya paz, la aldea amenazada recluta milicia y los civiles huyen. Pestaña «Monstruos» para crearlos, ley del mundo «Aparecen monstruos», contador en la barra superior y avisos en la crónica. Las partidas anteriores se migran solas.
- **Fase I (cultura, religión y clanes)** — cada aldea que se funda sola crea una **cultura** con un rasgo propio (laboriosa, belicosa, hospitalaria o erudita) que acumula saber y descubre agricultura, albañilería, forja y medicina; las aldeas conquistadas acaban asimilándose. Las aldeas levantan un **santuario** y adoptan o fundan una **religión** con su precepto (pacífica, celosa o devota): compartir la fe une a aldeas y reinos, y las fes distintas los enfrentan. Cada aldeano pertenece a un **clan** que hereda de su padre; el trono pasa dentro del clan reinante y, si el linaje se extingue, hay cambio de dinastía y las aldeas se inquietan. Todo se ve en el inspector y en la crónica. Las partidas anteriores se migran solas.
- **Fase J (sonido y caminos)** — donde los aldeanos pasan a menudo se marca un **sendero** y luego un **camino**, por los que se anda más deprisa (y que la hierba recupera si dejan de usarse); los reinos tienden **calzadas** empedradas hasta sus colonias y el jugador puede pintarlas con el pincel «Calzada». **Sonido** sintetizado con WebAudio, sin archivos de audio: desastres y poderes, trabajo y combate al acercar la cámara, avisos del mundo e interfaz, con volumen y silencio en los ajustes.
- **Fase K (puentes y comercio)** — los **puentes** de madera cruzan ríos y estrechos: los reinos los tienden al unir una colonia con su capital y el jugador puede pintarlos con «Puente»; los barcos pasan por debajo. Las aldeas con brazos de sobra nombran **mercaderes** que llevan a pie lo que les sobra a la aldea vecina y vuelven con lo que allí abunda: cada viaje deja oro en las dos y, entre reinos distintos, va borrando viejos agravios.

Ver [DESIGN.md](DESIGN.md) para el diseño completo y las ideas para el futuro.

## Ejecutar en local

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre la URL que muestra la consola. Con `--host` activado también aparece una URL de red local para probar desde el celular en la misma wifi.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Comprueba tipos y genera `dist/` |
| `npm run preview` | Sirve el build de producción |
| `npm test` | Pruebas (Vitest) |
| `npm run coverage` | Pruebas con cobertura de la simulación |
| `npm run lint` | ESLint (incluye reglas de determinismo) |
| `npm run build:itch` | Build + `release/minibox-<versión>-itch.zip` para itch.io |
| `npm run icons` | Regenera los iconos PWA en `public/icons/` |

## Controles

**PC:** clic izquierdo para usar la herramienta · clic derecho/central o espacio + arrastrar para mover · rueda para zoom · `Espacio` pausa · `1` `2` `3` velocidad · `[` `]` pincel · `Q` `E` pestañas · `I` inspeccionar · `M` mover · `F` pantalla completa · `P` rendimiento · `Esc` cerrar.

**Celular:** un dedo usa la herramienta (tras un instante, para no pintar sin querer) · dos dedos para pellizcar y mover · botón «Mover» para desplazar con un dedo · «Inspeccionar» + tocar para ver datos.

## Arquitectura

```
src/
  core/      RNG con semilla, reloj de paso fijo, calendario, perfil de dispositivo
  world/     mapa en arrays tipados, generador por ruido, vegetación por chunks
  entities/  especies, almacén de criaturas (SoA), spatial hash
  ai/        ciclo de vida, comportamiento de animales y monstruos, movimiento y A*
  civ/       aldeas, edificios, oficios, planificador, aldeanos, reinos, culturas, religiones y clanes
  sim/       Simulation (núcleo determinista), comandos del jugador y leyes del mundo
  persistence/ formato de partida (MBX1 + gzip) e IndexedDB
  powers/    pinceles, herramientas, trazos, desastres, fuego/lava y estados
  render/    cámara, capa de terreno, sprites generados por código, renderer Canvas 2D
  input/     reconocedor de gestos, Pointer Events, teclado
  ui/        barra superior, barra de herramientas, inspector, menús
  audio/     efectos de sonido sintetizados con WebAudio
```

La simulación no depende de la interfaz y es determinista: la misma semilla y los mismos comandos producen exactamente el mismo mundo (hay una prueba que lo verifica con un hash del estado). Una partida guardada y cargada tiene el mismo hash y continúa de forma idéntica.

## Despliegue

- **Vercel:** importa el repositorio en vercel.com; `vercel.json` ya define `npm run build` y la carpeta `dist`. Cada push a `main` se despliega solo.
- **itch.io:** `npm run build:itch` y sube el `.zip` como juego HTML. Configuración recomendada: «This file will be played in the browser», viewport 960×600, *Mobile friendly* activado, *Fullscreen button* activado, *Automatically start on page load* activado.
