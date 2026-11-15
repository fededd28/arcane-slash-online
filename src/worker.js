// Punto de entrada del Worker: reparte las conexiones WebSocket a la sala de juego.
// El juego (HTML/JS) lo sirve Cloudflare directamente desde la carpeta /public.
import { GameRoom } from './room.js';

export { GameRoom };

const MAX_ROOMS = 10; // el cliente tiene el mismo tope (MAX_ROOMS en index.html)

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

    if (url.pathname === '/health') return new Response('ok');
    return new Response('No encontrado', { status: 404 });
  }
};
