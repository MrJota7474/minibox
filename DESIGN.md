# DESIGN.md — MiniBox

Simulador de dios 2D por píxeles para navegador (PC y móvil), inspirado en la *sensación* de WorldBox – God Simulator, con nombre, arte, sonido y contenido propios.

> Estado: diseño aprobado. **Fases A (MVP), B (razas y aldeas), C (reinos y guerras), D (desastres y poderes), E (rasgos y partidas guardadas), F (mar: muelles, pesca y barcos), G (biomas, estaciones y eras), H (monstruos), I (cultura, religión y clanes), J (sonido y caminos) y K (puentes y comercio) implementadas.**
>
> La hoja de ruta acordada está completa. Los muelles, la pesca y los barcos llegaron en la Fase F; los biomas nuevos, las estaciones y las eras, en la G; los monstruos, en la H.

---

## 0. Identidad propia (qué NO copiamos)

| WorldBox | MiniBox |
|---|---|
| Nombre, logo, sprites, sonidos, UI | Todo original. Sprites generados por código desde paletas propias. |
| Humanos, orcos, elfos, enanos | 4 razas propias con el mismo *rol* jugable (ver §4): **Humanos**, **Silvanos** (bosque), **Petrinos** (montaña), **Colmilludos** (guerreros). |
| Criaturas icónicas (Crabzilla, «cold ones», tumores, UFO…) | No se usan. Criaturas y monstruos propios. |
| Nombres de poderes y biomas exclusivos (candy, lemon, etc.) | Nombres genéricos en español o inventados. |

Nombre elegido por el usuario: **MiniBox** (antes de publicar en tiendas, conviene comprobar que no choque con otra marca).

Identidad visual: pixel art de 1 píxel = 1 casilla, paleta cálida y saturada, contorno oscuro de 1 px en criaturas, interfaz con aspecto de «pergamino/piedra» en tonos tierra. Icono: un ojo/sol pixelado sobre una isla.

---

## 1. Resumen de la investigación sobre WorldBox

Fuentes: Wikipedia, la página de Steam, la ficha de App Store (notas de versión hasta 0.51.x) y la wiki comunitaria (fandom/worldbox.wiki). La wiki fandom bloqueó la descarga directa (HTTP 402), así que algunos detalles vienen de los extractos del buscador y de mi conocimiento del juego. Los valores numéricos exactos de WorldBox **no** se copian: solo sirven de referencia para el equilibrio.

### 1.1 Mundo
- Mapa de casillas (1 casilla = 1 píxel visible), generado por procedimiento con tamaños configurables.
- Gradiente de altura por capas: océano profundo → océano → aguas poco profundas → arena → tierra baja → tierra alta → colinas → montañas → cumbres. La lava es una capa especial que se enfría y se convierte en roca.
- Los biomas son una «capa de cubierta» sobre la tierra (pradera, sabana, selva, pantano, desierto, nieve/permafrost, bosque encantado, corrupto, etc.). Se propagan con «semillas» que se arrojan.
- Vegetación (árboles, arbustos, bayas) que crece sola según el bioma. El fuego se propaga por la hierba y los árboles.
- Recursos en el mapa: árboles (madera), rocas (piedra), vetas de mineral (hierro, oro…), bayas, peces.
- **Eras/estaciones** (0.21+): cambian el crecimiento de biomas y criaturas.

### 1.2 Herramientas de dios (pestañas)
Mundo · Civilizaciones · Criaturas · Naturaleza y desastres · Destrucción · Otros.
- **Terreno**: pintar agua/arena/tierra/colinas/montañas, subir/bajar altura (pala), esponja (quitar agua), borrador. Varios tamaños y formas de pincel.
- **Vida**: crear unidades de cada raza o animal; semillas de bioma; árboles.
- **Desastres**: rayo, meteorito, tornado, terremoto, lluvia ácida, fuego, lava, volcán, plaga, bombas.
- **«Gotas»** (drops): bendición, maldición, locura, plaga, etc. Caen sobre las unidades y les ponen rasgos o estados.
- **Otros**: inspeccionar, imán divino (recoger y soltar unidades), dedo divino (empujar), luz divina (cura), forzar guerra/paz/alianza/rebelión, editar el estandarte del reino.
- **Leyes del mundo**: interruptores globales (hambre, vejez, rebeliones, diplomacia, crecimiento de la vegetación…).
- En PC todos los poderes son gratuitos. En móvil, algunos son premium (no aplica aquí).

### 1.3 Criaturas y razas
- Animales con necesidades: buscan comida, se reproducen, envejecen y mueren. Hay depredadores y presas.
- Razas civilizadas (4 originales, más especies «despertadas» en las versiones nuevas). Cada una tiene rasgos raciales, bioma preferido y estética propia.
- Reproducción: hace falta un mínimo de hambre (≈50 %), adultez y capacidad de vivienda en las ciudades.
- Envejecimiento: la esperanza de vida es una tendencia, no un límite rígido. Los menores de edad hacen la mitad de daño.

### 1.4 Civilizaciones
- Un grupo de unidades civilizadas funda una aldea (hoguera → ayuntamiento) y reclama **zonas** (bloques de casillas).
- **Trabajos**: constructor, recolector, leñador, minero, granjero, pescador, cazador, herrero, guerrero, colono. Se asignan según las necesidades de la aldea. El guerrero se asigna al final.
- **Edificios**: ayuntamiento (por niveles), casas (por niveles), almacén, molino/campos, mina, muelle, cuartel, torre de vigía, templo y caminos.
- **Recursos**: madera, piedra, mineral/hierro, oro y comida (bayas, trigo, pan, pescado, carne). Las mejoras consumen recursos crecientes.
- **Expansión**: los colonos fundan aldeas nuevas, también por mar con barcos.

### 1.5 Reinos, diplomacia y guerra
- Cada reino tiene **rey**, capital y aldeas con **líderes**. Cada aldea tiene un **capitán** y un ejército. Las versiones nuevas añaden **clanes** (linajes) que afectan a la lealtad y la sucesión.
- **Opinión entre reinos**: depende de la diplomacia del rey, el contacto de fronteras (restan), la distancia (suma), la raza, el historial de guerras y los tratados.
- **Guerra**: el rey la declara, puede haber varios bandos y un reino puede luchar varias guerras a la vez. Los ejércitos van a las aldeas enemigas y las **capturan** por presencia.
- **Alianzas**: requieren renombre y paz. Los aliados se defienden entre sí.
- **Rebeliones**: las aldeas con poca lealtad se independizan y empiezan una guerra con su reino. Si no hay sucesor, el reino se fractura.
- **Cultura, idioma y religión** (0.50 «Monolith»): metaobjetos con rasgos propios. La cultura desbloquea tecnología (por ejemplo, la fabricación de armas).

### 1.6 Simulación de cada unidad
- Estadísticas: vida, daño, armadura, velocidad, velocidad de ataque, crítico, edad/esperanza de vida, hambre, felicidad (−100..100), nivel/experiencia, muertes, renombre y estadísticas civiles (diplomacia, guerra, administración, inteligencia).
- Hambre: sin comida pierde el 5 % de la vida máxima por intervalo (estado «hambriento»).
- **Rasgos** por grupos (espíritu, mente, adquiridos, especiales). Ejemplos de efectos: bendecido (+stats), maldito (−stats, se levanta como esqueleto), afortunado/desafortunado, locura (hostil), plaga (contagio). Los rasgos se heredan o se ganan por eventos.
- La personalidad de reyes y líderes influye en la diplomacia (agresivo, pacífico, codicioso…).

