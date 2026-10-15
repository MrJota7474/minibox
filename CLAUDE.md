# CLAUDE.md — Guía para continuar MiniBox

Este archivo es el traspaso de contexto para cualquier sesión de Claude que trabaje en este proyecto. Léelo entero antes de tocar código. Para el diseño detallado, ver `DESIGN.md`; para el resumen jugable, `README.md`.

## 1. Qué es

**MiniBox**: simulador de dios 2D por píxeles para navegador (PC y móvil), inspirado en la *sensación* de WorldBox – God Simulator, pero 100 % original.

- **Prohibido** copiar nombre, logo, sprites, sonidos, UI o contenido de WorldBox. Todo el arte se genera por código (no hay imágenes externas).
- Razas propias: **Humanos**, **Silvanos** (bosque), **Petrinos** (montaña), **Colmilludos** (guerreros), **Escamados** (pantano) y **Dunarios** (desierto). Monstruos propios: **Penantes**, **Escorios**, **Cenagosos**.
- Toda la interfaz y los textos en **español**. El usuario habla español: responde siempre en español.

## 2. Dónde está

| Qué | Dónde |
|---|---|
| Repositorio | `https://github.com/MrJota7474/minibox` (público, rama `main`) |
| Juego publicado | `https://minibox-seven.vercel.app/` (Vercel despliega solo con cada push a `main`) |
| Copia local del usuario | `C:\Users\sscri\Documents\minibox` (Windows 11) |
| Zips para itch.io | `release/minibox-<versión>-itch.zip` (no se suben al repo) |

Versión actual: **0.33.0** (hoja de ruta original completa; después, puentes y comercio, pulido, y fauna, edificios y música).

## 3. Cómo se ejecuta

```bash
npm install
npm run dev          # servidor de desarrollo (vite --host)
npm run build        # tsc --noEmit && vite build → dist/
npm run build:itch   # build + zip con index.html en la raíz → release/
npm test             # vitest run (379 pruebas, 30 archivos)
npm run lint         # eslint (incluye reglas de determinismo)
npm run coverage
```

Configuración de itch.io: tipo HTML, 1280×720, «Mobile friendly», botón de pantalla completa.

## 4. Tecnología

TypeScript (~6.0; typescript-eslint exige <6.1) + HTML5 Canvas 2D + Vite 8. Sin backend. PWA con vite-plugin-pwa (`registerType: 'prompt'`; el aviso de actualización pasa por `Game.notifyUpdate`). Vitest 5. fflate (zip de itch). Fuente @fontsource/pixelify-sans. ESLint 9 (flat config). `vite.config.ts` usa `base: './'`.

## 5. Estado: qué está hecho

