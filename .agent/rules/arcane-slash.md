---
trigger: always_on
---

# Arcane Slash Online — reglas para Antigravity

Juego `.io` 2D multijugador (guerreros brujos, arena 90×90, hasta 24 jugadores). Cliente en el navegador (Three.js por CDN)
y **servidor autoritativo**. Corre en dos lugares: **Cloudflare** (Workers + Durable Objects) y una **VM de Oracle**
(servidor Node, https://arcaneslash.duckdns.org). Repo: `https://github.com/fededd28/arcane-slash-online`, rama `main`.

## 1. Cómo hablar con el dueño
- El dueño **no programa**. Hablale en **español rioplatense**, corto y claro. Nada de párrafos largos ni jerga.
- Cada comando en su **propio bloque** de código (PowerShell, Windows). Un comando por bloque.
- Le gusta lo **simple y chico**. Si algo queda "gigante" o con "demasiada información", achicalo.
- Si algo es ambiguo, **preguntá antes** de hacerlo.
- Al terminar cada cambio decí: qué hiciste, qué probaste (y qué no), y qué falta (subir / publicar).

## 2. Antes de empezar cualquier tarea
- En este repo también trabaja **Claude Code desde otra PC**. Siempre empezá con `git pull` en `main` para no pisar cambios.
- Si hay cambios sin guardar de antes (`git status`), preguntá qué hacer con ellos.
- `CLAUDE.md` (en la raíz) tiene la misma información pensada para Claude; si algo de acá choca con eso, avisá al dueño.

## 3. Mapa del código (no leas todo: buscá por nombre)
| Archivo | Qué hay |
|---|---|
| `public/shared.js` | Reglas compartidas servidor/cliente: constantes, `SPELLS`, `SCORE`, `OBSTACLES`, `stepPlayerMovement`, `separatePair`, `PROTOCOL_VERSION`. **Cambiar acá afecta a los dos lados.** |
| `src/sim.js` | `class Game`: movimiento, `handleCast/handleMelee/handleInput`, daño, puntos (`registerKill`), orbes, bots (`updateBot`), `snapshotFor`. `MAX_PLAYERS`, `MIN_BOTS`, `BOT_TARGET_POPULATION`. |
| `src/room.js` | Sala de **Cloudflare** (Durable Object `GameRoom`): WebSockets, reloj de 20 ticks/s, límites de mensajes, `IDLE_KICK_MS`. |
| `src/room-node.js` + `oracle/server.ts` | Lo mismo pero para el servidor **Node de Oracle**. Si cambiás `src/room.js`, revisá si `room-node.js` necesita el mismo cambio. |
| `src/worker.js` | Entrada de Cloudflare: `/ws` → sala. Lo demás se sirve desde `public/`. |
| `public/index.html` (~140 KB) | **Todo el cliente** en un solo `<script type="module">`. Se edita directamente (no hay build). |
| `test/` | `sim-test.mjs` (reglas, sin red) y `e2e.mjs` (contra el servidor local). |

Dentro de `public/index.html` buscá por nombre: `drawWarlockFrame` / `createWarlockCharacter` (personajes), `spawn*FX` (animaciones),
`onSnapshot` / `reconcile` / `localStep` / `updateEntities` / `updateMe` (red y predicción), `castSelectedSpell`,
`refreshStartHelp` y `renderColorPicker` (pantalla de inicio), `frame` / `animate` (bucle), `<symbol id="ico-...">` (íconos SVG),
`I18N` (textos), `DEFAULT_BINDINGS` (teclas).

## 4. Cómo funciona por dentro
- El **servidor decide todo** (daño, puntos, orbes, bots). El navegador solo manda entradas:
  `join`, `in` (20/s: `seq,mx,my,bl,ph,dash`), `cast` (`id,x,y,rt,self`), `melee`, `ping`.
  El servidor responde `welcome`, `s` (snapshot), `lb` (clasificación), `pong`, `err`.
- Eventos en el snapshot (`ev`): `en`/`er` (entra/sale), `sp` (hechizo), `ms` (falló), `sl` (espadazo), `bk` (bloqueo), `po` (poción),
  `rs` (reaparece), `kl` (baja), `oc`/`op` (orbe tomado/nuevo). Mensajes para uno solo: `d: [{t:'toast'|'pet'|'death'}]`.
- **Predicción:** el cliente simula tu movimiento en pasos de 50 ms con el mismo código que el servidor y corrige con `me.ack`.
  Los demás se dibujan 100 ms atrás, interpolando. Los hechizos usan compensación de retraso (`rt`, hasta 300 ms).
- **Bots:** viven en el servidor. Completan la sala hasta 8 personajes; con 8 jugadores reales o más no queda ninguno.
- **Si cambian los mensajes cliente↔servidor:** subí `PROTOCOL_VERSION` en `public/shared.js`.
- **Idiomas (es/en):** todos los textos están en la tabla `I18N` de `public/index.html` (función `t(clave)`; en el HTML, `data-i18n`).
  Los avisos del servidor (`toast`) mandan una clave (`k`) y datos (`a`), no texto: la traducción `srv.<clave>` está en la tabla.
  **Todo texto nuevo va en los dos idiomas.**

## 5. Reglas del juego que NO se rompen sin preguntar
- Un hechizo que **falla no gasta maná**, pero deja una espera corta de **0,4 s** (`SPELL_MISS_INTERVAL`). Acertar activa el intervalo de 1,4 s.
- **No se puede petrificar a un petrificado.** Un petrificado **no se empuja**.
- Los hechizos **no esperan** a la poción; tras un hechizo la poción espera 0,3 s.
- **Celular:** controles táctiles (joystick, botones, arrastrar el hechizo hasta el rival), activados con `IS_TOUCH`.
  Cada botón de la barra muestra su espera con `setSlotCd`. Si tocás la barra, que siga andando en celular.
- **Teclas por defecto** (`DEFAULT_BINDINGS`): WASD mover, Espacio dash, R o clic derecho espadazo, Shift escudo, 1–4 hechizos,
  Q poción de vida, E poción de maná, Esc menú.
- El menú (Esc) **no pausa** el juego. El **maná solo se ve en el propio personaje**. Los efectos visuales son **chicos y cortos**.
- Panel de arriba a la izquierda: solo **Pantalla Completa** y **Menú**; el ping está adentro del menú.
  Hay elementos del HUD **ocultos** en los que el código escribe: **no los borres**.

## 6. Cómo hacer un cambio
1. `git pull`.
2. Buscá el lugar exacto (por nombre, ver sección 3). Cambiá lo mínimo; no reescribas archivos enteros ni reformatees.
3. **Si tocaste `public/shared.js` o `src/sim.js`:** corré `npm test` (tiene que decir `0 con fallas`). Si cambiaste una regla, agregá una prueba en `test/sim-test.mjs`.
4. **Si tocaste el cliente:** probalo en el navegador con `npm run dev` (http://localhost:8787). `wrangler dev` **no recarga `public/`**: reinicialo y recargá con `Ctrl + Shift + R`.
5. Si querés probar de punta a punta: con `npm run dev` andando, `node test/e2e.mjs`.
6. Commit (sección 7). Contale al dueño qué falta.

## 7. Git: commits, push y deploy
- **Commits: sí**, cuando el cambio está hecho y probado. Mensaje corto en español que diga qué cambió.
  Al final del mensaje: `Co-Authored-By: Antigravity` (no pongas a Claude).
- **`git push`: solo cuando el dueño lo pida.**
- **Publicar: solo cuando el dueño lo pida.** Son dos publicaciones **independientes**; preguntá a cuál (o a las dos):
  - Cloudflare: `npm run deploy` (hace falta aunque solo haya cambiado el navegador). La primera vez en esta PC: `npx wrangler login`.
  - Oracle: `.\oracle\deploy.ps1 -Key "$env:USERPROFILE\.ssh\antigravity-deploy"` (desde la carpeta del proyecto).
    Al final tiene que mostrar `active` y la respuesta de `/health`. Después revisá https://arcaneslash.duckdns.org.
- Orden normal cuando pide todo: `npm test` → commit → `git push` → deploy que haya pedido.
- Si `git push` falla porque hay cambios nuevos en GitHub: `git pull`, resolvé, probá de nuevo y recién ahí push.

Comandos (desde la carpeta del proyecto):
```
npm test
npm run dev
node test/e2e.mjs
git add . ; git commit -m "..." ; git push
npm run deploy
.\oracle\deploy.ps1 -Key "$env:USERPROFILE\.ssh\antigravity-deploy"
```

## 8. Servidor de Oracle (resumen)
- VM gratis en Chile (1 CPU, 1 GB RAM, Ubuntu, usuario `ubuntu`, IP `146.181.34.17`). Servicio `arcane` (systemd), puerto interno 8787, Caddy delante con HTTPS.
- Ver estado: `ssh -i "$env:USERPROFILE\.ssh\antigravity-deploy" -o BatchMode=yes ubuntu@146.181.34.17 "systemctl is-active arcane"`.
- Todo el detalle (firewalls, Caddy, agregar otro juego, trampas de PowerShell): `oracle/LEEME-VM.md`. **Leelo antes de tocar la VM.**
- **No pasar scripts por tubería a `ssh`** (PowerShell agrega un BOM y falla): escribirlos a archivo UTF-8 sin BOM, `scp` y `bash /tmp/script.sh`.
- Los pasos en páginas web (Oracle, DuckDNS) los hace el dueño: guialo paso a paso.

## 9. Seguridad
- **Nunca** pidas, pegues ni subas claves SSH, tokens o contraseñas. Las claves viven en `~\.ssh` y están en `.gitignore`.
- No cambies `.gitignore` para incluir claves ni archivos personales.

## 10. Qué ignorar / no tocar
- `node_modules/`, `.wrangler/`, `package-lock.json` (salvo que instales algo a propósito).
- `HISTORIAL.md`: es personal, **no está en git** (puede no existir en esta PC). No lo crees ni lo subas.
- `.claude/` (cosas de Claude Code) y las versiones viejas de un solo jugador en OneDrive: **no las toques**.
- No instales `node_modules` dentro de OneDrive.

## 11. Trampas conocidas
- Los archivos usan **fin de línea de Windows (CRLF)**. Si parchás con scripts, respetá el formato original; no metas caracteres raros (Git puede tomar el archivo como binario).
- `node -e` con comillas complicadas falla en PowerShell: usá un archivo `.mjs`.
- Si el puerto 8787 está ocupado por un proceso viejo, usá otro: `npx wrangler dev --port 8790` (y `node test/e2e.mjs ws://127.0.0.1:8790/ws`).
- PowerShell 5.1 no tiene `&&`: encadená con `;`.