### 1.7 Interfaz
- Barra de poderes **inferior** con pestañas y botones en desplazamiento horizontal. Selector de tamaño de pincel.
- Parte superior: control de tiempo (pausa y velocidades), año del mundo y contadores.
- **Inspector**: ventana de unidad (retrato, stats, rasgos, reino, aldea, familia), de aldea y de reino. Opción de «seguir unidad» con la cámara.
- Capas de mapa: zonas de reinos y de aldeas.
- Móvil: misma estructura, con tamaño de barra configurable, pellizco para hacer zoom y arrastre para mover. Tiene orientación automática, bloqueo de FPS y autoguardado.

---

## 2. Pilares de diseño de MiniBox

1. **Mirar es jugar**: el mundo debe estar vivo aunque el jugador no haga nada.
2. **Causa → efecto visible**: cada poder produce una reacción clara e inmediata.
3. **Pocas mecánicas, bien cerradas**: ninguna función queda a medias.
4. **Táctil de primera clase**: todo se puede hacer con un dedo; dos dedos son para la cámara.
5. **Reproducible**: misma semilla y mismas acciones dan el mismo mundo.

---

## 3. Mecánicas por prioridad

Leyenda: **N** = Núcleo (sin esto no hay juego) · **I** = Importante (da profundidad) · **E** = Extra (pulido o expansión). La columna «Fase» indica cuándo se construye.

### 3.1 Mundo

| Mecánica | Prioridad | Fase |
|---|---|---|
| Generación por ruido (simplex/fBm) con semilla: altura → capas de terreno | N | A |
| Capas: océano profundo, océano, aguas someras, arena, tierra baja/alta, colinas, montaña, cumbre | N | A |
| 3 biomas base sobre la tierra (pradera, bosque, desierto) asignados por humedad y temperatura | N | A |
| Vegetación: árboles y arbustos de bayas que crecen y se regeneran | N | A |
| Más biomas (nieve, pantano, selva, sabana) | I | G |
| Biomas mágicos (arboleda mágica, yermo maldito) con efectos sobre las unidades | E | G |
| Recursos minables: rocas, vetas de hierro y oro | I | B |
| Peces en el agua | I | B |
| Fuego que se propaga, lava que se enfría | I | D |
| Eras/estaciones globales | E | G |
| Tamaños de mapa: Pequeño 192², Mediano 256², Grande 384², Enorme 512² (solo PC) | N | A |

### 3.2 Herramientas de dios

| Herramienta | Prioridad | Fase |
|---|---|---|
| Pintar terreno: agua, arena, tierra, colina, montaña | N | A |
| Subir/bajar altura (pala), esponja, borrador | N | A |
| Pincel: tamaño 1/3/5/9/15 y forma circular/cuadrada | N | A |
| Crear animales (ovejas, conejos, lobos) | N | A |
| Inspeccionar (tocar una unidad o casilla) | N | A (básico) / E (completo) |
| Semillas de bioma, plantar árboles | I | A |
| Crear unidades de cada raza | N | B |
| Imán divino (recoger y soltar) | I | D |
| Rayo, meteorito, terremoto, lava, plaga | N | D |
| Tornado, lluvia ácida, fuego, volcán, bomba | I | D |
| Bendición, maldición, locura, luz divina (curación) | I | D |
| Forzar guerra, paz, alianza o rebelión | I | C |
| Leyes del mundo (interruptores) | I | D |
| Editor de estandartes | E | post-E |

### 3.3 Criaturas

| Mecánica | Prioridad | Fase |
|---|---|---|
| Moverse por casillas transitables (no agua profunda, no cumbres) | N | A |
| Hambre: comer hierba o bayas (herbívoros) o cazar (carnívoros) | N | A |
| Reproducción con requisitos (adulto, hambre ≥ 50 %, pareja cerca, límite de población) | N | A |
| Envejecimiento y muerte por vejez o inanición | N | A |
| Combate básico (depredador contra presa) | N | A |
| Huida de los depredadores | I | A |
| Monstruos propios (penantes, escorios, cenagosos) | E | H |

### 3.4 Civilizaciones

| Mecánica | Prioridad | Fase |
|---|---|---|
| 4 razas con stats, bioma preferido y paleta propia | N | B |
| Fundación de aldea (hoguera) y zonas de 8×8 casillas | N | B |
| Trabajos: recolector, leñador, minero, constructor, granjero, guerrero | N | B |
| Recursos: comida, madera, piedra, hierro, oro (almacén por aldea) | N | B |
| Edificios: ayuntamiento (3 niveles), casa (3 niveles), almacén, campos, mina, cuartel | N | B |
| Vivienda → límite de población → nacimientos | N | B |
| Crecimiento territorial (comprar o reclamar zonas vecinas) | N | B |
| Colonos que fundan aldeas nuevas | I | B |
| Pescador, cazador, herrero (equipo que sube el daño y la armadura) | I | B/C |
| Muelles y barcos para colonizar islas | I | F |
| Caminos | E | J |
| Cultura con rasgos y tecnología, religión (sin idiomas) | E | I |

### 3.5 Reinos

| Mecánica | Prioridad | Fase |
|---|---|---|
| Reino = conjunto de aldeas, con capital, rey, color y estandarte generado | N | C |
| Líder por aldea y lealtad de la aldea al reino | N | C |
| Opinión entre reinos (fronteras, raza, personalidad del rey, guerras pasadas, tratados) | N | C |
| Declaración de guerra y paz (cansancio de guerra, tiempo, pérdidas) | N | C |
| Ejércitos con capitán que atacan aldeas | N | C |
| Captura de aldeas por presencia | N | C |
| Alianzas defensivas | I | C |
| Rebeliones por baja lealtad | I | C |
| Sucesión del rey (heredero o fractura) | I | C |
| Clanes y sucesión dinástica | E | I |

### 3.6 Unidades, rasgos e inspector

| Mecánica | Prioridad | Fase |
|---|---|---|
| Stats: vida, daño, armadura, velocidad, edad, hambre, felicidad, nivel/XP, muertes | N | A (subconjunto) / E |
| Rasgos (≈20 al inicio) heredables, con modificadores de stats | I | E |
| Personalidad del rey (agresivo, pacífico, codicioso, sabio) que afecta a la diplomacia | I | C |
| Nombres generados por raza (sílabas propias) | I | B |
| Inspector de unidad, aldea y reino; seguir unidad | I | E (básico en A) |
| Historial y crónica del mundo («El reino X declaró la guerra a Y») | E | C/E |

### 3.7 Sistema y meta

| Mecánica | Prioridad | Fase |
|---|---|---|
| Tiempo: pausa, x1, x2, x5 | N | A |
| Cámara: zoom y desplazamiento, con límites | N | A |
| Guardar y cargar mundos (IndexedDB), autoguardado | I | E |
| Exportar/importar un mundo como archivo | E | E |
| PWA instalable y pantalla completa | N | A |
| Ajuste automático según el dispositivo (tamaño de mapa y límite de unidades) | N | A |
| Ajustes: calidad, tamaño de la barra, idioma (solo español por ahora) | I | A/E |
| Sonido (efectos sintetizados con WebAudio) | E | J |

---

## 4. Contenido inicial

