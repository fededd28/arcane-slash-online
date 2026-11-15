// ============================================================================
// ARCANE SLASH ONLINE - simulación del juego (autoridad del servidor)
// No depende de Cloudflare: se puede probar directo con Node.
// ============================================================================
import {
  TICK_DT, MAX_HP, MAX_MP, SPELLS, SCORE, OBSTACLES, HALF_MAP, ORB_COUNT, SPAWN_POINTS, PLAYER_COLORS,
  SPELL_GLOBAL_INTERVAL, MELEE_INTERVAL, MELEE_DAMAGE, POTION_COOLDOWN_TOTAL, POTION_HP_AMOUNT,
  POTION_MP_AMOUNT, RESPAWN_TIME, BOT_POTION_INTERVAL, CHARACTER_RADIUS, BASE_SPEED,
  clamp, resolveEnvironmentCollisions, separatePair, stepPlayerMovement, dirFromVector
} from '../public/shared.js';

export const MAX_PLAYERS = 24;
const BOT_TARGET_POPULATION = 8; // entre humanos y bots se intenta llegar a este número
const MIN_BOTS = 0; // con BOT_TARGET_POPULATION jugadores reales o más ya no queda ningún bot
const HISTORY_SECONDS = 0.5;
const MAX_REWIND = 0.3;

const BOT_NAMES = ['Vexor', 'Lyssara', 'Mordain', 'Kaelen', 'Thalric', 'Nyra', 'Orvyn', 'Sorrel',
  'Dravik', 'Selene', 'Ulric', 'Iona', 'Tarkin', 'Mirelle', 'Gorran', 'Zephyra'];

const r2 = (v) => Math.round(v * 100) / 100;
const rnd = (a, b) => a + Math.random() * (b - a);

export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return s || 'Jugador';
}

export class Game {
  constructor() {
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.entities = new Map();
    this.orbs = [];
    this.events = []; // eventos para todos, se envían con el próximo snapshot
    this.direct = new Map(); // id -> mensajes solo para ese jugador
    this.leaderId = 0;
    this.popTimer = 0;
    this.usedBotNames = new Set();
    for (let i = 0; i < ORB_COUNT; i++) {
      const orb = { x: 0, y: 0, big: i % 8 === 0, active: true, respawnAt: 0 };
      this.placeOrb(orb);
      this.orbs.push(orb);
    }
    this.ensureBots();
  }

  // ---------- Utilidades ----------
  ev(e) { this.events.push(e); }

  msg(id, m) {
    let list = this.direct.get(id);
    if (!list) { list = []; this.direct.set(id, list); }
    list.push(m);
  }

  humans() {
    let n = 0;
    for (const e of this.entities.values()) if (!e.isBot) n++;
    return n;
  }

  getRanking() {
    return [...this.entities.values()].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
  }

  makeEntity(name, color, isBot) {
    return {
      id: this.nextId++, name, color, isBot,
      x: 0, y: 0, dir: 0, hp: MAX_HP, mp: MAX_MP,
      score: 0, kills: 0, deaths: 0, streak: 0, lastKills: {},
      imm: 0, dead: false, deadT: 0, blocking: false, moving: false,
      dashT: 0, dashCd: 0, lastDx: 0, lastDy: -1,
      spellCd: 0, meleeCd: 0, potCd: 0, swingT: 0,
      input: { mx: 0, my: 0, bl: 0, ph: 0 }, ack: 0, budget: 4,
      hist: [],
      ai: isBot ? {
        spellCooldown: rnd(3.5, 5), meleeCooldown: rnd(3, 3.8), potionCooldown: 0,
        blockTimer: 0, moveAngle: rnd(0, Math.PI * 2), aiChangeTimer: rnd(0.9, 2.3), cleanseDelay: 0
      } : null
    };
  }

