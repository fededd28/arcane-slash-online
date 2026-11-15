// ============================================================================
// ARCANE SLASH ONLINE - código compartido entre el servidor y el navegador
// (reglas, mapa y movimiento). No usa nada del navegador ni de Cloudflare,
// así el servidor y el cliente calculan exactamente lo mismo.
// ============================================================================

export const PROTOCOL_VERSION = 3;

// --- Tiempos de la simulación ---
export const TICK_RATE = 20; // el servidor actualiza el mundo 20 veces por segundo
export const TICK_DT = 1 / TICK_RATE;

// --- Reglas de combate (mismos valores que la versión local) ---
export const DASH_COOLDOWN_TOTAL = 10.0;
export const DASH_TIME = 0.16;
export const SPELL_GLOBAL_INTERVAL = 1.4;
// Un hechizo que falla no gasta maná, pero deja una espera corta: así no se puede ametrallar ni apuntar gratis a fuerza bruta
export const SPELL_MISS_INTERVAL = 0.4;
export const MELEE_INTERVAL = 1.5;
// Escudo: un golpe corto (no se mantiene). Dura SHIELD_TIME y después espera SHIELD_COOLDOWN
export const SHIELD_TIME = 0.8;
export const SHIELD_COOLDOWN = 8.0;
export const MELEE_DAMAGE = 70;
export const POTION_COOLDOWN_TOTAL = 0.3;
export const POTION_HP_AMOUNT = 30;
export const POTION_MP_AMOUNT = 30;
export const RESPAWN_TIME = 5.0;
export const MAX_HP = 300;
export const MAX_MP = 300;
export const BOT_POTION_INTERVAL = 2.2;

export const CHARACTER_RADIUS = 0.38;
export const BASE_SPEED = 5.2;
export const DASH_SPEED = 16.5;

export const SPELLS = {
  1: { id: 1, name: 'Petrificar', mana: 60, color: 0x9ea7b3, damage: 10, immobilize: 6.0 },
  2: { id: 2, name: 'Descarga Espectral', mana: 50, color: 0x58a6ff, damage: 45, immobilize: 0 },
  3: { id: 3, name: 'Cataclismo', mana: 200, color: 0xff6b35, damage: 85, immobilize: 0 },
  4: { id: 4, name: 'Disipar', mana: 40, color: 0x3fb950, damage: 0, cleanse: true }
};

// --- Puntos ---
export const SCORE = {
  killBase: 50,
  streakBonus: 15,
  streakBonusCap: 10,
  baseShare: 0.10,
  rankShare: [0.12, 0.06, 0.03],
  victimStreakShare: 0.02,
  victimStreakShareCap: 0.10,
  comebackShare: 0.08,
  killerMomentumShare: 0.015,
  killerMomentumCap: 0.06,
  maxShare: 0.40,
  antiFarmWindow: 20,
  antiFarmMult: 0.4,
  orbSmall: 10,
  orbBig: 50,
  leaderOrbHealSmall: 0.05,
  leaderOrbHealBig: 0.15
};

// --- Mapa ---
export const MAP_SIZE = 90;
export const HALF_MAP = MAP_SIZE / 2;
export const WALL_THICKNESS = 1.2;
export const ORB_COUNT = 48;

export const OBSTACLES = [
  { x: -12, y: 10, w: 4, h: 4, color: 0x3a414c },
  { x: 14, y: 12, w: 5, h: 3, color: 0x3a414c },
  { x: -15, y: -12, w: 3, h: 6, color: 0x3a414c },
  { x: 12, y: -14, w: 4, h: 4, color: 0x3a414c },
  { x: -28, y: 4, w: 4, h: 8, color: 0x353c47 },
  { x: 28, y: -5, w: 4, h: 8, color: 0x353c47 },
  { x: 0, y: 28, w: 10, h: 3, color: 0x353c47 },
  { x: 0, y: -28, w: 10, h: 3, color: 0x353c47 },
  { x: -32, y: -30, w: 5, h: 5, color: 0x3a414c },
  { x: 32, y: 30, w: 5, h: 5, color: 0x3a414c },
  { x: -30, y: 30, w: 4, h: 4, color: 0x3a414c },
  { x: 30, y: -30, w: 4, h: 4, color: 0x3a414c }
];

// Puntos donde pueden aparecer los jugadores (lejos de los obstáculos)
export const SPAWN_POINTS = [
  { x: 0, y: 0 }, { x: 20, y: 0 }, { x: -20, y: 0 }, { x: 0, y: 18 }, { x: 0, y: -18 },
  { x: 22, y: 20 }, { x: -22, y: 20 }, { x: 22, y: -20 }, { x: -22, y: -20 },
  { x: 36, y: 0 }, { x: -36, y: 0 }, { x: 8, y: 36 }, { x: -8, y: -36 }
];