### Razas
| Raza | Rol | Bioma preferido | Rasgo racial |
|---|---|---|---|
| Humanos | Equilibrados, se expanden rápido | Pradera | +fertilidad |
| Silvanos | Longevos, arqueros, poca natalidad | Bosque | +esperanza de vida, +velocidad |
| Petrinos | Mineros y constructores resistentes | Colinas y montaña | +armadura, minan más rápido |
| Colmilludos | Agresivos y fuertes | Desierto y sabana | +daño, opinión base hostil |

### Animales (Fase A)
Oveja y conejo (herbívoros), lobo (carnívoro). Más adelante: vaca, oso, peces y aves.

### Calendario
Con el tick fijo de 10 Hz a x1: **1 mes = 5 s** y **1 año = 60 s** de tiempo real. Vida de referencia: animales 5–15 años, razas 60–200 años.

---

## 5. Arquitectura técnica

### 5.1 Pila
- **TypeScript (strict) + Vite**. Sin framework de UI: overlay DOM con TypeScript plano y CSS (botones reales, accesibles y fáciles de adaptar).
- **Render: Canvas 2D** detrás de una interfaz `Renderer`. El terreno es una textura de 1 px por casilla escalada con `imageSmoothingEnabled = false`, así que el coste no depende del número de casillas visibles. Si con miles de unidades el Canvas 2D no llega a 30 FPS en móvil, se cambia solo el módulo de render a **PixiJS/WebGL**.
- **Pruebas**: Vitest (simulación, determinismo, IA) y Playwright (e2e con emulación de móvil).
- **PWA**: `vite-plugin-pwa` (manifest, iconos generados y service worker). El registro está protegido para que no falle dentro del iframe de itch.io.
- **Persistencia**: IndexedDB con un envoltorio mínimo propio y compresión `CompressionStream('gzip')`. `localStorage` solo para ajustes.

### 5.2 Módulos
```
src/
  core/        bucle principal, reloj de ticks, RNG con semilla, bus de eventos, perfil del dispositivo
  world/       Grid (arrays tipados), generador por ruido, terreno, biomas, vegetación, chunks
  entities/    almacén de unidades (SoA + ids generacionales), especies y razas, rasgos
  ai/          comportamiento (máquina de estados + utilidad), búsqueda de caminos, percepción
  civ/         aldeas, edificios, trabajos, recursos (Fase B)
  kingdoms/    reinos, opinión, guerra, alianzas, rebeliones (Fase C)
  powers/      herramientas de dios como comandos (pintar, crear, desastres…)
  render/      cámara, terreno por chunks, sprites, overlays, atlas generado por código
  input/       Pointer Events unificados, gestos (pellizco, pan), teclado, mapeo a comandos
  ui/          barra de herramientas, control de tiempo, inspector, menús, ajustes
  persistence/ serialización binaria, IndexedDB, exportación e importación
  sim/         Simulation: une world + entities + ai + civ + kingdoms; solo depende de core
```
**Regla de dependencias**: `sim/world/entities/ai/civ/kingdoms` **no importan** nada de `render/input/ui`. La simulación se puede ejecutar en Node para pruebas (y más adelante en un Web Worker).

### 5.3 Bucle y tiempo
- **Tick fijo de simulación a 10 Hz** a velocidad x1. Las velocidades x2 y x5 ejecutan 2 o 5 ticks por cada 100 ms reales. El render va a la frecuencia de la pantalla e interpola posiciones.
- Si un frame se atrasa, el acumulador se limita (máximo de ticks por frame) y el juego **se ralentiza** en vez de saltarse ticks. Así el resultado no depende de los FPS.
- Las tareas caras se escalonan: cada unidad «piensa» cada N ticks según `id % N`, la vegetación se actualiza por chunks rotativos y las aldeas cada 10 ticks.

### 5.4 Determinismo
- RNG propio (**sfc32**) con semilla. Un flujo por subsistema derivado de la semilla del mundo. **Prohibido** `Math.random`, `Date.now` y `performance.now` dentro de `sim/`.
- Sin `Math.sin`, `cos` ni `pow` en la simulación (pueden variar entre motores JS): solo aritmética básica, enteros, tablas precalculadas y distancias al cuadrado.
- Iteración en orden estable (arrays por índice; nunca `Set`/`Map` con claves objeto para decidir el orden).
- Las acciones del jugador son **comandos con número de tick** (`{tick, tipo, params}`) y se pueden grabar para repetir una partida.
- Prueba automática: misma semilla + misma lista de comandos → mismo **hash del estado** tras 10 000 ticks.

### 5.5 Datos y rendimiento
- **Mundo** en arrays tipados planos: `height: Uint8Array`, `terrain: Uint8Array`, `biome: Uint8Array`, `flora: Uint8Array`, `zone: Uint16Array`, etc. Índice `y * W + x`.
- **Chunks de 32×32**: cada uno tiene una bandera de «sucio». Al pintar solo se vuelve a subir a la textura la porción afectada (`putImageData` parcial).
- **Unidades en SoA** (Structure of Arrays): `x, y: Float32Array`, `hp, hunger, age: Uint16Array`… Hay una lista libre para reutilizar huecos y un id generacional para evitar referencias colgantes.
- **Spatial hash** de celdas de 8×8 casillas con listas enlazadas en `Int32Array`, para buscar en O(vecinos) presas, parejas, enemigos y objetivos de poderes.
- **Búsqueda de caminos**: movimiento local voraz con desvío para distancias cortas. Para distancias largas, A* sobre la grilla con presupuesto de nodos por tick y cola de peticiones. Las **islas** se etiquetan por relleno (flood fill) para descartar al instante destinos imposibles. Las rutas se invalidan cuando cambia el terreno.
- **Renderizar solo lo visible**: recorte por cámara de chunks y unidades. Con zoom muy alejado, las unidades se dibujan como puntos de 1 px con `fillRect` por lotes.
- **Atlas de sprites** generado por código al arrancar: plantillas de 5×7 px por especie, recoloreadas por raza o reino, con varios cuadros de animación.

### 5.6 Perfil de dispositivo (ajuste automático)
Al arrancar se clasifica el dispositivo con `hardwareConcurrency`, `deviceMemory`, el tamaño de pantalla, el tipo de puntero y una micro-prueba de 200 ms. En partida, un monitor de FPS puede bajar el nivel.

| Nivel | Mapa por defecto | Límite de unidades | Ejemplo |
|---|---|---|---|
| Bajo | 192² | 400 | Android gama baja |
| Medio | 256² | 800 | Android gama media (objetivo ≥ 30 FPS) |
| Alto | 384² | 2000 | Portátil Ryzen 7, gráficos integrados |
| Ultra | 512² | 4000 | Escritorio |

El jugador puede cambiar el tamaño del mapa en «Nuevo mundo». El límite de unidades se muestra en los ajustes.

### 5.7 Entrada (sin conflictos entre pintar y mover)
Pointer Events unificados (`touch-action: none` en el canvas):

**PC**
- Clic izquierdo (y arrastrar): usar la herramienta.
- Clic derecho o central + arrastrar: mover el mapa. También espacio + arrastrar.
- Rueda: zoom hacia el cursor.
- Atajos: `Espacio` pausa · `1` `2` `3` velocidad x1/x2/x5 · `[` `]` tamaño de pincel · `Q/E` pestaña anterior/siguiente · `I` inspeccionar · `Esc` cerrar o deseleccionar · `F` pantalla completa.

