import { start } from './engine/time.js';
import { createRenderer } from './render/canvas2d.js';
import { createPlayer, handleInput, stepPlayer } from './game/player.js';
import { createEnemy, stepEnemy } from './game/enemies.js';
import { tickAI } from './ai_runtime.js';
import { createRoom, stepRoom, roomDuration } from './game/rooms.js';
import { captureSnapshot } from './adaptation/snapshot.js';
import { mutatePopulation } from './adaptation/mutate.js';
import { initPool, evaluateVariants } from './adaptation/worker_pool.js';
import { CONFIG } from './config.js';
import { createProjectileSystem, spawnBullet, stepProjectiles, renderProjectiles } from './game/projectiles.js';
import { createRecorder } from './engine/input_recorder.js';
import { computeSimScale } from './engine/device.js';
import { initSfx, beep } from './engine/sfx.js';
import { createCodex, recordAdaptation, renderCodex } from './ui/codex.js';
import { createSettings, saveSettings, telegraphMultiplier, palette, keymap } from './ui/settings.js';
import { mulberry32, weekSeed } from './engine/rng.js';
import { loadModRules, getRulesOverride } from './data/mod.js';

const canvas = document.getElementById('game');
const R = createRenderer(canvas);

const keys = Object.create(null);
window.addEventListener('keydown', e => keys[e.code]=true);
window.addEventListener('keyup',   e => keys[e.code]=false);
initSfx();
// Fire-and-forget load of optional rule overrides
loadModRules();

let state = {
  seed: 12345,
  room: createRoom(1, R.W, R.H),
  player: createPlayer(R.W*0.25, R.H*0.5),
  enemy: createEnemy('grunt', R.W*0.75, R.H*0.5),
  projectiles: createProjectileSystem(),
  recorder: createRecorder(),
  adaptHistory: [],
  codex: createCodex(),
  settings: createSettings(),
  toggles: Object.create(null),
  betweenRooms: false,
  gameOver: false,
  score: 0,
  firing: false,
  mouse: { x: R.W * 0.5, y: R.H * 0.5 }
};

initPool();

// Pointer input for aiming/shooting
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  state.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener('pointerdown', () => { state.firing = true; });
window.addEventListener('pointerup',   () => { state.firing = false; });

function fixed(dt) {
  if (state.betweenRooms || state.gameOver) return;
  // Rising-edge toggles for settings
  risingToggle('KeyB', () => { state.settings.colorMode = (state.settings.colorMode === 'default' ? 'cb' : 'default'); saveSettings(state.settings); });
  risingToggle('KeyT', () => { state.settings.telegraph = (state.settings.telegraph === 'low' ? 'medium' : state.settings.telegraph === 'medium' ? 'high' : 'low'); saveSettings(state.settings); });
  risingToggle('KeyM', () => { state.settings.keymapScheme = (state.settings.keymapScheme === 'arrows_wasd' ? 'vim_hjkl' : 'arrows_wasd'); saveSettings(state.settings); });

  // Build logical actions from keymap and feed input
  const km = keymap(state.settings);
  const act = {
    Up: km.Up.some(c => keys[c]),
    Down: km.Down.some(c => keys[c]),
    Left: km.Left.some(c => keys[c]),
    Right: km.Right.some(c => keys[c]),
    Dash: km.Dash.some(c => keys[c]),
  };
  handleInput(state.player, act, dt);
  // Record logical inputs as bitset for ghost replay
  let bits = 0;
  if (act.Up) bits |= 1; if (act.Down) bits |= 2; if (act.Left) bits |= 4; if (act.Right) bits |= 8; if (act.Dash) bits |= 16;
  state.recorder.push(bits);
  // Toggle codex
  if (keys['KeyC']) { state.codex.visible = true; }
  if (keys['KeyV']) { state.codex.visible = false; }
  tickAI(state.enemy, { player: state.player, hazards: state.room.hazards, settings: state.settings }, dt);
  // SFX for fresh telegraphs
  if (state.enemy.memory.telegraph && state.enemy.memory.telegraph.just) {
    state.enemy.memory.telegraph.just = false;
    beep( state.enemy.archetype === 'Boss' ? 660 : 880, 0.06, 0.02 );
  }
  stepPlayer(state.player, dt, R.W, R.H);
  stepEnemy(state.enemy, state.player, dt, (spec) => {
    spawnBullet(state.projectiles, spec.x, spec.y, spec.vx, spec.vy, 10, 2.0, 3, '#9ad', 'enemy');
  });
  // Player shooting (hold to fire toward mouse)
  if (state.firing && state.player.shootCd <= 0) {
    const dx = state.mouse.x - state.player.x;
    const dy = state.mouse.y - state.player.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 520;
    const vx = (dx/len) * speed;
    const vy = (dy/len) * speed;
    spawnBullet(state.projectiles, state.player.x, state.player.y, vx, vy, 12, 1.2, 3, '#fd7', 'player');
    state.player.shootCd = 0.18;
  }
  stepProjectiles(
    state.projectiles, dt, R.W, R.H,
    state.player, state.enemy,
    (dmg)=>{ state.score += Math.round(dmg * 0.5); },
    ()=>{ state.score += 100; }
  );
  // Room hazards update and player-hazard damage
  stepRoom(state.room, dt);
  applyHazardDamage(state.room, state.player, dt);
  applyHazardDamageToEnemy(state.room, state.enemy, dt);

  // Check lose condition
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    return;
  }

  // Check win condition for the room (enemy dead)
  if (state.enemy.hp <= 0) {
    state.enemy.hp = 0;
    endRoomAndAdapt();
    return;
  }
  const dur = state.room.duration || roomDuration(state.room.id);
  if (state.room.time >= dur) {
    endRoomAndAdapt();
  }
}

