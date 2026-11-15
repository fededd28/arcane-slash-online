# Arcane Slash Online

Versión online de Arcane Slash para Cloudflare: el juego (HTML/JS) se sirve como archivos estáticos
y una **sala de juego** (Durable Object) corre las reglas y habla con los jugadores por WebSocket.

```
public/            lo que se descarga en el navegador
  index.html       el cliente: dibuja, lee el teclado/mouse y se conecta a la sala
  shared.js        reglas y mapa que usan igual el servidor y el cliente
src/
  worker.js        puerta de entrada (/ws -> sala)
  room.js          la sala: WebSockets + reloj del juego (20 veces por segundo)
  sim.js           las reglas del juego (combate, puntos, orbes, bots)
test/sim-test.mjs  pruebas automáticas de las reglas
wrangler.toml      configuración de Cloudflare
```

## 1. Probarlo en tu computadora

Necesitás Node.js 18 o más nuevo.

```bash
npm install
npm test            # pruebas de las reglas del servidor
npm run dev         # abre http://localhost:8787
```

Abrí `http://localhost:8787` en dos pestañas para ver a dos jugadores en la misma sala.

> **Importante:** esta carpeta está dentro de OneDrive. `npm install` crea una carpeta `node_modules`
> con miles de archivos que OneDrive intentaría sincronizar. Lo mejor es copiar el proyecto a una carpeta
> fuera de OneDrive (por ejemplo `C:\proyectos\arcane-slash-online`) y trabajar ahí.

## 2. Publicarlo en Cloudflare

1. Tené una cuenta de Cloudflare (alcanza con la gratuita para empezar).
2. Iniciá sesión desde la terminal (se abre el navegador para autorizar):
   ```bash
   npx wrangler login
   ```
3. Publicá:
   ```bash
   npm run deploy
   ```
4. Wrangler te muestra la dirección, algo como `https://arcane-slash.TU-USUARIO.workers.dev`.
   Abrila y listo: cualquiera con ese link entra a la misma sala.

Para usar tu propio dominio: Cloudflare -> Workers & Pages -> `arcane-slash` -> Settings -> Domains & Routes.

## 3. Cómo funciona

- **El servidor decide todo**: movimiento, daño, puntos, orbes y bots. El navegador solo envía lo que apretás.
- **Tu personaje responde al instante**: el navegador calcula tu movimiento en pasos de 50 ms (igual que el servidor)
  y el servidor lo confirma; si hay una diferencia, se corrige suavemente.
- **Los demás se ven suaves**: se dibujan 100 ms en el pasado, interpolando entre los últimos estados recibidos.
- **Apuntar con retraso**: al lanzar un hechizo el navegador avisa qué instante estaba viendo, y el servidor
  revisa dónde estaba el rival en ese momento (compensación de retraso, hasta 300 ms).
- **Bots**: completan la sala hasta unos 8 personajes; al entrar humanos, salen bots.
- **Capacidad**: hasta 24 jugadores en una sola sala (`MAX_PLAYERS` en `src/sim.js`).

## 4. Costos y límites (revisalo en tu panel antes de abrirlo al público)

La sala usa Durable Objects. Mientras hay jugadores conectados, la sala está "despierta" y se cobra por
tiempo de ejecución y por mensajes. Cada jugador envía 20 mensajes por segundo (los entrantes cuentan,
en proporción 20 a 1, como pedidos). Los precios y límites gratuitos cambian: consultá
<https://developers.cloudflare.com/durable-objects/platform/pricing/> y tu plan actual.

Cuando no queda ningún jugador conectado, el reloj de la sala se detiene.

## 5. Ajustes comunes

| Qué | Dónde |
|---|---|
| Daño, maná, cooldowns, puntos | `public/shared.js` |
| Cantidad de bots / jugadores máximos | `src/sim.js` (`BOT_TARGET_POPULATION`, `MAX_PLAYERS`) |
| Frecuencia de actualización | `public/shared.js` (`TICK_RATE`) |
| Nombre de la sala (para tener varias) | `src/worker.js` (`idFromName('main')`) |

Si cambiás algo de `public/shared.js` o del protocolo (mensajes entre navegador y servidor), subí el número
`PROTOCOL_VERSION` en `public/shared.js`: así los navegadores viejos reciben un aviso para recargar en vez de fallar.