**Móvil**
- 1 dedo: usar la herramienta. El trazo **espera unos 80 ms o 6 px** antes de pintar. Si en ese tiempo se apoya un segundo dedo, el trazo se cancela y **no se pinta nada**.
- 2 dedos: pellizco para zoom y arrastre para mover. Al levantar, el gesto termina sin pintar.
- Botón **«Mover»** (mano): con él activo, 1 dedo mueve el mapa.
- Sin herramienta seleccionada (o con «Inspeccionar»), 1 dedo arrastrando mueve y un toque inspecciona.
- Pulsación larga sobre una unidad: abrir el inspector.

### 5.8 Interfaz responsive
- **Barra superior**: año y mes, población, botones de tiempo (⏸ x1 x2 x5), menú (☰).
- **Barra inferior plegable**: fila de pestañas (en Fase A: Terreno · Naturaleza · Criaturas; se añaden pestañas cuando hay contenido real) y fila de herramientas con desplazamiento horizontal. Botones de ≥ 44×44 px, con icono pixelado y una etiqueta corta.
- **Pincel**: control flotante para el tamaño junto a la barra.
- **Vertical**: la barra ocupa el ancho completo y se pliega con un tirador. **Horizontal**: la barra es más baja, con una sola fila de herramientas y pestañas en vertical a la izquierda.
- Respeta `env(safe-area-inset-*)`. Hay botón de pantalla completa y `screen.orientation` libre.
- El inspector se abre como **panel lateral** en PC y como **hoja inferior** en móvil.

### 5.9 Despliegue
- Repositorio en GitHub (rama `main`). En Vercel: proyecto importado desde GitHub, `npm run build`, salida `dist`, despliegue automático en cada push.
- `vite.config.ts` con `base: './'` (rutas relativas para Vercel e itch.io).
- `npm run build:itch` → `vite build` + `scripts/build-itch.mjs` (con `archiver`), que genera `release/minibox-<versión>-itch.zip` con `index.html` en la raíz.
- **Configuración recomendada en itch.io**: tipo HTML, «This file will be played in the browser», viewport **960×600**, ✅ *Mobile friendly* (orientación por defecto), ✅ *Fullscreen button*, ✅ *Automatically start on page load*, ❌ *Scrollbars*. Para itch no hace falta SharedArrayBuffer.

### 5.10 Calidad
- TDD en la simulación (`world`, `entities`, `ai`, `civ`, `kingdoms`, `persistence`) con una cobertura objetivo ≥ 80 % en esos módulos.
- Pruebas de determinismo y de rendimiento con un **escenario de estrés** (botón de depuración «+500 unidades» y medición de ms por tick y por frame).
- Revisión de código con agente antes de cada cierre de fase.
- Archivos de 200–400 líneas, sin mutaciones ocultas fuera del estado de la simulación. El estado de la simulación usa arrays tipados mutables **a propósito** por rendimiento; esto queda documentado como excepción explícita a la regla de inmutabilidad.

---

## 6. Plan por fases

Cada fase termina con: build sin errores, consola limpia, prueba en emulación móvil (Pixel 7 / Moto G) y en escritorio, prueba de estrés con muchas unidades, despliegue en Vercel y, si procede, el .zip para itch.

### Fase A — MVP: «Un mundo que respira»
**Entregables**
1. Proyecto Vite + TS, ESLint, Vitest, repositorio de GitHub, Vercel, PWA, script `build:itch`.
2. Generador de mundo con semilla (ruido fBm + máscara de islas) y 3 biomas.
3. Render por chunks, cámara con zoom y desplazamiento, recorte por visibilidad.
4. Herramientas: terreno (5 tipos), subir/bajar, esponja, pincel de 5 tamaños, plantar árboles, crear oveja, conejo o lobo, inspeccionar (básico).
5. Criaturas: caminar, comer, reproducirse, envejecer, cazar o huir, morir.
6. Tiempo: pausa, x1, x2, x5. HUD con año y población.
7. Entrada completa de ratón, táctil y teclado, con el botón «Mover».
8. Perfil de dispositivo y límite de unidades.
9. Pantalla de inicio: «Nuevo mundo» (semilla y tamaño).

**Criterios de aceptación**: 800 animales a ≥ 30 FPS en emulación de Android de gama media y 2000 a 60 FPS en PC. La misma semilla genera el mismo mapa. Pintar con un dedo y hacer pellizco nunca deja trazos accidentales.

### Fase B — Razas, aldeas y recursos
4 razas, fundación de aldeas, zonas, trabajos, recursos, edificios por niveles, vivienda y natalidad, colonos y nombres generados. Inspector de aldea.
**Aceptación**: partiendo de 10 humanos, aparece de forma espontánea una aldea que crece a ≥ 3 edificios y ≥ 30 habitantes en unos 10 min a x5.

### Fase C — Reinos, guerra y diplomacia
Reinos con rey, líderes y lealtad. Opinión, guerras, ejércitos, captura de aldeas, alianzas, rebeliones, sucesión, muelles y barcos. Poderes de forzar guerra, paz o alianza. Capa de mapa de reinos. Crónica de eventos.
**Aceptación**: en un mundo con 2 razas, a x5, ocurre al menos una guerra, una captura y una paz en 20 min sin intervención.

### Fase D — Desastres y poderes de dios
Rayo, meteorito, terremoto, lava (que se enfría), fuego que se propaga, plaga (contagio), tornado, lluvia ácida, bendición, maldición, locura, luz divina, imán y leyes del mundo. Partículas y sacudida de cámara.
**Aceptación**: cada poder tiene efecto visible, consecuencias en la simulación y prueba unitaria. 60 FPS en PC con 3 desastres simultáneos.

### Fase E — Rasgos, inspector completo y guardado
Unos 20 rasgos heredables y por eventos, stats completas, inspector de unidad, aldea y reino, seguir unidad, guardar y cargar en IndexedDB (5 ranuras + autoguardado), exportar e importar archivo, ajustes.
**Aceptación**: guardar → recargar la página → cargar devuelve exactamente el mismo estado (mismo hash) y la simulación continúa de forma idéntica. ✔ Verificado en el navegador y en pruebas automáticas.

**Formato de partida (MBX1)**: «MBX1» · longitud · cabecera JSON (opciones, reloj, leyes, estado de los RNG, civilizaciones, reinos, efectos y listas de fuego/lava en su orden) · arrays tipados del mapa y de las criaturas alineados a 8 bytes; todo comprimido con gzip (`CompressionStream`). IndexedDB `minibox` con dos almacenes (`meta` para la lista rápida y `data` para los datos) y ranuras `auto` y `1`–`5`. El registro de comandos no se guarda: una partida cargada ya no se puede repetir desde la semilla.

**Rasgos**: máscara de bits por criatura (`traits`). Al nacer, cada rasgo heredable de los padres pasa con un 50 % y hay un 12 % de mutación; las criaturas creadas con el pincel reciben 0-2 al azar. Los opuestos se excluyen. Veterano (5 bajas) y Superviviente (sobrevivir a la plaga) se ganan y no se heredan.