async function endRoomAndAdapt() {
  state.betweenRooms = true;
  const snap = captureSnapshot(state);
  const baseRules = { rules: state.enemy.rules.map(r => ({...r})) };
  const isCurrentBoss = state.enemy.archetype === 'Boss';
  const baseSim = isCurrentBoss ? (CONFIG.SIM_COUNT_BOSS||96) : (CONFIG.SIM_COUNT_NORMAL||32);
  const simCount = Math.max(8, Math.round(baseSim * computeSimScale()));
  // Weekly-seeded RNG to vary mutations week-by-week (but deterministic per week)
  const rng = mulberry32((weekSeed() ^ state.seed ^ state.room.id) >>> 0);
  const population = mutatePopulation(baseRules, simCount, rng);
  console.log('[Adapt] Simulating', population.length, 'variants...');
  const { winner, ranked } = await evaluateVariants(snap, baseRules, population);
  const fairMax = CONFIG.FAIRNESS_MAX ?? 0.02;
  const chosenRes = ranked.find(r => (r.fairness || 0) <= fairMax) || ranked[0];
  const chosenVariant = chosenRes.rules; // { rules: [...] }
  console.log('[Adapt] Best fitness:', ranked[0].fitness.toFixed(3), 'Fair:', (ranked[0].fairness||0).toFixed(4), '→ applying', chosenRes===ranked[0]?'top':'next fair');
  // apply winner (fair-filtered), record codex diff
  const prevRules = state.enemy.rules.map(r => ({ name: r.name, weights: r.weights }));
  state.enemy.rules = chosenVariant.rules.map(r => ({...r}));
  // Clamp rule weights to safe max
  const wmax = CONFIG.RULE_WEIGHT_MAX || 1.6;
  for (const r of state.enemy.rules) { if (r.weights > wmax) r.weights = wmax; if (r.weights < 0.05) r.weights = 0.05; }
  // store recent winners for boss seeding (keep last two)
  state.adaptHistory.push(chosenVariant);
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
  // Apply mod override if present for this archetype
  const ov = getRulesOverride(state.enemy.archetype || t);
  if (ov && Array.isArray(ov.rules)) {
    state.enemy.rules = ov.rules.map(r => ({...r}));
  }
  // set room duration based on id
  state.room.duration = roomDuration(state.room.id);
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
  // record codex entry for previous room
  recordAdaptation(state.codex, state.room.id - 1, prev.archetype || 'Enemy', prevRules, state.enemy.rules);
  state.betweenRooms = false;
}

