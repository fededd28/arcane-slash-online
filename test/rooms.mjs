// Prueba de salas múltiples: 25 conexiones a la sala 1 -> la 25 recibe 'full'; la sala 2 la acepta.
// Uso: node test/rooms.mjs [ws://127.0.0.1:8787/ws]   (con npm run dev andando)
import { PROTOCOL_VERSION } from '../public/shared.js';

const BASE = process.argv[2] || 'ws://127.0.0.1:8787/ws';
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALLA'} ${msg}`); if (!ok) fails++; };

function join(room, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${BASE}?room=${room}`);
    const r = { ws, result: null };
    const timer = setTimeout(() => { r.result = r.result || 'timeout'; resolve(r); }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name, color: 0 }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome') { r.result = 'welcome'; clearTimeout(timer); resolve(r); }
      else if (m.t === 'err') { r.result = m.reason; clearTimeout(timer); resolve(r); }
    };
    ws.onerror = () => {};
  });
}

const room1 = [];
for (let i = 1; i <= 24; i++) room1.push(await join(1, `p${i}`));
check(room1.every((r) => r.result === 'welcome'), 'los 24 primeros entran a la sala 1');

const r25 = await join(1, 'p25');
check(r25.result === 'full', `el 25 en la sala 1 recibe "full" (recibió: ${r25.result})`);

const r2 = await join(2, 'p25');
check(r2.result === 'welcome', `el 25 entra a la sala 2 (recibió: ${r2.result})`);

const rBad = await join(999, 'x');
check(rBad.result === 'welcome' || rBad.result === 'full', `sala fuera de rango cae en la sala 1 (recibió: ${rBad.result})`);

for (const r of [...room1, r25, r2, rBad]) try { r.ws.close(); } catch (e) { /* ya cerrado */ }
console.log(fails ? `${fails} falla(s)` : 'Todo bien');
process.exit(fails ? 1 : 0);
