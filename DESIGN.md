# DESIGN.md — MiniBox

Simulador de dios 2D por píxeles para navegador (PC y móvil), inspirado en la *sensación* de WorldBox – God Simulator, con nombre, arte, sonido y contenido propios.

> Estado: diseño aprobado. **Fases A (MVP), B (razas y aldeas), C (reinos y guerras), D (desastres y poderes) y E (rasgos y partidas guardadas) implementadas.**
>
> Pendiente de B, trasladado a fases posteriores para no dejarlo a medias: más biomas (nieve, pantano, selva, sabana), peces/pescadores y muelles (llegarán con los barcos). En la Fase C quedan pendientes los barcos y muelles para colonizar islas, y los clanes.

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
| Más biomas (nieve, pantano, selva, sabana) | I | B |
| Biomas mágicos (encantado, corrupto) con efectos sobre las unidades | E | D |
| Recursos minables: rocas, vetas de hierro y oro | I | B |
| Peces en el agua | I | B |
| Fuego que se propaga, lava que se enfría | I | D |
| Eras/estaciones globales | E | post-E |
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
| Monstruos propios (no-muertos, bestia de lava…) | E | D |

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
| Muelles y barcos para colonizar islas | I | C |
| Caminos | E | post-E |
| Cultura con rasgos y tecnología, idioma, religión | E | post-E |

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
| Clanes y genealogía | E | post-E |

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
| Sonido (efectos sintetizados con WebAudio) | E | post-E |

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

### Después de E (opcional)
Cultura, idioma y religión; clanes; eras; caminos; sonido; editor de estandartes; mods.

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
