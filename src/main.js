import { start } from './engine/time.js';
import { createRenderer } from './render/canvas2d.js';
import { createPlayer, handleInput, stepPlayer } from './game/player.js';
import { createEnemy, stepEnemy } from './game/enemies.js';
import { tickAI } from './ai_runtime.js';
import { createRoom, stepRoom } from './game/rooms.js';
import { captureSnapshot } from './adaptation/snapshot.js';
import { mutatePopulation } from './adaptation/mutate.js';
import { initPool, evaluateVariants } from './adaptation/worker_pool.js';
import { CONFIG } from './config.js';
import { createProjectileSystem, spawnBullet, stepProjectiles, renderProjectiles } from './game/projectiles.js';
import { createRecorder, keysToBits } from './engine/input_recorder.js';

const canvas = document.getElementById('game');
const R = createRenderer(canvas);

const keys = Object.create(null);
window.addEventListener('keydown', e => keys[e.code]=true);
window.addEventListener('keyup',   e => keys[e.code]=false);

let state = {
  seed: 12345,
  room: createRoom(1, R.W, R.H),
  player: createPlayer(R.W*0.25, R.H*0.5),
  enemy: createEnemy('grunt', R.W*0.75, R.H*0.5),
  projectiles: createProjectileSystem(),
  recorder: createRecorder(),
  adaptHistory: [],
  betweenRooms: false
};

initPool();

function fixed(dt) {
  if (state.betweenRooms) return;
  handleInput(state.player, keys, dt);
  // Record per-step inputs as bitset for ghost replay
  state.recorder.push(keysToBits(keys));
  tickAI(state.enemy, { player: state.player, hazards: state.room.hazards }, dt);
  stepPlayer(state.player, dt, R.W, R.H);
  stepEnemy(state.enemy, state.player, dt, (spec) => {
    spawnBullet(state.projectiles, spec.x, spec.y, spec.vx, spec.vy, 10, 2.0, 3, '#9ad');
  });
  stepProjectiles(state.projectiles, dt, R.W, R.H, state.player);
  // Room hazards update and player-hazard damage
  stepRoom(state.room, dt);
  applyHazardDamage(state.room, state.player, dt);
  if (state.room.time >= 10) { // end the room after 10s for demo
    endRoomAndAdapt();
  }
}

async function endRoomAndAdapt() {
  state.betweenRooms = true;
  const snap = captureSnapshot(state);
  const baseRules = { rules: state.enemy.rules.map(r => ({...r})) };
  const isBoss = state.enemy.archetype === 'Boss';
  const simCount = isBoss ? (CONFIG.SIM_COUNT_BOSS||96) : (CONFIG.SIM_COUNT_NORMAL||32);
  const population = mutatePopulation(baseRules, simCount);
  console.log('[Adapt] Simulating', population.length, 'variants...');
  const { winner, ranked } = await evaluateVariants(snap, baseRules, population);
  console.log('[Adapt] Best fitness:', ranked[0].fitness.toFixed(3), '→ applying winner');
  // apply winner
  state.enemy.rules = winner.rules.map(r => ({...r}));
  // store recent winners for boss seeding (keep last two)
  state.adaptHistory.push(winner);
  if (state.adaptHistory.length > 2) state.adaptHistory.shift();
  // next room
  state.room = createRoom(state.room.id + 1, R.W, R.H);
  document.getElementById('room').textContent = String(state.room.id);
  // rotate archetype to showcase variety
  const isBoss = (state.room.id % 4 === 0);
  const types = isBoss ? ['boss'] : ['grunt', 'ranged', 'support'];
  const t = isBoss ? 'boss' : types[(state.room.id - 1) % types.length];
  const prev = state.enemy;
  state.enemy = createEnemy(t, prev.x, prev.y);
  if (isBoss) {
    // Seed boss rule weights from the average of the last winners
    const winners = state.adaptHistory;
    if (winners.length) {
      const avg = new Map(); const count = new Map();
      for (const w of winners) {
        (w.rules||[]).forEach((r) => {
          const k = r.name || '';
          if (!avg.has(k)) { avg.set(k, 0); count.set(k, 0); }
          avg.set(k, avg.get(k) + (r.weights||0)); count.set(k, count.get(k)+1);
        });
      }
      for (const r of state.enemy.rules) {
        if (avg.has(r.name)) {
          r.weights = (avg.get(r.name) / count.get(r.name)) * 0.9 + r.weights * 0.1;
        }
      }
    }
    // Initialize phase state
    state.enemy.memory.phase = 1;
    state.enemy.memory.phaseTimer = 0;
  }
  // clear projectiles between rooms
  state.projectiles.list.length = 0;
  // reset input recorder for new room
  state.recorder.clear();
  state.betweenRooms = false;
}

