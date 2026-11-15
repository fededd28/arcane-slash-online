// Punto de entrada del Worker: reparte las conexiones WebSocket a la sala de juego.
// El juego (HTML/JS) lo sirve Cloudflare directamente desde la carpeta /public.
import { GameRoom } from './room.js';

export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba una conexión WebSocket', { status: 426 });
      }
      // Una sola sala global. Para tener varias salas, se puede elegir el nombre según la URL.
      const id = env.ROOM.idFromName('main');
      return env.ROOM.get(id).fetch(request);
    }

    if (url.pathname === '/health') return new Response('ok');
    return new Response('No encontrado', { status: 404 });
  }
};