### Fase F — El mar: muelles, pesca y barcos
- **Mares**: el mapa etiqueta cada masa de agua conectada (`world.sea`) igual que las islas; un muelle necesita un mar de al menos 150 casillas (un estanque no vale).
- **Muelle** (2×2, ayuntamiento de nivel 2, 10 habitantes, 15 de madera y 4 de piedra): en la costa del territorio propio. Da pescado: los **pescadores** trabajan en él y cada captura gasta peces, que se reponen solos (`growth` del muelle).
- **Barcos de colonos**: si una aldea quiere enviar colonos y no queda sitio en su isla, bota un barco (12 de madera) hacia una costa fértil y libre de otra isla. El pasaje camina al muelle, embarca (sale del mundo: bit ABOARD), navega por una ruta de agua (búsqueda en anchura + línea de visión), desembarca y funda una aldea del mismo reino. El barco vuelve a puerto y se desarma.
- **Flotas de guerra**: en guerra, si no hay enemigos en su isla, el ejército elige la aldea enemiga más cercana a la que se llega por mar; hasta 8 guerreros embarcan y desembarcan junto a ella para asediarla. Los que quedan lejos de casa sin misión dejan su aldea y se unen a otra o fundan una para su reino.
- **Naufragios**: rayos, meteoritos, bombas, terremotos y tornados hunden barcos (el pasaje se ahoga). Si el agua bajo un barco se vuelve tierra, el pasaje baja a la orilla.
- **Guardado**: formato MBX versión 2 (mares y barcos); las partidas de la versión 1 se migran al cargar.

### Fase G — Biomas, estaciones y eras
- **Biomas** (`BIOME_INFO`): cada uno define hierba, árboles, densidades al generar y multiplicadores de velocidad al caminar, hambre y cosechas. El generador elige por calor (que baja con la altitud), humedad y capa: tundra nevada, desierto, sabana, selva, pantano (tierras bajas muy húmedas), bosque y pradera.
- **Biomas mágicos** (sólo con pincel): la arboleda mágica cura un 8 % de vida en cada pasada de curación; el yermo maldito quita un 6 % (sin curación natural), marchita las plantas y ambos se extienden a casillas fértiles vecinas (ley «Los biomas mágicos se extienden»).
- **Estaciones** (se deducen del tick; ley «Estaciones»): primavera, verano, otoño, invierno, con multiplicadores de hierba, árboles, cosechas y hambre. Cada estación dura 5 años por defecto (elegible: 3 meses, 1 año, 5 o 10 años; se guarda en la partida); como pueden durar años, el invierno no detiene las cosechas del todo (×0,25). El mapa se tiñe (nieve, ocres) y se repinta entero sólo al cambiar de estación.
- **Eras** (`world/climate.ts`): cada 40 años, secuencia determinista por semilla (la primera es templada y nunca se repiten seguidas). Abundancia, glacial (el otoño ya es invierno), de hierro (umbral de guerra más fácil), de la concordia (guerras raras, paz antes) y arcana (biomas mágicos ×4). El jugador puede imponer una (comando `era`), que dura hasta la siguiente.
- **Guardado**: formato MBX versión 3 (era en la cabecera); las partidas anteriores se migran con las leyes nuevas activadas y la era que les toca por fecha.

### Renovación visual (entre G y los monstruos)
- **Criaturas** (`render/creature-art.ts`): se componen por partes (cabeza, pelo, orejas, barba, colmillos, torso, brazos, piernas) con 4 cuadros de caminar y 2 de acción; la ropa lleva el color del reino (atlas de 13 colores). Las herramientas de cada oficio y la carga son sprites aparte, colocados en la mano según la postura. Sombra bajo cada criatura y orden de dibujo por profundidad.
- **Edificios** (`render/building-art.ts`): 8 px por casilla, piezas reutilizables (paredes de entramado, troncos, sillería o piel; tejados a dos aguas, de hojas, de pizarra o tiendas) y bandera del reino en ayuntamientos y fortalezas.
- **Vegetación** (`render/flora-art.ts`, `render/flora-layer.ts`): un árbol por bioma con variantes de estación, arbustos, rocas, vetas y adornos del suelo. Cada chunk se pinta una vez en una caché (LRU de 48) y sólo se repinta si cambian sus plantas o la estación: dibujar el bosque cuesta ~1-4 ms en vez de ~20-30.
- **Efectos** (`render/fx.ts`): llamas animadas, rayos con resplandor, ondas expansivas, tornados, nubes y partículas con forma; además, vida en el mapa según lo que hacen las criaturas (astillas, chispas, golpes, corazones, humo de chimeneas, estados).
- **Iconos** (`ui/tool-icons.ts`): 16×16 a doble tamaño.

### Fase H — Monstruos
Criaturas propias y peligrosas (nada de monstruos icónicos de otros juegos). Son una cuarta «dieta» (`monster`): no comen, no crían y no envejecen como los demás; cada una tiene su origen, su punto débil y su final.

| Monstruo | Aspecto | Nace de | Particularidades |
|---|---|---|---|
| **Penante** | Alma en pena con sudario y cara de hueso | El yermo maldito (cuanto más grande, más salen); los aldeanos **malditos** al morir; a veces los muertos de la plaga (15 %) o en combate (5 %); sus propias víctimas (40 %) | No-muerto: el yermo lo cura y la arboleda mágica lo hiere; la **luz divina** lo fulmina; inmune a la plaga. Se deshace a los ~7 años |
| **Escorio** | Mole de basalto con grietas de lava | La lava al enfriarse (volcanes y pincel de lava, 0,8 % por casilla; tope del 1 % del límite de criaturas) | El más duro (320 de vida). Inmune al fuego y a la lava; prende la casilla de lo que golpea e incendia edificios. A los ~4 años se enfría y deja una **roca** |
| **Cenagoso** | Montón de fango, musgo y raíces | Los pantanos sin dueño, él solo, a partir del año 8 (uno cada cuatro o cinco años en un mapa mediano; tope de 1 por cada 20 000 casillas) | Vive ~30 años y asalta en oleadas: tras matar se calma año y medio |

- **IA** (`ai/monster-ai.ts`): persigue a la criatura civilizada más cercana de su isla (y a los herbívoros que se crucen a 3 casillas; a los depredadores los deja en paz); si no ve a nadie, marcha con A* hacia la aldea más cercana dentro de su radio de asalto y **arrasa** sus edificios (estado `RAZE`): primero casas, granjas, almacenes y muelles, y el ayuntamiento al final. El daño usa el mismo contador que el fuego (`burn`), que ahora baja solo con el tiempo (reparaciones).
- **Defensa de las aldeas**: los guerreros atacan a los monstruos aunque su reino esté en paz; una aldea con monstruos cerca recluta como en guerra (35 % de adultos); los civiles huyen de ellos y los herbívoros también.
- **Apariciones** (`ai/monster-spawn.ts`): una vez al mes se muestrean casillas al azar (flujo de azar propio, `fork 6`); las de yermo o pantano pueden dar un monstruo. Los monstruos «naturales» no pasan del 12 % del límite de criaturas. Ley del mundo **«Aparecen monstruos»** (los que crea el jugador con el pincel no dependen de ella).
- **Poderes**: la maldición ya tiene consecuencia (el maldito se levanta como penante) y la luz divina es un arma contra los no-muertos.
- **Interfaz**: pestaña «Monstruos», contador en la barra superior (sólo si hay alguno), ficha en el inspector y avisos en la crónica.
- **Visual**: sprites por código (más grandes que un aldeano en el escorio y el cenagoso), resplandor bajo el escorio, ascuas, jirones y goterones; motas sobre el yermo maldito y la arboleda mágica; humo en los edificios dañados.
- **Guardado**: formato MBX versión 4 (ley nueva y un quinto flujo de azar); las partidas de la versión 3 se migran al cargar.