function render(alpha) {
  R.clear();
  // Colors
  const pal = palette(state.settings);
  // Player
  R.circle(state.player.x, state.player.y, state.player.r, pal.playerFill, pal.playerStroke);
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
  const baseCol = state.enemy.memory.lastChoose === 0 ? pal.enemyFillA : pal.enemyFillB;
  const flashing = state.enemy.memory.flash && state.enemy.memory.flash > 0;
  const fillCol = flashing ? '#fff' : baseCol;
  R.circle(state.enemy.x, state.enemy.y, state.enemy.r, fillCol, pal.enemyStroke);
  // Projectiles
  renderProjectiles(state.projectiles, R);
  // Telegraph text near enemy when switching actions
  if (state.enemy.memory.telegraph && state.enemy.memory.telegraph.timer > 0) {
    const t = state.enemy.memory.telegraph;
    const a = Math.max(0, Math.min(1, t.timer / (t.duration || 0.45)));
    const mul = telegraphMultiplier(state.settings);
    const ringR = state.enemy.r + 4 + (1 - a) * 18 * mul;
    R.ring(state.enemy.x, state.enemy.y, ringR, pal.ring, 2, Math.min(1, a * 0.85 * mul));
    // Label above enemy with fade
    const tx = Math.max(8, Math.min(R.W - 120, state.enemy.x - 22));
    const ty = Math.max(20, state.enemy.y - 18);
    const bg = `rgba(0,0,0,${0.45 * a + 0.15})`;
    // Slightly dim text as it fades
    R.textWithBg(t.text, tx, ty, t.color, bg);
  }
  const r0 = state.enemy.rules[0];
  const r1 = state.enemy.rules[1];
  R.text('Score: ' + (state.score|0), 12, 16);
  R.text('Archetype: ' + (state.enemy.archetype || 'Grunt'), 12, 28);
  R.text(`${r0.name} weight: ${r0.weights.toFixed(2)}`, 12, 46);
  R.text(`${r1.name} weight: ${r1.weights.toFixed(2)}`, 12, 64);
  R.text(`Player HP: ${state.player.hp.toFixed(0)}`, 12, 84);
  if (state.enemy.archetype === 'Boss') {
    R.text(`Boss Phase: ${state.enemy.memory.phase||1}`, 12, 104);
  }
  // Enemy HP on HUD (avoid overlap with Boss Phase line)
  const enemyHpY = (state.enemy.archetype === 'Boss') ? 124 : 104;
  R.text(`Enemy HP: ${Math.max(0, state.enemy.hp).toFixed(0)}`, 12, enemyHpY);
  if (state.betweenRooms) R.text('Adapting...', 420, 24);
  if (state.gameOver) {
    R.textWithBg('GAME OVER', R.W*0.5 - 60, R.H*0.5, '#fff', 'rgba(0,0,0,0.5)');
  }
  // Codex panel
  renderCodex(state.codex, R);
}

function applyHazardDamage(room, player, dt) {
  for (const h of room.hazards) {
    if (h.type === 'spike' && h.active) {
      const dx = player.x - h.x, dy = player.y - h.y;
      if (dx*dx + dy*dy <= Math.pow(player.r + h.r, 2)) {
        if (!player.invuln || player.invuln <= 0) player.hp = Math.max(0, player.hp - 25*dt);
      }
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(player.x, player.y, x1, y1, x2, y2);
      if (d <= (h.width||8)/2 + player.r) {
        if (!player.invuln || player.invuln <= 0) player.hp = Math.max(0, player.hp - 18*dt);
      }
    }
  }
}
function risingToggle(code, fn) {
  const was = state.toggles[code] || false;
  const is = !!keys[code];
  if (!was && is) fn();
  state.toggles[code] = is;
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

// Apply hazard damage to enemies as well (environment hurts both sides)
function applyHazardDamageToEnemy(room, enemy, dt) {
  for (const h of room.hazards) {
    if (h.type === 'spike' && h.active) {
      const dx = enemy.x - h.x, dy = enemy.y - h.y;
      if (dx*dx + dy*dy <= Math.pow((enemy.r || 12) + (h.r || 0), 2)) {
        enemy.hp = Math.max(0, enemy.hp - 25*dt);
      }
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(enemy.x, enemy.y, x1, y1, x2, y2);
      if (d <= (h.width||8)/2 + (enemy.r || 12)) {
        enemy.hp = Math.max(0, enemy.hp - 18*dt);
      }
    }
  }
}

start({ fixed, render });
