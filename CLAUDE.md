# Arcane Slash Online — guía rápida para Claude

Juego `.io` 2D multijugador (guerreros brujos, arena 90×90, hasta 24 jugadores) en **Cloudflare Workers + Durable Objects**.
Cliente en el navegador (Three.js por CDN) y **servidor autoritativo**. El dueño no programa: explicale en español rioplatense,
corto y claro.

## Cómo trabajar con el dueño
- Respuestas **cortas**, en español. Cada comando en su **propio bloque** de código (PowerShell). Pocas explicaciones, sin sobrecargar.
- Le gusta lo **simple y chico**: cuando algo quedó "gigante" o con "demasiada información", se achica. Pregunta cuando algo es ambiguo.
- **Commits sí** (cuando el cambio está hecho y probado). **No subir (`git push`) ni publicar (`npm run deploy`) sin que lo pida.**
  Después de cada cambio, decile qué falta (subir / publicar).
- Probá antes de decir "listo" (ver Pruebas). Decí claro qué probaste y qué no.
- Mantené `HISTORIAL.md` al día si hay cambios importantes (está en `.gitignore` a propósito: **no se sube**).

## Comandos (desde `E:\arcane-slash-online`)
```
npm test          # 49 pruebas de las reglas del servidor (deben dar 0 fallas)
npm run dev       # servidor local en http://localhost:8787 (reiniciar para ver cambios de public/)
node test/e2e.mjs [ws://127.0.0.1:8787/ws]   # prueba de punta a punta (con npm run dev andando)
git add . && git commit -m "..." && git push
npm run deploy    # publica en Cloudflare (también hace falta si solo cambió el navegador)
```
Repo: `https://github.com/fededd28/arcane-slash-online` (rama `main`). Identidad de Git configurada **solo en este repo**.
Los commits llevan al final: `Co-Authored-By: Claude <noreply@anthropic.com>` (usá el modelo que corresponda).

## Mapa del código (no leas todo: usá `grep`)
| Archivo | Qué hay |
|---|---|
| `public/shared.js` | Reglas y mapa compartidos servidor/cliente: constantes, `SPELLS`, `SCORE`, `OBSTACLES`, `stepPlayerMovement`, `separatePair`, `PROTOCOL_VERSION`. **Cambiar acá afecta a los dos lados.** |
| `src/sim.js` | `class Game`: movimiento, `handleCast/handleMelee/handleInput`, daño, puntos (`registerKill`), orbes, bots (`updateBot`), `snapshotFor`. `MAX_PLAYERS`, `MIN_BOTS`, `BOT_TARGET_POPULATION`. |
| `src/room.js` | Durable Object `GameRoom`: WebSockets, reloj de 20 ticks/s, límites de mensajes, `IDLE_KICK_MS`. |
| `src/worker.js` | Entrada: `/ws` → sala. Todo lo demás lo sirve Cloudflare desde `public/`. |
| `public/index.html` (~140 KB) | Cliente completo en un solo `<script type="module">`. **Se edita directamente.** |
| `test/` | `sim-test.mjs` (reglas, sin red) y `e2e.mjs` (contra el servidor local). |

Dentro de `public/index.html`, buscá por nombre: `drawWarlockFrame` / `createWarlockCharacter` (personajes), `spawn*FX` (animaciones),
`onSnapshot` / `reconcile` / `localStep` / `updateEntities` / `updateMe` (red y predicción), `castSelectedSpell`, `refreshStartHelp` y
`renderColorPicker` (pantalla de inicio), `frame` / `animate` (bucle), `#icons` / `<symbol id="ico-...">` (íconos SVG).

## Cómo funciona (lo que no se ve en el código)
- El **servidor decide todo** (daño, puntos, orbes, bots). El navegador solo manda entradas: `join`, `in` (20/s: `seq,mx,my,bl,ph,dash`),
  `cast` (`id,x,y,rt,self`), `melee`, `ping`. Responde con `welcome`, `s` (snapshot), `lb` (clasificación), `pong`, `err`.
- Eventos en el snapshot (`ev`): `en`/`er` (entra/sale), `sp` (hechizo), `ms` (falló), `sl` (espadazo), `bk` (bloqueo), `po` (poción),
  `rs` (reaparece), `kl` (baja), `oc`/`op` (orbe tomado/nuevo). Mensajes solo para uno: `d: [{t:'toast'|'pet'|'death'}]`.
- **Predicción:** el cliente simula tu movimiento en pasos de 50 ms con el mismo código que el servidor y reconcilia con `me.ack`.
  Los demás se dibujan 100 ms atrás, interpolando. Los hechizos usan compensación de retraso (`rt`, hasta 300 ms).
- Los **bots** viven en el servidor; con 8 jugadores reales o más no queda ninguno. Con menos de 8 personajes se completan.
- Si cambian los mensajes cliente↔servidor: subir `PROTOCOL_VERSION` en `shared.js`.

## Reglas vigentes que NO hay que romper sin preguntar
- Un hechizo que **falla no gasta maná** (sí respeta el intervalo de 1,4 s). No se puede **petrificar a un petrificado**.
- Los hechizos **no esperan** a la poción; tras un hechizo la poción espera 0,3 s. Un petrificado **no se empuja**.
- El menú (Esc) **no pausa** el juego. El **maná solo se ve en el propio personaje**. Los efectos visuales son **chicos y cortos**.
- Panel de arriba a la izquierda: solo **Pantalla Completa, Menú y ping** (los demás elementos existen ocultos: el código escribe en ellos,
  **no los borres**). Valores y fórmulas completos: `public/shared.js` y `HISTORIAL.md`.

## Pruebas y trampas conocidas
- **Siempre `npm test`** tras tocar `shared.js` o `sim.js`. Si cambiás reglas, agregá una prueba.
- **`wrangler dev` no recarga `public/`**: reiniciarlo y recargar con `Ctrl + Shift + R`.
- **La vista previa del navegador de la app suele estar oculta y dibuja <1 cuadro/s.** Para probar el cliente, exponé `window.__arcane`
  (ya existe: `frame(dt)`, `fx`, `net`, `ents`, `pred`...) y avanzá los cuadros a mano con `__arcane.frame(0.05)`. Las capturas pueden ir
  un paso atrasadas: pedí dos.
- En PowerShell/Git Bash las rutas cambian (`E:\...` vs `/e/...`); `node -e` con comillas complicadas falla: usá un archivo `.mjs`.
- **No matar procesos por nombre** (el sistema lo bloquea): para procesos propios usá `TaskStop`. Pueden quedar `workerd` huérfanos de
  pruebas viejas en puertos 8787/8790/8792; usá otro puerto.
- **No instalar `node_modules` dentro de OneDrive.** Esta carpeta (`E:`) está fuera de OneDrive a propósito.

## Dónde está lo demás
- `README.md`: cómo probar y publicar. `HISTORIAL.md` (solo local): estado actual, línea de tiempo y pendientes.
- Versiones de **un solo jugador** (archivos HTML sueltos) en `C:\Users\fede_\OneDrive\Documents\juego en 2d` (`..._con_las_mejoras.html`
  es la más nueva). **No las toques** salvo que lo pida: el juego vivo es esta carpeta.
- `C:\Users\fede_\OneDrive\Documents\juego en 2d\arcane-slash-online` es una **copia de apoyo** vieja de este repo (puede ir atrasada).
- Guía de comandos de Git y Cloudflare para juegos nuevos: `Guia de comandos - Git y Cloudflare.md` (carpeta `juego en 2d`).