### Fase I — Cultura, religión y clanes
Tres capas sociales sobre las aldeas y los reinos (`civ/society.ts`), cada una con pocas reglas y efecto visible.

- **Cultura**: nace con cada aldea que se funda por su cuenta; las colonias heredan la de la capital de su reino. Tiene un **rasgo** fijo (Laboriosa: +10 % de trabajo; Belicosa: +10 % de daño de sus guerreros y −10 de opinión hacia otras culturas; Hospitalaria: +10 de lealtad y de opinión; Erudita: +50 % de saber) y acumula **saber** en cada pasada de reinos (adultos/10 por aldea). Con 40, 120, 280 y 520 de saber descubre, en orden, **Agricultura** (cosechas +25 %), **Albañilería** (obras +30 %), **Forja** (armas de hierro +25 % de daño) y **Medicina** (curación ×2). Una aldea de otra cultura que la de su capital es menos leal (−15) y, tras 15 años, puede asimilarse (8 % por pasada).
- **Religión**: edificio nuevo, el **santuario** (2×2; desde la hoguera, 10 habitantes, 12 de madera y 6 de piedra). Al terminarlo, la aldea adopta la fe de su capital; si no la tiene, la de la aldea con fe más cercana (a 45 casillas, 60 %); si no, **funda una**. Cada fe tiene un **precepto**: Pacífica (+15 de opinión hacia todos y paz más fácil), Celosa (−30 hacia reinos de otra fe en vez de −15, +25 hacia la suya) o Devota (+10 de lealtad). La fe del reino es la de su capital: misma fe +10 de lealtad, distinta −15 (y un 10 % por pasada de convertirse). Entre reinos: misma fe +20 de opinión, distinta −15.
- **Clanes**: cada aldeano lleva un clan (`units.clan`); los hijos heredan el del padre. En cada censo, quien no tiene clan funda uno si su aldea tiene menos de dos, o entra en el menor. **Sucesión**: hereda el adulto de más edad del clan reinante (primero en la capital, luego en el resto del reino); si sólo quedan menores reina un niño, y si el linaje se ha extinguido en el reino sube otro clan: **cambio de dinastía** (crónica y −15 de lealtad durante 10 años). Una aldea cuyo líder es del clan reinante es más leal (+10).
- **Interfaz**: el inspector muestra cultura, saberes y religión de la aldea, la casa reinante del reino y el clan de cada aldeano; la crónica anuncia culturas, descubrimientos, religiones, conversiones y dinastías.
- **Visual**: santuario con la arquitectura de cada raza, pináculo dorado, braseros y destellos.
- **Guardado**: formato MBX versión 5 (culturas, religiones y clanes en la cabecera; clan de cada criatura); las partidas de la versión 4 se migran: una cultura por reino, sin fe y con los clanes repartidos en el primer censo.

### Fase J — Sonido y caminos
- **Senderos por desgaste** (`world.road`, 0-255 por casilla): cada aldeano con aldea suma 10 al pisar una casilla nueva; cada pasada de vegetación resta 2. A partir de 80 es **sendero** (+15 % de velocidad) y de 170, **camino** (+30 %). Las rutas del ayuntamiento al bosque, la mina o las granjas se marcan solas y el centro de la aldea queda de tierra batida; sin tránsito, la hierba vuelve.
- **Calzadas** (valor 255, no se borran, +40 %): al fundarse una colonia, su reino tiende una en línea recta hasta la capital si está en la misma isla y a menos de 70 casillas (sólo sobre tierra pisable y sin edificios). El jugador puede pintarlas con el pincel «Calzada» (pestaña Terreno).
- Los retoños no brotan en senderos ni caminos; el inspector de casilla dice qué hay. Se pintan en la textura del terreno (tierra batida o empedrado) y sólo se repinta el chunk cuando una casilla cambia de categoría.
- **Sonido** (`audio/sound.ts`, WebAudio): todo sintetizado con osciladores y ruido filtrado, sin archivos. El contexto de audio se crea con el primer toque o tecla (norma de los navegadores). Suenan los desastres y poderes (a través de los avisos visuales de la simulación), el trabajo y el combate cuando la cámara está cerca, los avisos del mundo (fundación, guerra, paz, rey, dinastía, monstruos, fe, descubrimientos) y la interfaz (clics, pinceles, crear criaturas). Lo que pasa fuera de la pantalla suena más bajo y cada sonido tiene un intervalo mínimo de repetición (`audio/sound-map.ts`, con pruebas).
- **Ajustes**: casilla «Sonido» y volumen (0-100), guardados en el navegador. El sonido no forma parte de la simulación (no afecta al determinismo).
- **Guardado**: formato MBX versión 6 (el array `road` al final); las partidas anteriores empiezan sin caminos.

### Fase K — Puentes y comercio
- **Puentes**: una casilla de agua (somera u océano, no abismo) con calzada (`world.road` = 255) es un puente: se puede pisar (`world.canWalk`), une islas en las regiones y en el A*, y se pinta de madera. Los barcos pasan por debajo. Aguanta mientras debajo haya agua que no sea abismo; si el fondo se hunde hasta el abismo, se pierde; si se rellena, queda calzada.
- Los **reinos** los construyen solos: la calzada de una colonia a su capital (a menos de 70 casillas) avanza en escalera (nunca en diagonal) y cruza con puente los tramos de agua de hasta 8 casillas de puente con tierra firme en ambas orillas; si algún tramo no se puede cruzar y las aldeas están en islas distintas, no se tiende nada, así que también une aldeas separadas por un río o un estrecho. El jugador tiene el pincel «Puente» (pestaña Terreno).
- **Comercio**: oficio nuevo, el **mercader** (1 por aldea con 10 adultos, 2 con 25; va tras granjeros, pescadores, guerreros y constructores; nunca en guerra ni con monstruos cerca). Elige la aldea alcanzable más cercana que no sea enemiga (misma isla, hasta 45 casillas, la que más diferencia de existencias tiene), carga hasta 8 unidades del recurso que a su aldea le sobra y a la otra le falta, camina hasta su almacén (estado «Comerciando»), lo entrega y vuelve con lo que allí sobra. Cada entrega da 1 de oro a las dos aldeas y, entre reinos distintos, quita 1 de agravio en cada sentido.
- Como van a pie, senderos, calzadas y puentes acortan sus viajes, y su ir y venir marca caminos entre aldeas.
- **Guardado**: sin cambio de formato (los puentes viven en el array de caminos; las aldeas de partidas anteriores reciben el recuento del oficio nuevo al cargar).

### Después de K
La hoja de ruta original está completa. Ideas: música ambiental, idiomas.

### Fase L — Pulido
Una pasada de acabado sobre lo que ya existe, sin mecánicas nuevas.

