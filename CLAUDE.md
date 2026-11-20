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
npm test          # 51 pruebas de las reglas del servidor (deben dar 0 fallas)
npm run dev       # servidor local en http://localhost:8787 (reiniciar para ver cambios de public/)
node test/e2e.mjs [ws://127.0.0.1:8787/ws]   # prueba de punta a punta (con npm run dev andando)
git add . && git commit -m "..." && git push
npm run deploy    # publica en Cloudflare (también hace falta si solo cambió el navegador)
.\oracle\deploy.ps1   # publica en la máquina de Oracle (https://arcaneslash.duckdns.org); es otro deploy, independiente del de Cloudflare
```
**Publicar "en ambos"** (cuando lo pida): no hace falta leer los scripts, ya están revisados. Desde una rama de trabajo: `git push origin HEAD:main`,
después en `E:\arcane-slash-online` (ahí está `node_modules`): `git pull --ff-only`, `npm run deploy` y `.\oracle\deploy.ps1` (empaqueta `public/` y `src/`,
lo sube por SSH y reinicia el servicio; termina con `active` y `ok`). Para comprobar: bajar `/shared.js` de los dos sitios y ver el valor cambiado.
Links para jugar: Cloudflare `https://arcane-slash.fededd28.workers.dev/` (**el link único que se reparte**) · Oracle `https://arcaneslash.duckdns.org` (respaldo).
La página elige sola el servidor (ping + gente vía `/status` de cada uno; South America = Oracle, North America = Cloudflare; desplegable en el inicio;
cambia solo si uno no conecta/se cae/tiene ping alto). Lógica en `public/index.html` (`SERVER_HOSTS`, `autoPick`, `switchServer`). Hay que publicar en ambos.
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
- **Idiomas (es/en):** todos los textos están en la tabla `I18N` de `public/index.html` (función `t(clave)`; en el HTML, `data-i18n`). Se elige por el idioma del navegador y hay botón 🌐. Los avisos del servidor (`toast`) mandan una clave (`k`) y datos (`a`), no texto: la traducción `srv.<clave>` está en la tabla. Todo texto nuevo va en los dos idiomas.

## Reglas vigentes que NO hay que romper sin preguntar
- Un hechizo que **falla no gasta maná**, pero deja una **espera corta de 0,4 s** (`SPELL_MISS_INTERVAL`; si fuera 0 se podría ametrallar:
  80 efectos/s para todos y apuntar gratis a fuerza bruta). Acertar sí activa el intervalo de 1,2 s. No se puede **petrificar a un petrificado**.
- Los hechizos **no esperan** a la poción; tras un hechizo la poción espera 0,3 s. Un petrificado **no se empuja**.
- **Celular:** hay controles táctiles (joystick, botones, arrastrar el hechizo hasta el rival). Se activan con `IS_TOUCH` (puntero principal
  táctil; una notebook con pantalla táctil y mouse usa la interfaz de escritorio). Cada botón de la barra (hechizos, espada, pociones, dash)
  muestra su espera con `setSlotCd`.
- **Controles por defecto** (`DEFAULT_BINDINGS` en `public/index.html`): WASD mover, Espacio dash, **R** o clic derecho espadazo, Shift escudo,
  1–4 hechizos, **Q** poción de vida y **E** poción de maná, Esc menú. Quien ya guardó sus teclas conserva las suyas hasta usar
  "Restaurar controles" en el menú.
- El menú (Esc) **no pausa** el juego. El **maná solo se ve en el propio personaje**. Los efectos visuales son **chicos y cortos**.
- Panel de arriba a la izquierda: solo **Pantalla Completa y Menú**; el **ping** se muestra adentro del menú (los demás elementos existen ocultos: el código escribe en ellos,
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
- **Los archivos de trabajo usan fin de línea de Windows (CRLF).** Al parchear con scripts, convertí a LF antes de buscar texto de varias
  líneas y escribí con el formato original; si no, la búsqueda no coincide. No lo compruebes con `grep` en Git Bash (no lo detecta bien):
  leé el archivo con `node` y fijate si contiene el par de caracteres retorno de carro + salto de línea. No escribas esos caracteres
  en los textos que insertás (rompe el archivo: Git lo toma como binario).
- **No instalar `node_modules` dentro de OneDrive.** Esta carpeta (`E:`) está fuera de OneDrive a propósito.

## Dónde está lo demás
- `README.md`: cómo probar y publicar. `HISTORIAL.md` (solo local): estado actual, línea de tiempo y pendientes.
- Versiones de **un solo jugador** (archivos HTML sueltos) en `C:\Users\fede_\OneDrive\Documents\juego en 2d` (`..._con_las_mejoras.html`
  es la más nueva). **No las toques** salvo que lo pida: el juego vivo es esta carpeta.
- `C:\Users\fede_\OneDrive\Documents\juego en 2d\arcane-slash-online` es una **copia de apoyo** vieja de este repo (puede ir atrasada).
- **Servidor de Oracle** (VM gratis en Chile; mismo juego pero con servidor Node: `oracle/server.ts` + `src/room-node.js`, comparten `public/` y `src/sim.js`).
  Se sube con `.\oracle\deploy.ps1` (hay que pedirlo: no publicar sin que lo pida). Si cambia `src/room.js` (Cloudflare), revisar si `src/room-node.js` necesita lo mismo.
  Cómo está armada la máquina, los firewalls y cómo agregar otro juego: `oracle/LEEME-VM.md` (ahora va en git; sin claves; copia en `juego en 2d\Guia - Servidor Oracle.md`).
- Guía de comandos de Git y Cloudflare para juegos nuevos: `Guia de comandos - Git y Cloudflare.md` (carpeta `juego en 2d`).