// Colores de personaje (índice que viaja por la red)
export const PLAYER_COLORS = [
  { name: 'Azul', main: '#27407a', dark: '#141f3d', trim: '#5ab0ff' },
  { name: 'Carmesí', main: '#8a2a2e', dark: '#4a1417', trim: '#ff7b72' },
  { name: 'Esmeralda', main: '#226b40', dark: '#10351f', trim: '#4cd36a' },
  { name: 'Amatista', main: '#5a3a8c', dark: '#2b1a4a', trim: '#d2a8ff' },
  { name: 'Ámbar', main: '#8f5420', dark: '#4a280c', trim: '#ffa657' },
  { name: 'Glaciar', main: '#1f6577', dark: '#0f343d', trim: '#6ad7e5' },
  { name: 'Rosa', main: '#8a2f5e', dark: '#4a1630', trim: '#ff9bce' },
  { name: 'Dorado', main: '#86671c', dark: '#45350c', trim: '#f2cc60' },
  { name: 'Obsidiana', main: '#434b57', dark: '#20242b', trim: '#c9d1d9' },
  { name: 'Marfil', main: '#b8b2a0', dark: '#6b6552', trim: '#f5e9c8' }
];

// --- Utilidades ---
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Choque contra el borde del mapa y los obstáculos. `pos` es cualquier objeto con x e y.
export function resolveEnvironmentCollisions(pos, radius) {
  const limit = HALF_MAP - radius;
  pos.x = clamp(pos.x, -limit, limit);
  pos.y = clamp(pos.y, -limit, limit);

  for (const obs of OBSTACLES) {
    const halfW = obs.w / 2;
    const halfH = obs.h / 2;
    const closestX = clamp(pos.x, obs.x - halfW, obs.x + halfW);
    const closestY = clamp(pos.y, obs.y - halfH, obs.y + halfH);
    const dx = pos.x - closestX;
    const dy = pos.y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const overlap = radius - dist;
        pos.x += (dx / dist) * overlap;
        pos.y += (dy / dist) * overlap;
      } else {
        pos.y += radius;
      }
    }
  }
}

// Separa a dos personajes que se pisan. El que está inmovilizado (imm > 0) no cede nada.
// La separación es gradual (SEPARATION_STRENGTH por paso) para que un choque no se vea como un salto.
export const SEPARATION_STRENGTH = 0.5;
export function separatePair(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const minDist = CHARACTER_RADIUS * 2;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return;
  const dist = Math.sqrt(distSq);
  const nx = dist > 0.0001 ? dx / dist : 1;
  const ny = dist > 0.0001 ? dy / dist : 0;
  const overlap = (minDist - dist) * SEPARATION_STRENGTH;
  const wa = a.imm > 0 ? 0 : 1;
  const wb = b.imm > 0 ? 0 : 1;
  const total = wa + wb;
  if (total === 0) return;
  a.x += nx * overlap * (wa / total);
  a.y += ny * overlap * (wa / total);
  b.x -= nx * overlap * (wb / total);
  b.y -= ny * overlap * (wb / total);
}

// Un paso de movimiento de 50 ms (lo usan igual el servidor y la predicción del cliente).
// `s` es el estado: x, y, dashT, dashCd, lastDx, lastDy, imm, dead.
// `inp` es la entrada: mx, my (dirección), bl (pedido de escudo, un pulso), dash (pedido de dash).
export function stepPlayerMovement(s, inp, dt) {
  if (s.dead) {
    s.dashT = 0;
    s.shieldT = 0;
    return { moving: false, blocking: false };
  }
  const len = Math.hypot(inp.mx, inp.my);
  let nx = 0;
  let ny = 0;
  if (len > 0) {
    nx = inp.mx / len;
    ny = inp.my / len;
    s.lastDx = nx;
    s.lastDy = ny;
  }
  const frozen = s.imm > 0;
  const moving = len > 0 && !frozen;
  if (frozen) { s.dashT = 0; s.shieldT = 0; }
  if (inp.bl && !frozen && s.shieldCd <= 0 && s.shieldT <= 0) {
    s.shieldT = SHIELD_TIME;
    s.shieldCd = SHIELD_COOLDOWN;
  }
  const blocking = s.shieldT > 0 && !frozen;
  if (blocking) s.shieldT -= dt;

  if (inp.dash && !frozen && s.dashCd <= 0 && s.dashT <= 0) {
    s.dashT = DASH_TIME;
    s.dashCd = DASH_COOLDOWN_TOTAL;
  }

  const speed = blocking ? BASE_SPEED * 0.55 : BASE_SPEED;
  let vx = moving ? nx * speed : 0;
  let vy = moving ? ny * speed : 0;
  let dashing = false;
  if (s.dashT > 0 && !frozen) {
    s.dashT -= dt;
    vx = s.lastDx * DASH_SPEED;
    vy = s.lastDy * DASH_SPEED;
    dashing = true;
  }

  s.x += vx * dt;
  s.y += vy * dt;
  resolveEnvironmentCollisions(s, CHARACTER_RADIUS);
  return { moving: moving || dashing, blocking };
}

// Dirección del sprite según un vector: 0 frente, 1 espalda, 2 izquierda, 3 derecha
export function dirFromVector(dx, dy, fallback) {
  if (Math.hypot(dx, dy) < 0.001) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 2;
  return dy > 0 ? 1 : 0;
}