- **Meteorito con forma redonda**: el cráter es el de siempre (radio 3 + pincel × 0,5) y alrededor queda una **zona chamuscada** redonda hasta 2,5 veces ese radio (1,4 en la bomba): las plantas desaparecen con una probabilidad que baja del 90 % junto al cráter al 30 % en el borde, la hierba se quema en proporción y la onda expansiva hiere (25) a quien esté dentro. Sólo el último 15 % de la zona prende llamas pequeñas. Con el pincel mediano (3) el círculo mide unas 22 casillas de ancho; con el mayor (15), unas 52.
- **Fuego con fuerza**: hasta ahora cada llama contagiaba a sus vecinas igual que la primera, así que un incendio no se apagaba hasta quemar toda la hierba y el bosque conectados (un meteorito arrasaba la isla entera). Ahora `world.fire` guarda en cada casilla la **fuerza** del fuego (4 bits altos) y los **pasos que le quedan ardiendo** (4 bits bajos, 12 al prender). Una llama sólo contagia si le queda fuerza, y la nueva nace con 1 menos si salta a un bosque o un edificio y 2 menos si salta a la hierba. Fuerza inicial: 5 el pincel de fuego, el rayo y los escorios; 4 lo que prende la lava; 2 el borde del meteorito. Un incendio del pincel quema una mancha de unas pocas casillas (más en el bosque que en el prado) y se apaga solo. Las partidas guardadas con fuego activo lo cargan con fuerza 0: se apaga sin contagiar.
- **Interfaz**: paneles con marco de pixel art (doble borde con brillo interior), aparición animada de menús, inspector y avisos, botones que se hunden al pulsar, herramienta elegida con un brillo que late y pestañas con transición. Respeta la opción «reducir movimiento» del sistema.
- **Menú de inicio**: vista previa del mapa (miniatura del terreno de la semilla y el tamaño elegidos, que se regenera al cambiarlos) y, detrás del panel, el mismo mapa ampliado y en movimiento lento.
- **Sprites**: las criaturas rebotan al caminar (el cuerpo sube un píxel en cada paso), tienen brillo en los ojos y luz cenital (pelo y hombros), y los animales ganan detalle. El anillo de selección late y el pincel muestra un anillo discontinuo que gira, rojo con las herramientas destructivas.
- **Animaciones**: el meteorito cae del cielo con una estela de fuego antes del impacto (destello, doble onda, polvo y rocas); las criaturas que mueren a la vista dejan una nubecilla.
- **Sonido**: panorámica estéreo según la posición en pantalla y volumen según la distancia al centro, un eco suave en los sonidos grandes, recetas con más capas (explosión, trueno, meteorito con silbido de caída) y sonidos propios para abrir, cerrar y cambiar de pestaña. **Ambiente**: olas cuando se ve el mar, viento en montañas y nieve, y gorjeos de pájaros sobre los bosques, mezclados según lo que hay en pantalla (casilla «Ambiente» en los ajustes).
- **Guardado**: sin cambio de formato (el calor del fuego ya se guardaba).

### Fase M — Fauna, edificios y música
- **Fauna nueva** (cinco especies, todas con su hábitat):

| Animal | Dieta | Hábitat | Notas |
|---|---|---|---|
| Oveja | herbívoro | pradera, sabana | como hasta ahora |
| Conejo | herbívoro | pradera, bosque, desierto | presa pequeña |
| **Ciervo** | herbívoro | bosque, selva, arboleda mágica | rápido, con cornamenta |
| **Cabra montés** | herbívoro | colinas, montaña y nieve | vive en las alturas |
| **Dromedario** | herbívoro | desierto y sabana | aguanta mucho sin comer |
| Lobo | depredador | pradera, bosque, nieve | caza presas medianas |
| **Zorro** | depredador | pradera, bosque, sabana | caza presas pequeñas (conejos, ovejas, cabras); come bayas |
| **Oso** | depredador | bosque, nieve | grande y escaso; caza cualquier herbívoro y come bayas |

  Cada animal tiene un **tamaño** (conejo 1; oveja y cabra 2; ciervo 3; dromedario 4) y cada depredador uno máximo de presa (zorro 2, lobo 3, oso 4). Un herbívoro sólo huye de quien puede cazarlo.
- **Población con medida**: hasta ahora cada herbívoro criaba hasta ocupar el 70 % del límite de criaturas repartido entre especies (unas 700 ovejas y 700 conejos con el límite de 2000), y las crías se quedaban junto a la madre, así que se formaban manadas enormes. Ahora:
  - **Cupo por hábitat** (`ai/habitat.ts`): cada especie cría sólo mientras haya menos de una por cada N casillas de su hábitat (oveja 1/200, conejo 1/180, ciervo 1/200, cabra 1/300, dromedario 1/250, lobo 1/900, zorro 1/700, oso 1/1500; mínimo 4), y nunca más de su parte del límite (40 % para los herbívoros y 6 % para los depredadores, repartidos entre especies). El hábitat se cuenta sobre el mapa actual (si el jugador pinta un bosque, caben más ciervos); cada cría vuelve a mirar el cupo, así que varias parejas a la vez no lo desbordan.
  - **Menos apiñamiento**: un animal no cría si ya hay 4 de su especie a 5 casillas, y si hay 5 o más, se aleja 14 casillas en dirección contraria al grupo.
  - **Querencia**: al pasear prefieren las casillas de su hábitat.
  - **Encontrarse**: buscan pareja hasta 24 casillas (las especies escasas viven repartidas) y los depredadores con hambre huelen presa hasta 2,5 veces su vista. Un depredador sólo cría si hay 10 presas suyas por cada uno de su especie.
  - **Refugio**: de una especie con menos de 10 animales en el mundo no caza nadie (ni depredadores ni cazadores de las aldeas).
  - **Migración** (`ai/migration.ts`): una vez al año, si una especie salvaje tiene menos de 6 animales y su hábitat sigue en el mapa, hay un 50 % de que llegue un grupito (unos 4). Sólo en mundos con al menos 20 animales salvajes: un mundo vacío sigue vacío.
  - **Población inicial**: grupos de unos 4 (machos y hembras alternos) repartidos por el hábitat de cada especie. Todo grupo creado con el pincel alterna también los sexos.
  - Resultado (sondeo de 60 años, 4 mundos de 256×256): entre 200 y 350 animales por mundo (antes, unos 1400) y las ocho especies vivas en los cuatro mundos al final, con altibajos por los depredadores y los inviernos.
- **Edificios**: sombra en el suelo, dos variantes por casa (tejado de otro tono y espejo) para que las aldeas no se vean repetidas, más detalle (jardineras, caballete del tejado, escalón de la puerta, farol), bandera del reino que ondea, hoguera con llamas que se mueven y obras con andamio de madera de verdad.
- **Música**: compuesta por código mientras se juega (sin archivos): acordes suaves, un bajo y una melodía en escala pentatónica que se improvisa compás a compás. Tres ambientes: **calma** (paz), **invierno** (más lenta y escasa) y **tensión** (guerra o muchos monstruos: modo menor y tambor grave), que cambian al final de cada frase. Casilla «Música» en los ajustes. No es simulación.
- **Guardado**: sin cambio de formato (las especies nuevas usan los números siguientes; las partidas anteriores cargan igual).

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Canvas 2D lento con miles de unidades en móvil | Atlas, lotes y recorte. Interfaz `Renderer` para cambiar a PixiJS sin tocar la simulación. |
| Búsqueda de caminos cara con muchas unidades | Presupuesto por tick, etiquetas de islas, movimiento local para distancias cortas. |
| Gestos táctiles que pintan sin querer | Retraso de 80 ms / 6 px y cancelación con el segundo dedo. Prueba e2e de gestos. |
| Se rompe el determinismo | Reglas en `sim/`, regla de ESLint que prohíbe `Math.random`/`Date` en `sim/` y prueba de hash en CI. |
| Service worker dentro del iframe de itch | Registro condicional y con try/catch. El juego funciona sin él. |
| Alcance excesivo (crecimiento de funciones) | Prioridades N/I/E. Lo que es «E» no entra hasta cerrar la fase. |
| Parecido legal con WorldBox | Nombre, razas, criaturas, arte y textos propios. Solo se inspiran las mecánicas genéricas del género. |

