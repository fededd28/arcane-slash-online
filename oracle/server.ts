import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { GameRoom } from '../src/room-node.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = '0.0.0.0';

const app = express();
const MAX_ROOMS = 10;
const rooms = new Map<number, GameRoom>();

function getRoom(n: number): GameRoom {
  const id = Number.isInteger(n) && n >= 1 && n <= MAX_ROOMS ? n : 1;
  let room = rooms.get(id);
  if (!room) {
    room = new GameRoom();
    rooms.set(id, room);
  }
  return room;
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((_req, res) => {
  res.status(404).send('No encontrado');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/ws', `http://localhost:${PORT}`);
  const n = parseInt(url.searchParams.get('room') || '1', 10);
  getRoom(n).handleConnection(ws);
});

server.listen(PORT, HOST, () => {
  console.log(`Arcane Slash Online listening on http://${HOST}:${PORT}`);
});