| Fase | Contenido |
|---|---|
| A (MVP) | Mapa procedural con capas de altura, pinceles de terreno, ovejas/conejos/lobos, hambre, cría, muerte, cámara, gestos móviles, HUD |
| B | 4 razas, aldeas, oficios, construcción (hall, casas, almacén, granjas), recursos (madera, piedra, hierro, oro, comida) |
| C | Reinos, territorio por zonas, diplomacia, guerras, conquista, rebeliones |
| D | Desastres (meteoritos, rayos, tornados, lluvia ácida, volcanes, terremotos…), poderes de dios, leyes del mundo |
| E | 21 rasgos heredables, inspector completo, partidas guardadas (IndexedDB + exportar/importar `.minibox`) |
| F | El mar: muelles, pesca, barcos de colonos y flotas de guerra, naufragios |
| G | 9 biomas (pradera, bosque, desierto, tundra, pantano, selva, sabana, arboleda mágica, yermo maldito), estaciones, eras de 40 años |
| Visual | Renovación completa: criaturas por partes con posturas y herramientas, edificios por raza, árboles por bioma y estación, efectos, iconos |
| 0.9.0 | Estaciones de 5 años por defecto (selector 3 meses / 1 año / 5 años / 10 años en «Leyes del mundo»), relieve con luz, espuma, destellos en el agua, nieve/lluvia/hojas/pétalos, placas de nombre de aldea |
| H (0.10.0) | Monstruos: penantes (no-muertos del yermo maldito y de los malditos), escorios (nacen de la lava) y cenagosos (salen de los pantanos). Asaltan aldeas y arrasan edificios; milicia, huida de civiles, reparación de edificios; pestaña «Monstruos», ley «Aparecen monstruos», guardado MBX v4 |
| I (0.11.0) | Cultura (rasgo + saber → agricultura, albañilería, forja, medicina; asimilación), religión (santuario, preceptos, conversión; pesa en lealtad y opinión) y clanes (herencia paterna, sucesión dinástica, cambio de dinastía). Guardado MBX v5 |
| K (0.13.0) | Puentes (calzada sobre el agua: los tienden los reinos en ríos y estrechos de hasta 8 casillas y el jugador con el pincel «Puente») y comercio (mercaderes que llevan excedentes entre aldeas no enemigas; oro para ambas y menos agravios entre reinos) |
| J (0.12.0) | Caminos (senderos por desgaste, calzadas de los reinos y pincel «Calzada»; más velocidad al caminar) y sonido sintetizado con WebAudio (desastres, trabajo, combate, avisos, interfaz; volumen en ajustes). Guardado MBX v6 |
| AE (0.33.0) | Festejos por raza: partículas y paso de baile propios en las fiestas (`render/festive-look.ts`) |
| AD (0.32.0) | Caminos peligrosos: bandidos que asaltan a los mercaderes sin escolta y ferias en las aldeas prósperas (civ/trade.ts) |
| AC (0.31.0) | Clima de zona: poderes lentos reverdecer y sequía (`stepGreening`, `stepDrought` en powers/nature-powers.ts) |
| AB (0.30.0) | Fiestas: banquete la primera noche de cada estación, baile, hoguera grande, chispas y música de fiesta (`civ/festival.ts`) |
| AA (0.29.0) | Oasis: charca con palmeras al generar en desiertos grandes y poder «Oasis» (`world/oasis.ts`) |
| Z (0.28.0) | Música por raza: escala, instrumento y percusión según la raza más poblada a la vista (`styleFor`, `dominantRace` en audio/music-theory.ts) |
| Y (0.27.0) | Caravanas: los mercaderes dunarios llevan un dromedario de carga detrás (`render/caravan.ts`, sólo dibujo) |
| X (0.26.0) | Desastre tormenta de arena (avanza casi recta, hiere salvo a dunarios y dromedarios, deja arena junto al desierto) |
| W (0.25.0) | Noche sonora: de noche callan los pájaros y suenan grillos, ranas y búhos según lo que se ve |
| V (0.24.0) | Raza nueva: los Dunarios (desierto; el calor no les da hambre, mercaderes que cargan el doble) con casas de adobe y cúpula |
| U (0.23.0) | Poderes fertilidad y paz divina; de noche los aldeanos descansan en corro alrededor de la hoguera |
| S (0.22.0) | Día y noche: ciclo de 36 s, oscuridad con luces de hogueras, ventanas, santuarios y fuegos; de noche los aldeanos sin tarea se reúnen junto a la hoguera y los herbívoros descansan |
| R (0.21.0) | IA de manada (alarma al huir, grupitos sueltos) y voces de animales en el ambiente (balidos y aullidos) |
| O2 (0.20.0) | Inspector por apartados con cuadrícula de recursos y franja del color del reino; contadores de la barra superior en píldoras |
| Q (0.19.0) | Raza nueva: los Escamados (pescadores de pantano, el barro no los frena, inmunes a la plaga) con palafitos de caña |
| O (0.18.0) | Menú principal rediseñado: cuadrícula de secciones con icono; cada sección se abre en el panel con título y botón de volver |
| P (0.17.0) | Desastres maremoto, ventisca y langostas; poderes lluvia fértil y ofrenda (`powers/nature-powers.ts`), con iconos, efectos y sonido |
| N (0.16.0) | Naturaleza: bosques irregulares con claros (retoños a distancia variable y sin apiñarse; arboledas por ruido al generar), árboles con desplazamiento y espejo, y la mitad de animales |
| M (0.15.0) | Fauna: ciervo, cabra montés, dromedario, zorro y oso, cada animal con su hábitat y su cupo (menos animales y repartidos: dispersión, querencia, refugio y migración); edificios con sombra, variantes, jardineras, bandera que ondea, hoguera animada y andamios; música compuesta por código (calma, invierno, tensión) |
| L (0.14.0) | Pulido: meteorito con zona chamuscada redonda y fuego que se apaga solo (fuerza de contagio), meteorito que cae con estela, nubecillas al morir, sprites con rebote y brillos, pincel y selección animados, menú de inicio con vista previa del mapa, paneles con marco y animaciones, sonido con panorámica y eco, ambiente (mar, viento, pájaros) |