---

## 8. Requisitos previos de despliegue (acción del usuario)
- GitHub CLI instalado y con sesión iniciada (hecho).
- **Vercel**: lo más simple es entrar en vercel.com → *Add New Project* → importar el repositorio (lo detecta como Vite). Después, cada push a `main` se despliega solo. Yo dejo `vercel.json` preparado.

---

## 9. Fuentes
- [WorldBox — Wikipedia](https://en.wikipedia.org/wiki/WorldBox)
- [WorldBox en Steam](https://store.steampowered.com/app/1206560/WorldBox__God_Simulator/)
- [WorldBox en App Store (notas de versión 0.50–0.51)](https://apps.apple.com/app/id1450941371)
- Wiki oficial (fandom): [Jobs](https://the-official-worldbox-wiki.fandom.com/wiki/Jobs), [Armies](https://the-official-worldbox-wiki.fandom.com/wiki/Armies), [Units](https://the-official-worldbox-wiki.fandom.com/wiki/Units), [Unit Stats](https://the-official-worldbox-wiki.fandom.com/wiki/Unit_Stats), [Creature Traits](https://the-official-worldbox-wiki.fandom.com/wiki/Creature_Traits), [Kingdom Opinions](https://the-official-worldbox-wiki.fandom.com/wiki/Kingdom_Opinions), [Kingdoms](https://the-official-worldbox-wiki.fandom.com/wiki/Kingdoms), [Plots](https://the-official-worldbox-wiki.fandom.com/wiki/Plots), [Rebellions](https://the-official-worldbox-wiki.fandom.com/wiki/Rebellions), [Kings and Leaders](https://the-official-worldbox-wiki.fandom.com/wiki/Kings_and_Leaders)
- [Traits (0.22) — worldbox.wiki](https://worldbox.wiki/w/Traits)
- [Diplomacy — wiki fandom alternativa](https://worldbox-sandbox-god-simulator.fandom.com/wiki/Diplomacy)
- [Pro Game Guides — poderes de naturaleza y desastres](https://progameguides.com/guides/how-to-use-nature-and-disaster-powers-in-worldbox-god-simulator/)
- [Pro Game Guides — hacer crecer civilizaciones](https://progameguides.com/guides/how-to-grow-civilizations-in-worldbox-god-simulator/)
- [Game8 — avances de clanes y subespecies](https://indie.game8.co/news/worldbox-god-simulator-dev-teased-new-clan-features-as-part-of-an-upcoming-major-update/)

### Plan de acción (después de M)
Petición del usuario: seguir mejorando todo (menos animales en pantalla, árboles menos tupidos y simétricos, menús rediseñados, más razas, desastres y poderes, mejor IA, sonido y aspecto). Se hace por fases cortas, cada una probada, revisada y publicada por separado:

| Fase | Contenido | Estado |
|---|---|---|
| **N — Naturaleza** | Bosques irregulares: los retoños caen a 1-3 casillas en cualquier dirección (antes, siempre a 2 en cruz: un tablero de ajedrez) y no brotan con 3 árboles al lado; al generar, arboledas y claros por ruido y densidad algo menor; árboles dibujados con desplazamiento en los dos ejes y espejo; suelo de bosque menos oscuro y menos matojos. Aún menos animales: cupos de hábitat casi el doble de grandes (oveja 1/380, conejo 1/340, ciervo 1/360, cabra 1/520, dromedario 1/420, lobo 1/1500, zorro 1/1200, oso 1/2400) y menos grupos iniciales: unos 110-180 animales en un mapa de 256×256 | hecha (0.16.0) |
| **O — Menús** | Primera parte hecha (0.18.0): el menú principal es una cuadrícula de secciones con icono pixelado (nuevo mundo, partidas, crónica, leyes, ajustes, controles, pantalla completa, rendimiento); las secciones se abren dentro del panel con título y flecha de volver. Segunda parte (0.20.0): la ficha de aldea del inspector se ordena en apartados (Aldea, Economía, Sociedad, Reino), los recursos van en una cuadrícula con icono, cantidad y barra de almacén, el inspector lleva una franja del color del reino y los contadores de la barra superior son píldoras | hecha (0.20.0) |
| **P — Desastres y poderes** | **Maremoto** (sólo en la costa: en la tierra baja arrastra plantas, apaga el fuego, hiere 45 y empuja 2,5 casillas tierra adentro, derriba un 35 % de los edificios y hunde barcos), **ventisca** (30 s: hiere poco a poco, hiela las cosechas, apaga el fuego y deja tierra nevada), **langostas** (nube que vaga 40 s comiéndose hierba, bayas, retoños y cosechas; no hiere), **lluvia fértil** (hierba a tope, bayas, algún retoño, cosechas +40 y fuego apagado) y **ofrenda** (comida, madera, piedra, hierro y oro para las aldeas tocadas, sin pasar del almacén). En `powers/nature-powers.ts`; los efectos nuevos se guardan como los demás | hecha (0.17.0) |
| **Q — Razas** | **Escamados** (gente-lagarto de pantanos y selvas; número de especie 15, al final de la lista): 46 de vida, viven 80 años, recolectan +30 % y **pescan +60 %**, **el barro y la espesura no los frenan** (pantano y selva les cuentan como terreno normal) y **no enferman de plaga**; talan y minan algo peor. Viven en **palafitos** de caña con tejado de paja cónico y remate turquesa; su fortaleza es una gran casa comunal con tótems. Nombres propios (Vashkessa, Kathassa…) | hecha (0.19.0) |
| **R — IA y sonido** | **Alarma**: al huir, un herbívoro asusta a los de su especie a 6 casillas, que huyen del mismo depredador aunque no lo vean (y quien huye sigue hasta su destino). **Manadas sueltas**: al pasear, un herbívoro solo se acerca (35 %) al más cercano de su especie si está entre 5 y 18 casillas; con la dispersión de los apiñados quedan grupitos sueltos. **Voces**: balidos cuando hay herbívoros a la vista y aullidos si hay lobos, en el ambiente | hecha (0.21.0) |

### Plan de acción (después de R)
Ideas propuestas al usuario y aceptadas («sigue con esas mejoras»). Fases cortas, cada una probada, revisada y publicada:

| Fase | Contenido | Estado |
|---|---|---|
| **S — Día y noche** | Ciclo de luz de 36 s (en x1): el mapa se oscurece de noche y se encienden ventanas, hogueras, braseros y fuegos. De noche los aldeanos sin tarea se reúnen junto a la hoguera de su aldea y los herbívoros descansan más. Casilla «Día y noche» en los ajustes (sólo lo visual: la vida de noche sigue igual). `world/daylight.ts` (puro, por tick: sin estado que guardar) y `render/night.ts` (oscuridad y halos precalculados) | hecha (0.22.0) |
| **U — Poderes** | **Fertilidad** (las criaturas del círculo, salvo los monstruos, quedan saciadas y pueden volver a criar ya; los cupos de cada especie siguen valiendo) y **paz divina** (los reinos con aldeas en el círculo firman la paz con todos sus enemigos). Además, de noche los aldeanos sin tarea buscan un hueco a 3 casillas de la hoguera (el ayuntamiento ocupa el centro) y descansan allí | hecha (0.23.0) |
| **V — Raza del desierto** | Una quinta raza civilizada para desierto y sabana, con su arquitectura de adobe y su rasgo | pendiente |
