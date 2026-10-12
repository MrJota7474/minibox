# MiniBox

Simulador de dios 2D por píxeles para el navegador, jugable en PC y en celular. Crea un mundo a partir de una semilla, pinta el terreno, siembra bosques y suelta animales para ver cómo el ecosistema se equilibra (o se desmorona).

**Jugar:** https://minibox-seven.vercel.app/ (PC y celular; se puede instalar como app)

> Proyecto original inspirado en el género «god game». No usa nombres, sprites, sonidos ni otros recursos de otros juegos.

## Estado

- **Fase A (MVP)** — mundo generado por ruido, pintar terreno y biomas, ovejas, conejos y lobos que comen, cazan, huyen, se reproducen y envejecen, control del tiempo (pausa, x1, x2, x5), controles de ratón, teclado y táctiles, PWA instalable.
- **Fase B (aldeas)** — cuatro razas (Humanos, Silvanos, Petrinos, Colmilludos) que fundan aldeas, reparten oficios, recogen comida, madera, piedra, hierro y oro, construyen y mejoran edificios, amplían su territorio y envían colonos. Búsqueda de caminos A*.
- **Fase C (reinos)** — reinos con capital, rey y personalidad; opinión entre reinos, guerras con ejércitos de guerreros (armas de hierro), conquista de aldeas, alianzas defensivas, treguas, rebeliones, sucesión y caída de reinos. Poderes de dios para forzar guerra, paz, alianza o rebelión, y crónica del mundo.

Ver [DESIGN.md](DESIGN.md) para el diseño completo y las próximas fases.

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
  ai/        ciclo de vida, comportamiento de animales, movimiento y A*
  civ/       aldeas, edificios, oficios, planificador y aldeanos
  sim/       Simulation (núcleo determinista) y comandos del jugador
  powers/    pinceles, herramientas y trazos
  render/    cámara, capa de terreno, sprites generados por código, renderer Canvas 2D
  input/     reconocedor de gestos, Pointer Events, teclado
  ui/        barra superior, barra de herramientas, inspector, menús
```

La simulación no depende de la interfaz y es determinista: la misma semilla y los mismos comandos producen exactamente el mismo mundo (hay una prueba que lo verifica con un hash del estado).

## Despliegue

- **Vercel:** importa el repositorio en vercel.com; `vercel.json` ya define `npm run build` y la carpeta `dist`. Cada push a `main` se despliega solo.
- **itch.io:** `npm run build:itch` y sube el `.zip` como juego HTML. Configuración recomendada: «This file will be played in the browser», viewport 960×600, *Mobile friendly* activado, *Fullscreen button* activado, *Automatically start on page load* activado.