## 6. Qué falta

La hoja de ruta que eligió el usuario está **completa**. Ideas para seguir (sin orden acordado; preguntar al usuario): idiomas, editor de estandartes, optimizaciones, más variedad musical (instrumentos por era o raza).

Además, **en cada fase seguir mejorando el aspecto visual** (petición explícita del usuario: «cada vez que se vaya viendo mejor»).

Ideas abiertas: optimizar `tileColor` en `render/palette.ts` (~0,75 ms por chunk al repintar); en algún mundo los lobos se extinguen por azar (aceptado); los monstruos sólo tienen sprite de lado (como el resto de criaturas).

### Notas de la Fase Q (raza nueva)

- Una raza nueva se añade en: `Species` (número nuevo **al final** y su `civilized(...)` también **al final de `SPECIES`**: la lista se indexa por número; `tests/race.test.ts` lo comprueba), `RACE_IDS`, sílabas y sufijos en `civ/names.ts`, herramienta en `powers/tools.ts`, aspecto en `RACES` de `render/creature-art.ts` y estilo + lista `RACES` en `render/building-art.ts`.
- Rasgos opcionales de raza: `fish` (pesca), `mudWalker` (los biomas lentos no frenan; `ai/movement.ts`) y `plagueImmune` (`powers/status.ts`).

### Notas de la Fase M (fauna, edificios y música)

- **Especies**: los números de `Species` se guardan en las partidas; las nuevas van **siempre al final** (DEER 10 … BEAR 14). Un animal salvaje se reconoce por `def.animal` (`ANIMAL_IDS`), con `bodySize`, `preyMax`, `omnivore` y `habitat`.
- **Hábitat** (`ai/habitat.ts`): el recuento por especie se cachea por mundo y se rehace cuando cambia `world.landVersion`, que suben `setHeight` (si cambia el terreno) y `setBiome`. **No escribas `world.biome`/`world.terrain` a mano** fuera del generador: el cupo de los animales dejaría de coincidir tras cargar una partida.
- Cupos, refugio, dispersión, olfato y migración: ver DESIGN.md (Fase M). `stepMigrations` usa el azar de la IA y corre a mitad de cada año.
- **Edificios**: el atlas tiene 2 variantes de color por raza y copias espejadas (sólo casas y almacenes); `CivLayer` elige variante y espejo con un hash del id del edificio. `drawBuildings(ctx, now)` anima bandera y hoguera.
- **Música** (`audio/music-theory.ts` puro y probado; `audio/music.ts` la hace sonar): un temporizador cada 250 ms programa compases con 1,2 s de antelación; el ambiente (`moodFor`) sólo cambia al empezar una frase de 8 compases. `game.ts` la actualiza con la interfaz (y también en el menú de inicio).

### Notas de la Fase L (pulido)

