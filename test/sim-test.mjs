// Pruebas de las reglas del servidor (sin Cloudflare): node test/sim-test.mjs
import { Game, sanitizeName } from '../src/sim.js';
import { TICK_DT, MAX_HP, MAX_MP, SPELLS, MELEE_DAMAGE, POTION_HP_AMOUNT, POTION_COOLDOWN_TOTAL, BASE_SPEED, RESPAWN_TIME } from '../public/shared.js';

let failed = 0;
let passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FALLA ${name} ${extra}`); }
}

// Un mundo vacío de bots y orbes para probar reglas puntuales
function arena() {
  const g = new Game();
  for (const e of [...g.entities.values()]) if (e.isBot) g.entities.delete(e.id);
  g.ensureBots = () => {};
  g.orbs.forEach((o) => { o.active = false; o.respawnAt = 1e9; });
  g.events = [];
  return g;
}
const place = (e, x, y) => { e.x = x; e.y = y; e.hist = []; };
const run = (g, secs) => { for (let i = 0; i < Math.round(secs / TICK_DT); i++) g.update(TICK_DT); };
const inp = (g, id, o, n = 1) => { for (let i = 0; i < n; i++) g.handleInput(id, { seq: ++g.__seq, mx: 0, my: 0, bl: 0, ph: 0, ...o }); };

console.log('Nombres');
check('limpia caracteres peligrosos', sanitizeName('<b>Fede</b>&"') === 'bFede/b', sanitizeName('<b>Fede</b>&"'));
check('recorta a 14 y usa Jugador si está vacío', sanitizeName('x'.repeat(40)).length === 14 && sanitizeName('   ') === 'Jugador');

console.log('Movimiento');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0);
  place(a, 0, 0);
  for (let i = 0; i < 20; i++) { inp(g, a.id, { mx: 1 }); g.update(TICK_DT); }
  check('20 pasos a la derecha avanzan ~5.2 unidades', Math.abs(a.x - BASE_SPEED * TICK_DT * 20) < 0.05, `x=${a.x}`);
  check('el ack coincide con el último paso', a.ack === g.__seq);
  // exceso de entradas (trampa): no deben dejar avanzar más rápido
  const x0 = a.x;
  for (let i = 0; i < 100; i++) inp(g, a.id, { mx: 1 });
  check('mandar 100 entradas de golpe no multiplica la velocidad', a.x - x0 < BASE_SPEED * TICK_DT * 6, `delta=${a.x - x0}`);
  // dash
  place(a, 0, 0); a.dashCd = 0; run(g, 1); a.budget = 4;
  inp(g, a.id, { mx: 1, dash: 1 }, 1);
  check('el dash arranca y queda en cooldown', a.dashT > 0 && a.dashCd > 9);
}

console.log('Hechizos');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1);
  place(a, 0, 0); place(b, 5, 0);
  g.update(TICK_DT);
  g.handleCast(a.id, { id: 2, x: 5, y: 0.3, rt: g.time * 1000 });
  check('Descarga Espectral hace 45 de daño', b.hp === MAX_HP - 45, `hp=${b.hp}`);
  check('gasta maná y empieza el intervalo', a.mp === MAX_MP - 50 && a.spellCd > 1.3);
  const hp1 = b.hp;
  g.handleCast(a.id, { id: 2, x: 5, y: 0.3, rt: g.time * 1000 });
  check('no se puede lanzar otro durante el intervalo', b.hp === hp1);
  check('el hechizo también bloquea la poción un instante', a.potCd > 0.2);
  run(g, 1.5);
  // petrificar
  g.handleCast(a.id, { id: 1, x: 5, y: 0.3, rt: g.time * 1000 });
  check('Petrificar inmoviliza 6 s', b.imm > 5.5, `imm=${b.imm}`);
  run(g, 1.5);
  const mp = a.mp;
  g.handleCast(a.id, { id: 1, x: 5, y: 0.3, rt: g.time * 1000 });
  check('no se puede petrificar a un petrificado (sin gastar maná)', a.mp === mp);
  // disipar al otro
  run(g, 1.5);
  g.handleCast(a.id, { id: 4, x: 5, y: 0.3, rt: g.time * 1000 });
  check('Disipar le saca la petrificación', b.imm === 0);
  // fallar
  run(g, 1.5);
  const hp2 = b.hp;
  const mpAntes = a.mp;
  g.handleCast(a.id, { id: 2, x: 12, y: 3, rt: g.time * 1000 });
  check('un clic fuera del cuerpo falla y no daña', b.hp === hp2 && g.events.some((e) => e[0] === 'ms'));
  check('un fallo NO gasta maná', a.mp === mpAntes, 'mp=' + a.mp + ' antes=' + mpAntes);
  check('un fallo deja una espera corta (no el intervalo completo)', a.spellCd > 0.3 && a.spellCd < 0.5, 'spellCd=' + a.spellCd);
  {
    // Ametrallar: 10 fallos seguidos en el mismo instante
    run(g, 1.6);
    g.events = [];
    for (let i = 0; i < 10; i++) g.handleCast(a.id, { id: 2, x: 12 + i, y: 3, rt: g.time * 1000 });
    const fallos = g.events.filter((e) => e[0] === 'ms').length;
    check('no se puede ametrallar: 10 fallos juntos cuentan como 1', fallos === 1, 'fallos=' + fallos);
    run(g, 0.45);
    g.events = [];
    g.handleCast(a.id, { id: 2, x: 14, y: 3, rt: g.time * 1000 });
    check('pasada la espera corta se puede volver a intentar', g.events.some((e) => e[0] === 'ms'));
  }
  // sin maná
  a.mp = 10; run(g, 1.5);
  g.handleCast(a.id, { id: 3, x: 5, y: 0.3, rt: g.time * 1000 });
  check('sin maná no lanza', b.hp === hp2);
}

console.log('Compensación de retraso');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1);
  place(a, 0, 0); place(b, 5, 0); a.mp = MAX_MP;
  // B se mueve hacia la derecha; A apunta a donde lo veía hace 100 ms
  const seenAt = [];
  for (let i = 0; i < 10; i++) { b.x += 0.26; g.update(TICK_DT); seenAt.push({ t: g.time, x: b.x }); }
  const old = seenAt[seenAt.length - 3]; // hace ~100 ms
  const hp0 = b.hp;
  g.handleCast(a.id, { id: 2, x: old.x, y: 0.3, rt: old.t * 1000 });
  check('acierta donde el jugador lo veía (hace ~100 ms)', b.hp < hp0, `old.x=${old.x} b.x=${b.x}`);
}

console.log('Pociones');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); place(a, 0, 0); a.hp = 100;
  for (let i = 0; i < 20; i++) { inp(g, a.id, { ph: 1 }); g.update(TICK_DT); }
  check('mantener la poción cura varias veces (~1 s -> 3-4 pociones)', a.hp >= 100 + 3 * POTION_HP_AMOUNT && a.hp <= 100 + 5 * POTION_HP_AMOUNT, `hp=${a.hp}`);
  a.hp = MAX_HP; a.mp = 100;
  for (let i = 0; i < 20; i++) { inp(g, a.id, { ph: 2 }); g.update(TICK_DT); }
  check('la poción de maná sube el maná y no pasa del máximo', a.mp > 100 && a.mp <= MAX_MP);
}

console.log('Hechizos mientras se mantiene la poción');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1);
  place(a, 0, 0); place(b, 5, 0); a.hp = 100; a.mp = MAX_MP;
  for (let i = 0; i < 8; i++) { inp(g, a.id, { ph: 1 }); g.update(TICK_DT); }
  check('la poción se está tomando (intervalo activo)', a.potCd > 0 || a.hp > 100, `potCd=${a.potCd}`);
  a.potCd = POTION_COOLDOWN_TOTAL; // en pleno intervalo de poción
  g.handleCast(a.id, { id: 2, x: 5, y: 0.3, rt: g.time * 1000 });
  check('el hechizo sale aunque la poción esté en su intervalo', b.hp < MAX_HP, `hp=${b.hp}`);
  check('después del hechizo la poción espera un instante', a.potCd >= POTION_COOLDOWN_TOTAL - 0.001);
}

console.log('Espada, muertes y puntos');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1); const c = g.addPlayer('C', 2);
  place(a, 0, 0); place(b, 1, 0); place(c, 30, 30);
  c.score = 0; b.score = 2000; b.streak = 5; a.score = 0;
  g.update(TICK_DT);
  g.handleMelee(a.id);
  check('la espada hace 40 de daño a un rival pegado', b.hp === MAX_HP - MELEE_DAMAGE, `hp=${b.hp}`);
  b.hp = 10; run(g, 1.6);
  g.handleMelee(a.id);
  check('al morir el rival queda muerto', b.dead === true);
  check('el que mata se lleva puntos (parte del líder + bono)', a.score > 500 && a.score < 1200, `score=${a.score}`);
  check('el líder pierde solo una parte, no todo', b.score > 1000 && b.score < 2000, `b=${b.score}`);
  check('se registra la baja y la racha', a.kills === 1 && a.streak === 1 && b.streak === 0);
  check('hay un evento de baja', g.events.some((e) => e[0] === 'kl' && e[1] === a.id && e[2] === b.id));
  run(g, RESPAWN_TIME + 0.2);
  check('el muerto reaparece con vida completa', b.dead === false && b.hp === MAX_HP);
}

console.log('Escudo');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1);
  place(a, 0, 0); place(b, 1, 0);
  inp(g, b.id, { bl: 1 });
  g.handleMelee(a.id);
  check('bloquear con escudo reduce el daño al 25%', b.hp === MAX_HP - 10, `hp=${b.hp}`);
}

console.log('Inmovilizados no se empujan');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); const b = g.addPlayer('B', 1);
  place(a, 0, 0); place(b, 0.7, 0); b.imm = 5;
  const bx = b.x;
  for (let i = 0; i < 10; i++) { place(a, a.x, 0); g.update(TICK_DT); a.x += 0.1; }
  check('el petrificado no se mueve al chocarlo', Math.abs(b.x - bx) < 0.001, `dx=${b.x - bx}`);
}

console.log('Orbes y ventaja del líder');
{
  const g = arena(); g.__seq = 0;
  const a = g.addPlayer('A', 0); place(a, 0, 0);
  g.orbs[1].x = 0; g.orbs[1].y = 0; g.orbs[1].active = true; g.orbs[1].big = false;
  g.update(TICK_DT);
  check('juntar un orbe suma 10 puntos', a.score === 10, `score=${a.score}`);
  check('el orbe reaparece más tarde', g.orbs[1].active === false);
  g.updateLeader();
  a.hp = 100;
  g.orbs[2].x = 0; g.orbs[2].y = 0; g.orbs[2].active = true; g.orbs[2].big = true;
  g.update(TICK_DT);
  check('el líder se cura 15% con un orbe dorado', a.hp === 100 + 45, `hp=${a.hp}`);
  const b = g.addPlayer('B', 1); place(b, 20, 0); b.hp = 100;
  g.orbs[3].x = 20; g.orbs[3].y = 0; g.orbs[3].active = true; g.orbs[3].big = true;
  g.update(TICK_DT);
  check('quien no es líder no se cura', b.hp === 100);
}

console.log('Bots y población');
{
  const g = new Game();
  check('arranca con 8 bots', [...g.entities.values()].filter((e) => e.isBot).length === 8);
  const p = g.addPlayer('Fede', 1);
  check('al entrar un humano sobra un bot', [...g.entities.values()].filter((e) => e.isBot).length === 7);
  check('ningún bot comparte el color del jugador', ![...g.entities.values()].some((e) => e.isBot && e.color === 1));
  let err = null;
  try { for (let i = 0; i < 20 * 120; i++) { g.update(TICK_DT); g.flush(); } } catch (e) { err = e; }
  check('2 minutos de partida sin errores', err === null, err && err.stack);
  const kills = [...g.entities.values()].reduce((s, e) => s + e.kills, 0);
  const orbPts = [...g.entities.values()].reduce((s, e) => s + e.score, 0);
  check('los bots juntan orbes y se matan entre sí', orbPts > 0, `puntos=${orbPts} bajas=${kills}`);
  const snap = g.snapshotFor(p.id);
  const size = JSON.stringify(snap).length;
  check('el snapshot es chico (< 1.5 KB)', size < 1500, `bytes=${size}`);
  check('el snapshot trae mi maná y oculta el de los demás', snap.p.every(([id, , , , , mp]) => (id === p.id ? mp >= 0 : mp === -1)));
  g.removePlayer(p.id);
  check('al salir el humano vuelven los bots', [...g.entities.values()].filter((e) => e.isBot).length === 8);
}

console.log('Los bots se van cuando hay 8 jugadores reales');
{
  const g = new Game();
  const bots = () => [...g.entities.values()].filter((e) => e.isBot).length;
  const ps = [];
  for (let i = 1; i <= 5; i++) ps.push(g.addPlayer('J' + i, i % 10));
  check('con 5 jugadores quedan 3 bots', bots() === 3, 'bots=' + bots());
  for (let i = 6; i <= 8; i++) ps.push(g.addPlayer('J' + i, i % 10));
  check('con 8 jugadores ya no queda ningún bot', bots() === 0, 'bots=' + bots());
  for (let i = 9; i <= 24; i++) ps.push(g.addPlayer('J' + i, i % 10));
  check('con 24 jugadores sigue sin haber bots', bots() === 0 && g.humans() === 24, 'bots=' + bots() + ' humanos=' + g.humans());
  check('el jugador 25 no entra (sala llena)', g.addPlayer('Extra', 0) === null);
  for (let i = 0; i < 17; i++) g.removePlayer(ps[i].id);
  check('al bajar a 7 jugadores vuelve 1 bot', g.humans() === 7 && bots() === 1, 'humanos=' + g.humans() + ' bots=' + bots());
}

console.log(`\n${passed} bien, ${failed} con fallas`);
process.exit(failed ? 1 : 0);
