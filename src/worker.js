// Punto de entrada del Worker: reparte las conexiones WebSocket a la sala de juego.
// El juego (HTML/JS) lo sirve Cloudflare directamente desde la carpeta /public.
import { GameRoom } from './room.js';

export { GameRoom };

const MAX_ROOMS = 10; // el cliente tiene el mismo tope (MAX_ROOMS en index.html)
let statusCache = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba una conexión WebSocket', { status: 426 });
      }
      // Varias salas: el cliente pide ?room=N y, si la sala está llena, prueba la siguiente.
      // La sala 1 conserva el nombre 'main' (la de siempre).
      const n = parseInt(url.searchParams.get('room') || '1', 10);
      const room = Number.isInteger(n) && n >= 1 && n <= MAX_ROOMS ? n : 1;
      const id = env.ROOM.idFromName(room === 1 ? 'main' : `room-${room}`);
      return env.ROOM.get(id).fetch(request);
    }

    // Cuántos jugadores reales hay (lo usa el navegador para elegir servidor). Se suman las salas en orden
    // hasta encontrar una vacía y se guarda 10 s para no despertar las salas en cada visita.
    if (url.pathname === '/status') {
      const now = Date.now();
      if (!statusCache || now - statusCache.t > 10000) {
        let players = 0;
        for (let r = 1; r <= MAX_ROOMS; r++) {
          const id = env.ROOM.idFromName(r === 1 ? 'main' : `room-${r}`);
          const res = await env.ROOM.get(id).fetch(new Request(`${url.origin}/status`));
          const n = parseInt(await res.text(), 10) || 0;
          players += n;
          if (n === 0) break;
        }
        statusCache = { t: now, players };
      }
      return new Response(JSON.stringify({ players: statusCache.players }), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
      });
    }

    if (url.pathname === '/health') return new Response('ok');
    return new Response('No encontrado', { status: 404 });
  }
};
