// Prueba de punta a punta contra un servidor en marcha (npm run dev):
//   node test/e2e.mjs [ws://127.0.0.1:8787/ws]
import { PROTOCOL_VERSION, BASE_SPEED, TICK_DT } from '../public/shared.js';

const URL = process.argv[2] || 'ws://127.0.0.1:8787/ws';
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${name} ${cond ? '' : extra}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, color) {
  const c = { name, snaps: [], welcome: null, pongs: 0, lb: null, id: 0, seq: 0, closed: false, errs: [] };
  c.ws = new WebSocket(URL);
  c.ws.onopen = () => c.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, name, color }));
  c.ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') { c.welcome = m; c.id = m.id; }
    else if (m.t === 's') c.snaps.push(m);
    else if (m.t === 'pong') c.pongs++;
    else if (m.t === 'lb') c.lb = m;
    else if (m.t === 'err') c.errs.push(m.reason);
  };
  c.ws.onclose = () => { c.closed = true; };
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.input = (o) => c.send({ t: 'in', seq: ++c.seq, mx: 0, my: 0, bl: 0, ph: 0, dash: 0, ...o });
  c.last = () => c.snaps[c.snaps.length - 1];
  c.meEntry = () => { const s = c.last(); return s && s.p.find((r) => r[0] === c.id); };
  return c;
}

console.log('Conexión');
const a = client('Ana', 1);
const b = client('Beto', 2);
await sleep(1200);
check('Ana recibió la bienvenida', !!a.welcome && a.id > 0);
check('Beto recibió la bienvenida', !!b.welcome && b.id > 0 && b.id !== a.id);
check('la bienvenida trae 48 orbes y a los personajes', a.welcome.orbs.length === 48 && a.welcome.ents.length >= 8);
check('llegan snapshots (~20 por segundo)', a.snaps.length >= 15, `n=${a.snaps.length}`);
check('Ana ve a Beto en la lista', a.welcome.ents.some((e) => e.name === 'Beto') || a.snaps.some((s) => s.ev.some((e) => e[0] === 'en' && e[1].name === 'Beto')));
a.send({ t: 'ping', c: 123 });
await sleep(200);
check('el ping responde', a.pongs === 1);

console.log('Movimiento');
const before = a.meEntry();
const t0 = Date.now();
for (let i = 0; i < 20; i++) { a.input({ mx: 1 }); await sleep(50); }
await sleep(250);
const after = a.meEntry();
const dx = after[1] - before[1];
const expected = BASE_SPEED * TICK_DT * 20;
check(`Ana avanzó ~${expected.toFixed(1)} unidades (o chocó con un borde)`, dx > 2 || after[1] > 40, `dx=${dx}`);
check('el servidor confirma mis pasos (ack)', a.last().me.ack >= 18, `ack=${a.last().me.ack}`);
check('Beto ve la nueva posición de Ana', (() => { const r = b.last().p.find((x) => x[0] === a.id); return r && Math.abs(r[1] - after[1]) < 0.6; })());

console.log('Reglas básicas');
const me = a.last().me;
check('mi snapshot trae mi maná y el de los demás está oculto', b.last().p.filter((r) => r[0] !== b.id).every((r) => r[5] === -1) && me.mp === 300);
const castFrom = a.snaps.length;
a.send({ t: 'cast', id: 3, x: 0, y: 0, rt: Date.now() });
await sleep(500);
check('lanzar un hechizo da respuesta (golpe, falla o aviso) y gasta maná', a.snaps.slice(castFrom).some((s) => (s.d || []).length || s.ev.some((e) => e[0] === 'ms' || e[0] === 'sp')) && a.last().me.mp < 300);
a.send({ t: 'cast', id: 99, x: 0, y: 0 });
a.send({ t: 'in', seq: 'x', mx: 'basura', my: null });
a.ws.send('esto no es json');
a.ws.send('x'.repeat(5000));
await sleep(300);
check('mensajes inválidos no cortan la conexión', !a.closed);

console.log('Salida');
b.ws.close();
await sleep(500);
const lastA = a.last();
check('cuando Beto sale, Ana lo ve irse', a.snaps.some((s) => s.ev.some((e) => e[0] === 'er' && e[1] === b.id)));
const c = client('Caro', 4);
await sleep(600);
check('una persona nueva entra sin problemas', !!c.welcome && c.snaps.length > 3);
a.ws.close(); c.ws.close();
await sleep(300);

console.log(failed ? `\n${failed} con fallas` : '\nTodo bien');
process.exit(failed ? 1 : 0);
