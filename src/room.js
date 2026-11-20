// ============================================================================
// ARCANE SLASH ONLINE - sala de juego (Durable Object de Cloudflare)
// Una sola sala global: corre la simulación y habla con los jugadores por WebSocket.
// ============================================================================
import { Game, MAX_PLAYERS } from './sim.js';
import { TICK_DT, PROTOCOL_VERSION } from '../public/shared.js';

const MAX_MESSAGE_BYTES = 2048;
const MAX_MESSAGES_PER_SECOND = 90;
const LEADERBOARD_EVERY_TICKS = 5;
const IDLE_KICK_MS = 180000; // 3 minutos sin enviar movimiento (pestaña en segundo plano o minimizada): se lo saca de la sala

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.game = new Game();
    this.sessions = new Set();
    this.timer = null;
    this.lastTime = 0;
    this.acc = 0;
  }

  async fetch(request) {
    // Consulta interna del Worker (/status): cuántos jugadores reales hay en esta sala
    if (new URL(request.url).pathname === '/status') {
      return new Response(String(this.game.humans()));
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se esperaba una conexión WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const session = { ws: server, id: 0, joined: false, count: 0, windowStart: Date.now(), lastInput: Date.now() };
    this.sessions.add(session);
    server.addEventListener('message', (evt) => this.onMessage(session, evt.data));
    server.addEventListener('close', () => this.onClose(session));
    server.addEventListener('error', () => this.onClose(session));

    return new Response(null, { status: 101, webSocket: client });
  }

  send(session, obj) {
    try {
      session.ws.send(JSON.stringify(obj));
    } catch (err) {
      this.onClose(session);
    }
  }

  onMessage(session, data) {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return;

    // Límite de mensajes por segundo para que nadie sature la sala
    const now = Date.now();
    if (now - session.windowStart >= 1000) { session.windowStart = now; session.count = 0; }
    if (++session.count > MAX_MESSAGES_PER_SECOND) return;

    let m;
    try { m = JSON.parse(data); } catch (err) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'ping') {
      this.send(session, { t: 'pong', c: m.c, st: Math.round(this.game.time * 1000) });
      return;
    }

    if (m.t === 'join') {
      if (session.joined) return;
      if (m.v !== PROTOCOL_VERSION) {
        this.send(session, { t: 'err', reason: 'version' });
        session.ws.close(1000, 'version');
        return;
      }
      if (this.game.humans() >= MAX_PLAYERS) {
        this.send(session, { t: 'err', reason: 'full' });
        session.ws.close(1000, 'full');
        return;
      }
      const ent = this.game.addPlayer(m.name, m.color);
      session.id = ent.id;
      session.joined = true;
      session.lastInput = now;
      this.send(session, this.game.welcomeFor(ent.id));
      this.startLoop();
      return;
    }

    if (!session.joined) return;
    if (m.t === 'in') { session.lastInput = now; this.game.handleInput(session.id, m); }
    else if (m.t === 'cast') this.game.handleCast(session.id, m);
    else if (m.t === 'melee') this.game.handleMelee(session.id);
  }

  onClose(session) {
    if (!this.sessions.delete(session)) return;
    if (session.joined) this.game.removePlayer(session.id);
    try { session.ws.close(); } catch (err) { /* ya cerrado */ }
    if (this.sessions.size === 0) this.stopLoop();
  }

  startLoop() {
    if (this.timer) return;
    this.lastTime = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => this.step(), 25);
  }

  stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  step() {
    const now = Date.now();
    this.acc += Math.min(0.25, (now - this.lastTime) / 1000);
    this.lastTime = now;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 3) {
      this.acc -= TICK_DT;
      steps++;
      this.game.update(TICK_DT);
      this.broadcast();
    }
    if (steps === 3) this.acc = 0;

    // Cada tanto se saca a quien no está jugando
    if (now - (this.lastIdleCheck || 0) > 5000) {
      this.lastIdleCheck = now;
      for (const s of [...this.sessions]) {
        if (s.joined && now - s.lastInput > IDLE_KICK_MS) {
          this.send(s, { t: 'err', reason: 'idle' });
          try { s.ws.close(1000, 'idle'); } catch (err) { /* ya cerrado */ }
          this.onClose(s);
        }
      }
    }
  }

  broadcast() {
    const g = this.game;
    const lb = g.tick % LEADERBOARD_EVERY_TICKS === 0 ? JSON.stringify(g.leaderboardMsg()) : null;
    for (const s of this.sessions) {
      if (!s.joined) continue;
      try {
        s.ws.send(JSON.stringify(g.snapshotFor(s.id)));
        if (lb) s.ws.send(lb);
      } catch (err) { /* se limpia en el evento close */ }
    }
    g.flush();
  }
}