function render(alpha) {
  R.clear();
  // Player
  R.circle(state.player.x, state.player.y, state.player.r, '#4fb', '#2aa');
  // Obstacles
  for (const ob of state.room.obstacles || []) {
    R.circle(ob.x, ob.y, 0, undefined, undefined); // noop to keep context consistent
    // draw as rounded rect via filled rects approximation
    // simpler: just draw rectangle borders using text background helper
    // but we'll use circle strokes for performance; instead, fill rect with a dull color
    const x = ob.x, y = ob.y, w = ob.w, h = ob.h;
    // draw rectangle
    R.textWithBg('', x, y + h, '#0000', 'rgba(255,255,255,0.06)');
  }
  // Hazards
  for (const h of state.room.hazards || []) {
    if (h.type === 'spike') {
      const col = h.active ? '#f55' : '#633';
      R.circle(h.x, h.y, h.r, col, '#a33');
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      R.ring(x1, y1, 6, '#a8a', 2, 0.6);
      // draw the beam as a wide line via multiple rings approximation: use textWithBg hack to draw backdrop
      // Instead, approximate with small circles along the segment
      const segs = 20; const dx = (x2 - x1)/segs, dy = (y2 - y1)/segs;
      for (let i = 0; i <= segs; i++) {
        R.circle(x1 + dx*i, y1 + dy*i, (h.width||8)/2, '#a6f', '#84c');
      }
    }
  }
  // Enemy (color shows which rule was last selected by AI)
  const baseCol = state.enemy.memory.lastChoose === 0 ? '#f95' : '#fd6';
  const flashing = state.enemy.memory.flash && state.enemy.memory.flash > 0;
  const fillCol = flashing ? '#fff' : baseCol;
  R.circle(state.enemy.x, state.enemy.y, state.enemy.r, fillCol, '#a53');
  // Projectiles
  renderProjectiles(state.projectiles, R);
  // Telegraph text near enemy when switching actions
  if (state.enemy.memory.telegraph && state.enemy.memory.telegraph.timer > 0) {
    const t = state.enemy.memory.telegraph;
    const a = Math.max(0, Math.min(1, t.timer / (t.duration || 0.45)));
    const ringR = state.enemy.r + 4 + (1 - a) * 18;
    R.ring(state.enemy.x, state.enemy.y, ringR, t.color, 2, a * 0.85);
    // Label above enemy with fade
    const tx = Math.max(8, Math.min(R.W - 120, state.enemy.x - 22));
    const ty = Math.max(20, state.enemy.y - 18);
    const bg = `rgba(0,0,0,${0.45 * a + 0.15})`;
    // Slightly dim text as it fades
    R.textWithBg(t.text, tx, ty, t.color, bg);
  }
  const r0 = state.enemy.rules[0];
  const r1 = state.enemy.rules[1];
  R.text('Archetype: ' + (state.enemy.archetype || 'Grunt'), 12, 28);
  R.text(`${r0.name} weight: ${r0.weights.toFixed(2)}`, 12, 46);
  R.text(`${r1.name} weight: ${r1.weights.toFixed(2)}`, 12, 64);
  R.text(`Player HP: ${state.player.hp.toFixed(0)}`, 12, 84);
  if (state.enemy.archetype === 'Boss') {
    R.text(`Boss Phase: ${state.enemy.memory.phase||1}`, 12, 104);
  }
  if (state.betweenRooms) R.text('Adapting...', 420, 24);
}

function applyHazardDamage(room, player, dt) {
  for (const h of room.hazards) {
    if (h.type === 'spike' && h.active) {
      const dx = player.x - h.x, dy = player.y - h.y;
      if (dx*dx + dy*dy <= Math.pow(player.r + h.r, 2)) {
        player.hp = Math.max(0, player.hp - 25*dt);
      }
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(player.x, player.y, x1, y1, x2, y2);
      if (d <= (h.width||8)/2 + player.r) {
        player.hp = Math.max(0, player.hp - 18*dt);
      }
    }
  }
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx*wx + vy*wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx*vx + vy*vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  const bx = x1 + b*vx, by = y1 + b*vy;
  return Math.hypot(px - bx, py - by);
}

start({ fixed, render });