  pickSpawn() {
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const p = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      let minD = 999;
      for (const e of this.entities.values()) {
        if (e.dead) continue;
        minD = Math.min(minD, Math.hypot(e.x - p.x, e.y - p.y));
      }
      if (minD > bestScore) { bestScore = minD; best = p; }
    }
    return best || { x: 0, y: 0 };
  }

  entInfo(e) {
    return { id: e.id, name: e.name, color: e.color, bot: e.isBot ? 1 : 0 };
  }

  // ---------- Jugadores ----------
  addPlayer(name, color) {
    if (this.humans() >= MAX_PLAYERS) return null;
    const c = Number.isInteger(color) && color >= 0 && color < PLAYER_COLORS.length ? color : 0;
    const e = this.makeEntity(sanitizeName(name), c, false);
    const sp = this.pickSpawn();
    e.x = sp.x; e.y = sp.y;
    this.entities.set(e.id, e);
    // Los bots que tenían ese mismo color pasan a otro para no confundirse
    for (const b of this.entities.values()) {
      if (b.isBot && b.color === c) {
        b.color = this.freeColor();
        this.ev(['en', this.entInfo(b)]);
      }
    }
    this.ev(['en', this.entInfo(e)]);
    this.ensureBots();
    return e;
  }

  removePlayer(id) {
    if (this.entities.delete(id)) {
      this.ev(['er', id]);
      this.direct.delete(id);
      this.ensureBots();
    }
  }

  freeColor() {
    const used = new Set();
    for (const e of this.entities.values()) used.add(e.color);
    for (let i = 0; i < PLAYER_COLORS.length; i++) if (!used.has(i)) return i;
    return Math.floor(Math.random() * PLAYER_COLORS.length);
  }

  // ---------- Bots ----------
  addBot() {
    let name = BOT_NAMES.find((n) => !this.usedBotNames.has(n));
    if (!name) name = `Bot${this.nextId}`;
    this.usedBotNames.add(name);
    const e = this.makeEntity(name, this.freeColor(), true);
    const sp = this.pickSpawn();
    e.x = sp.x; e.y = sp.y;
    this.entities.set(e.id, e);
    this.ev(['en', this.entInfo(e)]);
    return e;
  }

  ensureBots() {
    const humans = this.humans();
    const wanted = Math.max(MIN_BOTS, BOT_TARGET_POPULATION - humans);
    const bots = [...this.entities.values()].filter((e) => e.isBot);
    for (let i = bots.length; i < wanted; i++) this.addBot();
    if (bots.length > wanted) {
      bots.sort((a, b) => a.score - b.score);
      for (let i = 0; i < bots.length - wanted; i++) {
        this.usedBotNames.delete(bots[i].name);
        this.entities.delete(bots[i].id);
        this.ev(['er', bots[i].id]);
      }
    }
  }

  // ---------- Orbes ----------
  placeOrb(orb) {
    const lim = HALF_MAP - 3;
    let x = 0;
    let y = 3;
    for (let i = 0; i < 80; i++) {
      const tx = rnd(-lim, lim);
      const ty = rnd(-lim, lim);
      let ok = true;
      for (const o of OBSTACLES) {
        if (Math.abs(tx - o.x) < o.w / 2 + 1.2 && Math.abs(ty - o.y) < o.h / 2 + 1.2) { ok = false; break; }
      }
      if (ok) { x = tx; y = ty; break; }
    }
    orb.x = r2(x); orb.y = r2(y); orb.active = true;
  }

  nearestOrb(e, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const o of this.orbs) {
      if (!o.active) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  collectOrbs(e) {
    const r = CHARACTER_RADIUS + 0.45;
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      if (!o.active) continue;
      if (Math.abs(o.x - e.x) > r || Math.abs(o.y - e.y) > r) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) > r) continue;
      o.active = false;
      o.respawnAt = this.time + 8 + Math.random() * 6;
      const wasLeader = e.score > 0 && e.id === this.leaderId;
      e.score += o.big ? SCORE.orbBig : SCORE.orbSmall;
      this.ev(['oc', i, e.id]);
      if (wasLeader) {
        const amount = Math.round(MAX_HP * (o.big ? SCORE.leaderOrbHealBig : SCORE.leaderOrbHealSmall));
        e.hp = Math.min(MAX_HP, e.hp + amount);
        this.ev(['po', r2(e.x), r2(e.y), 2]);
      }
    }
  }

  // ---------- Daño, muertes y puntos ----------
  damage(target, amount, attacker, fromMelee) {
    if (target.dead) return;
    let dmg = amount;
    if (attacker && attacker.isBot && !target.isBot) dmg = Math.round(amount * (fromMelee ? 0.7 : 0.55));
    if (target.blocking && target.imm <= 0) {
      dmg = Math.max(1, Math.round(dmg * 0.25));
      this.ev(['bk', r2(target.x), r2(target.y)]);
      if (!target.isBot) {
        this.msg(target.id, { t: 'toast', text: `¡Escudo bloqueó el golpe de ${attacker ? attacker.name : '?'}! (-${dmg} HP)` });
      }
    }
    target.hp = Math.max(0, target.hp - dmg);
    if (target.hp <= 0) this.kill(target, attacker);
  }

  kill(victim, killer) {
    victim.dead = true;
    victim.deadT = RESPAWN_TIME;
    victim.imm = 0;
    victim.blocking = false;
    victim.dashT = 0;
    victim.hp = 0;
    this.registerKill(killer, victim);
  }

  registerKill(killer, victim) {
    const victimStreak = victim.streak;
    const ranking = this.getRanking();
    const victimRank = ranking.indexOf(victim);
    victim.deaths += 1;
    victim.streak = 0;

    if (!killer || killer === victim) {
      if (!victim.isBot) this.msg(victim.id, { t: 'death', by: '', lost: 0, secs: RESPAWN_TIME });
      return;
    }

    let share = SCORE.baseShare;
    if (victimRank >= 0 && victimRank < SCORE.rankShare.length) share += SCORE.rankShare[victimRank];
    share += Math.min(SCORE.victimStreakShareCap, victimStreak * SCORE.victimStreakShare);
    if (killer.score < victim.score) {
      share += SCORE.comebackShare * Math.min(1, (victim.score - killer.score) / Math.max(1, victim.score));
    }
    share += Math.min(SCORE.killerMomentumCap, killer.streak * SCORE.killerMomentumShare);
    share = Math.min(share, SCORE.maxShare);

    let mult = 1;
    const last = killer.lastKills[victim.id];
    if (last !== undefined && this.time - last < SCORE.antiFarmWindow) mult = SCORE.antiFarmMult;
    killer.lastKills[victim.id] = this.time;

    const stolen = Math.floor(victim.score * share * mult);
    const bonus = Math.round((SCORE.killBase + Math.min(victimStreak, SCORE.streakBonusCap) * SCORE.streakBonus) * mult);
    const wasLeader = victimRank === 0 && victim.score > 0;
    victim.score -= stolen;
    killer.score += stolen + bonus;
    killer.kills += 1;
    killer.streak += 1;

    this.ev(['kl', killer.id, victim.id, stolen + bonus, wasLeader ? 1 : 0]);
    if (!killer.isBot) this.msg(killer.id, { t: 'toast', text: `¡Eliminaste a ${victim.name}! +${stolen + bonus} pts${wasLeader ? ' (era el líder)' : ''}` });
    if (!victim.isBot) this.msg(victim.id, { t: 'death', by: killer.name, lost: stolen, secs: RESPAWN_TIME });
    this.updateLeader();
  }

  updateLeader() {
    let best = null;
    for (const e of this.entities.values()) {
      if (!best || e.score > best.score || (e.score === best.score && e.deaths < best.deaths)) best = e;
    }
    this.leaderId = best && best.score > 0 ? best.id : 0;
  }

  respawn(e) {
    e.dead = false;
    e.hp = MAX_HP;
    e.mp = MAX_MP;
    e.imm = 0;
    e.dir = 0;
    e.blocking = false;
    e.hist = [];
    const sp = this.pickSpawn();
    e.x = sp.x; e.y = sp.y;
    this.ev(['rs', r2(e.x), r2(e.y)]);
    if (!e.isBot) this.msg(e.id, { t: 'toast', text: '¡Has vuelto a aparecer!' });
  }

  // ---------- Entrada del jugador ----------
  handleInput(id, m) {
    const e = this.entities.get(id);
    if (!e || e.isBot || !m) return;
    const seq = Number.isFinite(m.seq) ? m.seq | 0 : e.ack;
    if (e.budget < 1) { e.ack = seq; return; } // demasiadas entradas: se ignora
    e.budget -= 1;
    const mx = clamp(Number(m.mx) || 0, -1, 1);
    const my = clamp(Number(m.my) || 0, -1, 1);
    const ph = m.ph === 1 || m.ph === 2 ? m.ph : 0;
    e.input = { mx, my, bl: m.bl ? 1 : 0, ph };
    const r = stepPlayerMovement(e, { mx, my, bl: e.input.bl, dash: !!m.dash }, TICK_DT);
    e.moving = r.moving;
    e.blocking = r.blocking;
    if (r.moving && (mx !== 0 || my !== 0)) e.dir = dirFromVector(mx, my, e.dir);
    e.ack = seq;
  }

  // Posición de un personaje en un instante pasado (para compensar el retraso al apuntar)
  posAt(e, t) {
    const h = e.hist;
    if (!h.length || t >= h[h.length - 1].t) return { x: e.x, y: e.y };
    if (t <= h[0].t) return { x: h[0].x, y: h[0].y };
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1];
        const b = h[i];
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return { x: e.x, y: e.y };
  }

  findTargetAt(caster, wx, wy, t) {
    let hit = null;
    let closest = Infinity;
    for (const e of this.entities.values()) {
      if (e === caster || e.dead) continue;
      const p = this.posAt(e, t);
      const dx = Math.abs(wx - p.x);
      const dy = wy - p.y;
      if (dx <= 0.44 && dy >= -0.35 && dy <= 1.02) {
        const d = Math.hypot(dx, dy - 0.32);
        if (d < closest) { closest = d; hit = e; }
      }
    }
    return hit;
  }

  applySpell(attacker, sp, target) {
    if (sp.immobilize > 0) {
      target.imm = sp.immobilize;
      target.dashT = 0;
      if (target.isBot) target.ai.cleanseDelay = 1 + Math.random() * 1.2;
      else this.msg(target.id, { t: 'pet', by: attacker.name });
    }
    if (sp.cleanse) target.imm = 0;
    if (sp.damage > 0) this.damage(target, sp.damage, attacker, false);
  }

  handleCast(id, m) {
    const e = this.entities.get(id);
    if (!e || e.isBot || e.dead || !m) return;
    const sp = SPELLS[m.id | 0];
    if (!sp) return;
    const wx = Number(m.x);
    const wy = Number(m.y);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    const toast = (text) => this.msg(id, { t: 'toast', text });

    if (e.spellCd > 0) return toast(`Intervalo entre habilidades: espera ${e.spellCd.toFixed(1)}s`);
    if (e.mp < sp.mana) return toast('Maná insuficiente');

    // Tiempo al que el cliente vio el mundo (compensación de retraso)
    let t = Number.isFinite(m.rt) ? m.rt / 1000 : this.time;
    t = clamp(t, this.time - MAX_REWIND, this.time);

    const selfCast = !!m.self && sp.cleanse;
    const target = selfCast ? null : this.findTargetAt(e, wx, wy, t);

    if (sp.immobilize > 0 && target && target.imm > 0) return toast(`¡${target.name} ya está petrificado!`);

    e.mp -= sp.mana;
    e.spellCd = SPELL_GLOBAL_INTERVAL;
    e.potCd = Math.max(e.potCd, POTION_COOLDOWN_TOTAL);
    e.swingT = 0.2;
    e.dir = dirFromVector(wx - e.x, wy - e.y, e.dir);

    if (selfCast) {
      this.ev(['sp', e.id, sp.id, r2(e.x), r2(e.y), r2(e.x), r2(e.y)]);
      e.imm = 0;
      toast('¡Petrificación disipada!');
      return;
    }
    if (!target) {
      this.ev(['ms', r2(wx), r2(wy), sp.id]);
      toast('¡Fallaste! Apunta directo sobre el personaje');
      return;
    }
    this.ev(['sp', e.id, sp.id, r2(e.x), r2(e.y), r2(target.x), r2(target.y)]);
    this.applySpell(e, sp, target);
  }

  handleMelee(id) {
    const e = this.entities.get(id);
    if (!e || e.isBot || e.dead) return;
    if (e.meleeCd > 0) return this.msg(id, { t: 'toast', text: `Espada en espera: ${e.meleeCd.toFixed(1)}s` });
    const range = CHARACTER_RADIUS * 2 + 0.65;
    let best = null;
    let bestD = Infinity;
    for (const o of this.entities.values()) {
      if (o === e || o.dead) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= range && d < bestD) { bestD = d; best = o; }
    }
    if (!best) return this.msg(id, { t: 'toast', text: 'Acércate a un rival para golpear con la espada' });
    e.meleeCd = MELEE_INTERVAL;
    e.swingT = 0.24;
    e.dir = dirFromVector(best.x - e.x, best.y - e.y, e.dir);
    this.ev(['sl', r2(best.x), r2(best.y), e.id]);
    this.damage(best, MELEE_DAMAGE, e, true);
  }

  // ---------- Inteligencia de los bots ----------
  updateBot(b, dt) {
    const ai = b.ai;
    ai.spellCooldown = Math.max(0, ai.spellCooldown - dt);
    ai.meleeCooldown = Math.max(0, ai.meleeCooldown - dt);
    ai.potionCooldown = Math.max(0, ai.potionCooldown - dt);
    ai.blockTimer = Math.max(0, ai.blockTimer - dt);
    b.blocking = ai.blockTimer > 0 && b.imm <= 0;

    // Si está petrificado, usa Disipar sobre sí mismo (con un pequeño retraso de reacción)
    if (b.imm > 0) {
      ai.cleanseDelay -= dt;
      if (ai.cleanseDelay <= 0 && ai.spellCooldown <= 0 && b.mp >= SPELLS[4].mana) {
        b.mp -= SPELLS[4].mana;
        ai.spellCooldown = SPELL_GLOBAL_INTERVAL;
        b.imm = 0;
        this.ev(['sp', b.id, 4, r2(b.x), r2(b.y), r2(b.x), r2(b.y)]);
      }
    }

    // Pociones
    if (ai.potionCooldown <= 0) {
      if (b.hp < MAX_HP * 0.4) {
        ai.potionCooldown = BOT_POTION_INTERVAL;
        b.hp = Math.min(MAX_HP, b.hp + POTION_HP_AMOUNT);
        this.ev(['po', r2(b.x), r2(b.y), 0]);
      } else if (b.mp < 70) {
        ai.potionCooldown = BOT_POTION_INTERVAL;
        b.mp = Math.min(MAX_MP, b.mp + POTION_MP_AMOUNT);
        this.ev(['po', r2(b.x), r2(b.y), 1]);
      }
    }

    // Rival más cercano (humanos hasta 18, bots hasta 24)
    let target = null;
    let nearestDist = Infinity;
    for (const o of this.entities.values()) {
      if (o === b || o.dead) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      const range = o.isBot ? 24 : 18;
      if (d < range && d < nearestDist) { target = o; nearestDist = d; }
    }

    // Movimiento
    ai.aiChangeTimer -= dt;
    if (ai.aiChangeTimer <= 0) {
      ai.aiChangeTimer = 0.7 + Math.random() * 1.2;
      if (target) {
        const toTarget = Math.atan2(target.y - b.y, target.x - b.x);
        if (nearestDist > 4.5) {
          ai.moveAngle = toTarget + (Math.random() - 0.5) * 0.55;
        } else {
          ai.moveAngle = toTarget + (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.48);
        }
        if (nearestDist < 6.5 && Math.random() < 0.25) ai.blockTimer = 0.9;
      } else {
        const orb = this.nearestOrb(b, 22);
        ai.moveAngle = orb ? Math.atan2(orb.y - b.y, orb.x - b.x) : Math.random() * Math.PI * 2;
      }
    }
    if (!target) {
      const orb = this.nearestOrb(b, 22);
      if (orb) ai.moveAngle = Math.atan2(orb.y - b.y, orb.x - b.x);
    }

    const canMove = b.imm <= 0 && !b.blocking;
    b.moving = canMove;
    if (canMove) {
      const vx = Math.cos(ai.moveAngle) * BASE_SPEED;
      const vy = Math.sin(ai.moveAngle) * BASE_SPEED;
      b.x += vx * dt;
      b.y += vy * dt;
      resolveEnvironmentCollisions(b, CHARACTER_RADIUS);
      b.dir = target ? dirFromVector(target.x - b.x, target.y - b.y, b.dir) : dirFromVector(vx, vy, b.dir);
    } else if (target && b.imm <= 0) {
      b.dir = dirFromVector(target.x - b.x, target.y - b.y, b.dir);
    }

    // Ataques
    if (target && b.imm <= 0) {
      if (nearestDist <= CHARACTER_RADIUS * 2 + 0.55 && ai.meleeCooldown <= 0) {
        ai.meleeCooldown = MELEE_INTERVAL + 0.25;
        b.swingT = 0.24;
        this.ev(['sl', r2(target.x), r2(target.y), b.id]);
        this.damage(target, MELEE_DAMAGE, b, true);
      }
      if (nearestDist < 12 && ai.spellCooldown <= 0) {
        let spellId = null;
        if (target.imm <= 0 && Math.random() < 0.38 && b.mp >= SPELLS[1].mana) spellId = 1;
        else if (b.mp >= SPELLS[3].mana && Math.random() < 0.45) spellId = 3;
        else if (b.mp >= SPELLS[2].mana) spellId = 2;
        if (spellId) {
          const sp = SPELLS[spellId];
          b.mp -= sp.mana;
          ai.spellCooldown = SPELL_GLOBAL_INTERVAL + 0.5;
          b.swingT = 0.2;
          const hitChance = target.isBot ? 0.72 : 0.62;
          if (Math.random() <= hitChance) {
            this.ev(['sp', b.id, sp.id, r2(b.x), r2(b.y), r2(target.x), r2(target.y)]);
            this.applySpell(b, sp, target);
          } else {
            this.ev(['ms', r2(target.x + (Math.random() - 0.5) * 2.2), r2(target.y + (Math.random() - 0.5) * 2.2), sp.id]);
          }
        }
      }
    }
  }

  // ---------- Un paso de la simulación ----------
  update(dt) {
    this.time += dt;
    this.tick += 1;

    const list = [...this.entities.values()];

    for (const e of list) {
      e.budget = Math.min(4, e.budget + dt / 0.045);
      if (e.imm > 0) e.imm = Math.max(0, e.imm - dt);
      if (e.swingT > 0) e.swingT = Math.max(0, e.swingT - dt);
      if (e.dead) {
        e.deadT -= dt;
        if (e.deadT <= 0) this.respawn(e);
        continue;
      }
      if (e.isBot) continue;
      e.spellCd = Math.max(0, e.spellCd - dt);
      e.meleeCd = Math.max(0, e.meleeCd - dt);
      e.potCd = Math.max(0, e.potCd - dt);
      e.dashCd = Math.max(0, e.dashCd - dt);
      if (e.imm > 0) e.blocking = false;
      // Pociones manteniendo apretado
      if (e.input.ph === 1 && e.hp < MAX_HP && e.potCd <= 0) {
        e.potCd = POTION_COOLDOWN_TOTAL;
        e.hp = Math.min(MAX_HP, e.hp + POTION_HP_AMOUNT);
        this.ev(['po', r2(e.x), r2(e.y), 0]);
      } else if (e.input.ph === 2 && e.mp < MAX_MP && e.potCd <= 0) {
        e.potCd = POTION_COOLDOWN_TOTAL;
        e.mp = Math.min(MAX_MP, e.mp + POTION_MP_AMOUNT);
        this.ev(['po', r2(e.x), r2(e.y), 1]);
      }
    }

    for (const e of list) {
      if (e.isBot && !e.dead && this.entities.has(e.id)) this.updateBot(e, dt);
    }

    // Choques entre personajes
    const alive = list.filter((e) => !e.dead && this.entities.has(e.id));
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) separatePair(alive[i], alive[j]);
    }
    for (const e of alive) resolveEnvironmentCollisions(e, CHARACTER_RADIUS);

    // Orbes
    for (const e of alive) this.collectOrbs(e);
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      if (!o.active && this.time >= o.respawnAt) {
        this.placeOrb(o);
        this.ev(['op', i, o.x, o.y]);
      }
    }

    // Historial de posiciones (para compensar el retraso al apuntar)
    for (const e of list) {
      e.hist.push({ t: this.time, x: e.x, y: e.y });
      while (e.hist.length && e.hist[0].t < this.time - HISTORY_SECONDS) e.hist.shift();
    }

    this.updateLeader();
    this.popTimer += dt;
    if (this.popTimer >= 1) { this.popTimer = 0; this.ensureBots(); }
  }

  // ---------- Mensajes hacia los clientes ----------
  welcomeFor(id) {
    return {
      t: 'welcome',
      id,
      st: Math.round(this.time * 1000),
      ents: [...this.entities.values()].map((e) => this.entInfo(e)),
      orbs: this.orbs.map((o) => [o.x, o.y, o.big ? 1 : 0, o.active ? 1 : 0])
    };
  }

  snapshotFor(id) {
    const me = this.entities.get(id);
    const p = [];
    for (const e of this.entities.values()) {
      const flags = (e.blocking ? 1 : 0) | (e.imm > 0 ? 2 : 0) | (e.dead ? 4 : 0) | (e.swingT > 0 ? 8 : 0) | (e.moving ? 16 : 0);
      p.push([e.id, r2(e.x), r2(e.y), e.dir, Math.ceil(e.hp), e === me ? Math.floor(e.mp) : -1, flags]);
    }
    const snap = { t: 's', tk: this.tick, st: Math.round(this.time * 1000), p, ev: this.events };
    if (me) {
      snap.me = {
        ack: me.ack, hp: Math.ceil(me.hp), mp: Math.floor(me.mp),
        dcd: r2(me.dashCd), scd: r2(me.spellCd), mcd: r2(me.meleeCd), pcd: r2(me.potCd),
        imm: r2(me.imm), dead: me.dead ? r2(Math.max(0, me.deadT)) : 0,
        x: r2(me.x), y: r2(me.y), dt: r2(me.dashT), lx: r2(me.lastDx), ly: r2(me.lastDy),
        score: Math.round(me.score), kills: me.kills, streak: me.streak
      };
      const d = this.direct.get(id);
      if (d && d.length) snap.d = d;
    }
    return snap;
  }

  leaderboardMsg() {
    return { t: 'lb', rows: this.getRanking().map((e) => [e.id, Math.round(e.score), e.kills, e.streak, e.dead ? 1 : 0]) };
  }

  // Se llama después de enviar los snapshots de este paso
  flush() {
    this.events = [];
    this.direct.clear();
  }
}