- **Fuego**: `world.fire` = fuerza de contagio × 16 + pasos que le quedan ardiendo (`hazards.ts`, `FIRE_TIME_BITS`). Una llama con fuerza 0 no contagia; al saltar pierde 1 (bosque o edificio) o 2 (hierba). Para prender usa siempre `hazards.ignite(i, fuerza)`; nunca escribas `world.fire` a mano. Los valores antiguos (≤ 15) son fuerza 0.
- **Meteorito y bomba**: `blast` en `powers/disasters.ts` (cráter + zona chamuscada hasta `r × METEOR_SCORCH`). El aviso visual del meteorito es `'meteor'`: `FxLayer` lo hace caer y estalla al llegar (el cráter ya está hecho en la simulación).
- **Sonido**: `SoundEngine.play(id, ganancia, panorámica)`; cada sonido va a su bus (panorámica + envío al eco según `REVERB_SEND`). El ambiente (`audio/ambience.ts`) son capas en bucle cuyo volumen fija `ambienceMix` (puro, en `audio/ambience-mix.ts`) cada 250 ms desde `game.ts`. Los paneles suenan al abrirse y cerrarse por un `MutationObserver` sobre el atributo `hidden` de `.modal` e `.inspector`.
- **Menú de inicio**: la vista previa usa el mismo `generateWorld` que el juego (`ui/map-preview.ts`), con 350 ms de espera tras cada cambio.
- Las animaciones de la interfaz están en `style.css` (sección «Acabado») y se apagan con `prefers-reduced-motion`.

### Notas de la Fase K (puentes y comercio)

- **Puente** = casilla de agua (no abismo) con `world.road === 255`. Para saber si se puede pisar usa siempre `world.canWalk(i)` / `world.isWalkableAt(x, y)`, no `isWalkableTerrain(terrain)` a secas (eso es sólo «tierra firme»: edificios, territorio, apariciones).
- Tender o perder un puente marca `regionsDirty`: las islas (`world.region`) se recalculan en el siguiente múltiplo de 10 ticks.
- **Mercader** (`Job.MERCHANT`, estado `TRADE`, lógica en `civ/trade.ts`): la mercancía viaja en `units.carry`/`carryAmount` y el almacén de destino en `units.work` (`world.size + id`). No hay formato de guardado nuevo.

### Notas de la Fase J (sonido y caminos)

- `world.road` (u8 por casilla): < 80 nada, ≥ 80 sendero, ≥ 170 camino, 255 calzada. Sólo `wearRoad`/`decayRoad`/`paveRoad` lo cambian (marcan el chunk sucio únicamente al cambiar de categoría). En la partida va **al final del archivo**, tras los arrays de criaturas (`allViews` en `persistence/snapshot.ts`).
- El sonido (`src/audio/`) **no es simulación**: se alimenta de `FxLayer.onSound` (avisos visuales y partículas de trabajo/combate), de `civ.events` y de los comandos del jugador, todo cableado en `game.ts`. Añadir un sonido: id en `SoundId`, intervalo en `MIN_INTERVAL_MS`, receta en `RECIPES` (`sound.ts`) y su entrada en el mapa que toque (`sound-map.ts`).
- El `AudioContext` sólo existe tras el primer gesto del jugador; en las pruebas (Node) no hay WebAudio, por eso la lógica comprobable está en `sound-map.ts`.

### Notas de la Fase I (cultura, religión y clanes)

- Todo vive en `civ/society.ts`; `CivSystem` guarda `cultures`, `religions` y `clans` (ids = índices, nunca se borran) y cada criatura lleva `units.clan` (clan + 1; 0 = sin clan).
- Nombres y rasgos salen de `mix()` (`civ/names.ts`), sin consumir RNG. Sólo la asimilación y las conversiones tiran del azar (`ctx.rng`, dentro de `stepSociety`, al final de `runKingdomAi`).
- Añadir una tecnología: entrada en `TECHS`, `Tech` y `TECH_KNOWLEDGE`, una función `xxxBonus` y su uso en el punto de la simulación que mejore.
- Los arrays nuevos por criatura van **al final** de `UnitStore.dataViews()` y se declaran en `newerUnitViews` (`persistence/snapshot.ts`) para que las partidas antiguas carguen.
- El primer rey suele coronarse antes del primer censo (sin clan): `ensureKing` adopta su clan como casa reinante en la siguiente pasada.
- Equilibrio medido (256², 60 años, las cuatro semillas de siempre): 620–700 habitantes y 6–8 reinos vivos; las culturas llegan a 2–4 tecnologías; 4–7 religiones repartidas en 10–15 aldeas de 20–31; 0–2 rebeliones y 0–1 cambios de dinastía por mundo.

