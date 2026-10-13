# CLAUDE.md — Guía para continuar MiniBox

Este archivo es el traspaso de contexto para cualquier sesión de Claude que trabaje en este proyecto. Léelo entero antes de tocar código. Para el diseño detallado, ver `DESIGN.md`; para el resumen jugable, `README.md`.

## 1. Qué es

**MiniBox**: simulador de dios 2D por píxeles para navegador (PC y móvil), inspirado en la *sensación* de WorldBox – God Simulator, pero 100 % original.

- **Prohibido** copiar nombre, logo, sprites, sonidos, UI o contenido de WorldBox. Todo el arte se genera por código (no hay imágenes externas).
- Razas propias: **Humanos**, **Silvanos** (bosque), **Petrinos** (montaña), **Colmilludos** (guerreros).
- Toda la interfaz y los textos en **español**. El usuario habla español: responde siempre en español.

## 2. Dónde está

| Qué | Dónde |
|---|---|
| Repositorio | `https://github.com/MrJota7474/minibox` (público, rama `main`) |
| Juego publicado | `https://minibox-seven.vercel.app/` (Vercel despliega solo con cada push a `main`) |
| Copia local del usuario | `C:\Users\sscri\Documents\minibox` (Windows 11) |
| Zips para itch.io | `release/minibox-<versión>-itch.zip` (no se suben al repo) |

Versión actual: **0.9.0**.

## 3. Cómo se ejecuta

```bash
npm install
npm run dev          # servidor de desarrollo (vite --host)
npm run build        # tsc --noEmit && vite build → dist/
npm run build:itch   # build + zip con index.html en la raíz → release/
npm test             # vitest run (203 pruebas, 17 archivos)
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

## 6. Qué falta (hoja de ruta elegida por el usuario, en este orden)

1. **Monstruos** — criaturas propias y peligrosas (p. ej. no-muertos, bestia de lava…) que atacan aldeas y nacen de desastres o biomas (el yermo maldito es buen candidato). Nada de criaturas icónicas de WorldBox.
2. **Cultura, religión y clanes** — rasgos culturales y tecnología; religión que afecte lealtad y diplomacia; clanes/linajes en la sucesión de reyes.
3. **Sonido y caminos** — efectos sintetizados con WebAudio (nada de archivos de audio copiados) con control de volumen; caminos entre edificios y aldeas.

Además, **en cada fase seguir mejorando el aspecto visual** (petición explícita del usuario: «cada vez que se vaya viendo mejor»).

Ideas abiertas: optimizar `tileColor` en `render/palette.ts` (~0,75 ms por chunk al repintar); en algún mundo los lobos se extinguen por azar (aceptado).

## 7. Arquitectura (`src/`, ~13 400 líneas)

```
core/        rng (sfc32 con semilla, fork/getState/setState), hash, time, clock (tick fijo), device (perfiles)
world/       terrain (Terrain 0–8, Biome 0–8, BIOME_INFO, Flora), world (arrays tipados), generator,
             vegetation, climate (estaciones y eras), noise
entities/    species, traits, units (UnitStore SoA con handles generacionales), spatial (hash espacial)
ai/          context, life, movement, animal-ai, navigation, pathfinder (A* con presupuesto), sea-route, update
civ/         model, civ-system, planner, villager, combat, diplomacy, kingdoms, boats, placement, names
powers/      brush, stroke, tools (pestañas), disasters, hazards, status
sim/         simulation (bucle de tick), commands (registro para replay), laws
persistence/ snapshot (formato MBX v3), validate, db (IndexedDB)
render/      renderer, camera, palette, pixel (Pix), creature-art, building-art, flora-art, flora-layer,
             terrain-layer, civ-layer, boat-layer, fx, sprites
ui/          hud, toolbar, inspector, laws-panel, menu, saves-panel, settings, start-menu, help,
             chronicle, toast, perf-panel, icons, tool-icons, dom
input/       gestures, pointer-input, keyboard
game.ts, save-controller.ts, main.ts
```

### Reglas que NO se pueden romper

- **Determinismo**. La simulación (core rng/hash/time, world, entities, ai, sim, civ, powers/brush) es determinista por semilla. ESLint lo impone en esos archivos: prohibido `Math.random`, `Math.sin/cos/pow`, `Date.now`, `performance.now` y prohibido importar desde `render/`, `ui/`, `input/` o `game.ts`. Usa los streams de RNG existentes (`rngAi` fork 1, `rngVeg` 2, `rngCmd` 3, populate 4, `rngPower` 5) o crea uno nuevo con `fork`. Render y UI sí pueden usar `Math.random`.
- **Tick fijo** 10 Hz (`TICK_MS` 100). `TICKS_PER_YEAR` = 600, mes = 50 ticks. Velocidades 0/1/2/5, máx. 8 ticks por frame.
- **Cualquier acción del jugador que cambie la simulación** va como comando en `sim/commands.ts` (se registran con su tick para el replay) y se aplica en `Simulation.apply`.
- **Guardado MBX v3**: `"MBX1"` + u32 longitud + cabecera JSON + arrays tipados alineados a 8 bytes, comprimido con gzip (CompressionStream). **Todo estado nuevo de simulación** debe añadirse a `persistence/snapshot.ts` (guardar y cargar), a `persistence/validate.ts` (validación de partidas importadas) y al `stateHash` correspondiente; si no, las partidas cargadas divergen. Si cambias el formato, sube `SAVE_VERSION` y añade migración (ya hay migraciones v1/v2→v3 y pruebas en `tests/persistence.test.ts`).
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