### Notas de la Fase H (para quien toque los monstruos)

- Añadir un monstruo: entrada en `SPECIES` con `monster(...)` (`entities/species.ts`), id en `Species` y `MONSTER_IDS`, dibujo en `render/monster-art.ts` (+ tamaño en `MONSTER_SCALE`), herramienta en `powers/tools.ts` y, si aparece solo, su regla en `ai/monster-spawn.ts`.
- `killUnit(ctx, i, causa, asesino?)` puede hacer aparecer un penante **en el mismo índice** que acaba de quedar libre: tras matar a una criatura no se puede volver a leer nada de ese índice.
- El reloj de «calma» de un monstruo es `units.cooldown` y el edificio que arrasa va en `units.work` (`world.size + id`), igual que los aldeanos con sus obras.
- Equilibrio medido (256², 60 años, semillas `islas`, `archipielago`, `costa-azul`, `mar-del-sur`): los cenagosos reducen la población final un 0–20 % y hacen abandonar alguna aldea, pero las cuatro razas sobreviven; sin yermo ni lava no hay penantes ni escorios salvo los caídos que se levantan. Una mancha de yermo de ~150 casillas junto a una aldea mantiene una horda de ~35 penantes (población un 30 % menor a los 40 años).

## 7. Arquitectura (`src/`, ~13 400 líneas)

```
core/        rng (sfc32 con semilla, fork/getState/setState), hash, time, clock (tick fijo), device (perfiles)
world/       terrain (Terrain 0–8, Biome 0–8, BIOME_INFO, Flora), world (arrays tipados), generator,
             vegetation, climate (estaciones y eras), noise
entities/    species, traits, units (UnitStore SoA con handles generacionales), spatial (hash espacial)
ai/          context, life, movement, animal-ai, monster-ai, monster-spawn, navigation, pathfinder (A* con presupuesto),
             sea-route, update
civ/         model, civ-system, planner, villager, combat, diplomacy, kingdoms, society (culturas, religiones, clanes), trade (mercaderes),
             boats, placement, names
powers/      brush, stroke, tools (pestañas), disasters, hazards, status
sim/         simulation (bucle de tick), commands (registro para replay), laws
persistence/ snapshot (formato MBX v6), validate, db (IndexedDB)
render/      renderer, camera, palette, pixel (Pix), creature-art, monster-art, building-art, flora-art, flora-layer,
             terrain-layer, civ-layer, boat-layer, fx, sprites
audio/       sound (motor WebAudio), sound-map (qué suena y cada cuánto)
ui/          hud, toolbar, inspector, laws-panel, menu, saves-panel, settings, start-menu, help,
             chronicle, toast, perf-panel, icons, tool-icons, dom
input/       gestures, pointer-input, keyboard
game.ts, save-controller.ts, main.ts
```

### Reglas que NO se pueden romper

- **Determinismo**. La simulación (core rng/hash/time, world, entities, ai, sim, civ, powers/brush) es determinista por semilla. ESLint lo impone en esos archivos: prohibido `Math.random`, `Math.sin/cos/pow`, `Date.now`, `performance.now` y prohibido importar desde `render/`, `ui/`, `input/` o `game.ts`. Usa los streams de RNG existentes (`rngAi` fork 1, `rngVeg` 2, `rngCmd` 3, populate 4, `rngPower` 5, `rngMonster` 6) o crea uno nuevo con `fork` (y añádelo **al final** de `Simulation.rngs()`, que es el orden en que se guardan). Render y UI sí pueden usar `Math.random`.
- **Tick fijo** 10 Hz (`TICK_MS` 100). `TICKS_PER_YEAR` = 600, mes = 50 ticks. Velocidades 0/1/2/5, máx. 8 ticks por frame.
- **Cualquier acción del jugador que cambie la simulación** va como comando en `sim/commands.ts` (se registran con su tick para el replay) y se aplica en `Simulation.apply`.
- **Guardado MBX v6**: `"MBX1"` + u32 longitud + cabecera JSON + arrays tipados alineados a 8 bytes, comprimido con gzip (CompressionStream). **Todo estado nuevo de simulación** debe añadirse a `persistence/snapshot.ts` (guardar y cargar), a `persistence/validate.ts` (validación de partidas importadas) y al `stateHash` correspondiente; si no, las partidas cargadas divergen. Si cambias el formato, sube `SAVE_VERSION` y añade migración (ya hay migraciones v1–v5→v6 y pruebas en `tests/persistence.test.ts`).
- **Mapa** en arrays tipados planos (índice = y·width + x). Modifica casillas con `setHeight`/`setBiome`/`setFlora`/`setGrass` (marcan chunks sucios para el render). Chunks 32×32, zonas de territorio 8×8, regiones = islas (`world.region`), mares (`world.sea`).
- **Criaturas**: `UnitStore` SoA; handle = gen·65536 + índice (gen 15 bits). Nunca guardes índices crudos entre ticks: usa handles y comprueba que siguen vivos.
- **Arte por código**: todo sprite se dibuja con `Pix` (`render/pixel.ts`, contorno automático) y se cachea en atlas. Nada de PNG externos.
- **Rendimiento**: objetivo cientos de unidades fluidas en Ryzen 7 / 8 GB y 30+ FPS en Android de gama media. Perfiles de dispositivo (bajo/medio/alto/ultra) ajustan tamaño de mapa, tope de unidades y DPR; hay calidad adaptativa. Repintados caros siempre con presupuesto por frame (ver `TERRAIN_CHUNKS_PER_FRAME`, `RENDERS_PER_FRAME` en flora-layer).
- **Móvil primero**: Chrome Android es prioritario. Tap, pellizco, pan con dos dedos, modo «Mover», sin conflicto pintar/mover. Botones ≥ 44 px, barra inferior plegable, HUD sin desbordes en pantallas estrechas.
- **Sin mecánicas a medias**: cada fase debe quedar jugable y sin romper las anteriores.

## 8. Flujo de trabajo de cada fase (repetirlo)

1. Diseñar la fase (anotar en `DESIGN.md`).
2. Implementar en módulos pequeños siguiendo el estilo existente (comentarios en español, mismo idioma de nombres).
3. Comprobar: `npx tsc --noEmit -p .`, `npx eslint .`, `npx vitest run`. Añadir pruebas para lo nuevo en `tests/`.
4. **Sondeo de equilibrio**: un test temporal que simule ~60 años en varias semillas (p. ej. `islas`, `archipielago`, `costa-azul`, `mar-del-sur`, mapa 256×256) y registre poblaciones. Vitest 5 oculta `console.log` de los tests que pasan: usa `--silent=false` o escribe a un archivo. **Borra el test temporal antes de `npm run build`** (tsc incluye `tests/`).
5. Probar en el navegador: `npx vite --port 5175 --strictPort`. En desarrollo existe `window.minibox` con `debugAdvance(ticks)`, `debugSim` y `debugCamera` para avanzar y revisar sin esperar.
6. Revisión de código (agente revisor) y corregir lo importante.
7. Actualizar `README.md`, `DESIGN.md` y la versión en `package.json`.
8. `npm run build:itch`.
9. Commit en español con prefijo convencional (`feat: …`, `fix: …`) y `git push origin main`. Comprobar que el `index-*.js` de `https://minibox-seven.vercel.app/` coincide con el de `dist/index.html`.
10. Informe final al usuario en español: qué se hizo, archivos tocados, cómo ejecutar en local, enlace de Vercel y el zip de itch.

## 9. Notas del entorno

- Windows con `core.autocrlf`: los avisos LF→CRLF de git son inofensivos.
- `.claude/` está en `.gitignore`/ignores de ESLint (worktrees de la app).
- El usuario no debe pegar contraseñas ni tokens de GitHub en el chat.
