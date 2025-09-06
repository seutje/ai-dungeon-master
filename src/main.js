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
import { resolveCircleAabbs } from './engine/physics.js';
import { initSfx, beep } from './engine/sfx.js';
import { createCodex, recordAdaptation, renderCodex } from './ui/codex.js';
import { createSettings, saveSettings, telegraphMultiplier, palette, keymap } from './ui/settings.js';
import { mulberry32, weekSeed } from './engine/rng.js';
import { loadModRules, getRulesOverride } from './data/mod.js';
import { saveBestPerformer, clearBestPerformers } from './data/persistence.js';

const canvas = document.getElementById('game');
const R = createRenderer(canvas);
R.setTextSize(18);
function resizeCanvasToWindow() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h; R.resize();
    canvas.style.width = '100%'; canvas.style.height = '100%';
  }
}
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();

const keys = Object.create(null);
window.addEventListener('keydown', e => keys[e.code]=true);
window.addEventListener('keyup',   e => keys[e.code]=false);
initSfx();
// Fire-and-forget load of optional rule overrides
loadModRules();

// World size independent from viewport
const WORLD_W = 2000;
const WORLD_H = 1200;

let state = {
  seed: 12345,
  room: createRoom(1, WORLD_W, WORLD_H),
  player: createPlayer(WORLD_W*0.25, WORLD_H*0.5),
  enemy: createEnemy('grunt', WORLD_W*0.75, WORLD_H*0.5),
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
  mouse: { x: R.W * 0.5, y: R.H * 0.5 },
  camera: { x: 0, y: 0 },
  fps: 0,
  ui: { resetBtn: { x: 0, y: 0, w: 0, h: 0 }, resetMsgTimer: 0 }
};

initPool();

// Pointer input for aiming/shooting
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  state.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  // Check UI button hit first (screen-space)
  const b = state.ui && state.ui.resetBtn;
  if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
    try { clearBestPerformers(); state.ui.resetMsgTimer = 1.6; } catch (_) {}
    return; // don't start firing when clicking UI
  }
  state.firing = true;
});
window.addEventListener('pointerup',   () => { state.firing = false; });

function fixed(dt) {
  if (state.betweenRooms || state.gameOver) return;
  // UI timers
  if (state.ui && state.ui.resetMsgTimer > 0) state.ui.resetMsgTimer = Math.max(0, state.ui.resetMsgTimer - dt);
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
  tickAI(state.enemy, { player: state.player, hazards: state.room.hazards, obstacles: state.room.obstacles, projectiles: state.projectiles, settings: state.settings }, dt);
  // SFX for fresh telegraphs
  if (state.enemy.memory.telegraph && state.enemy.memory.telegraph.just) {
    state.enemy.memory.telegraph.just = false;
    beep( state.enemy.archetype === 'Boss' ? 660 : 880, 0.06, 0.02 );
  }
  stepPlayer(state.player, dt, state.room.W, state.room.H);
  // Collide player against obstacles
  resolveCircleAabbs(state.player, state.room.obstacles);
  stepEnemy(state.enemy, state.player, dt, (spec) => {
    const col = state.enemy.archetype === 'Ranged' ? '#fda' : (state.enemy.archetype === 'Boss' ? '#a6f' : '#9ad');
    spawnBullet(state.projectiles, spec.x, spec.y, spec.vx, spec.vy, 10, 2.0, 3, col, 'enemy');
  });
  // Collide enemy against obstacles
  resolveCircleAabbs(state.enemy, state.room.obstacles);
  // Player shooting (hold to fire toward mouse)
  if (state.firing && state.player.shootCd <= 0) {
    // Convert mouse screen coords to world by adding camera offset
    const targetX = state.camera.x + state.mouse.x;
    const targetY = state.camera.y + state.mouse.y;
    const dx = targetX - state.player.x;
    const dy = targetY - state.player.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 520;
    const vx = (dx/len) * speed;
    const vy = (dy/len) * speed;
    spawnBullet(state.projectiles, state.player.x, state.player.y, vx, vy, 12, 1.2, 3, '#fd7', 'player');
    state.player.shootCd = 0.18;
  }
  stepProjectiles(
    state.projectiles, dt, state.room.W, state.room.H,
    state.player, state.enemy,
    (dmg)=>{ state.score += Math.round(dmg * 0.5); },
    ()=>{ state.score += 100; },
    state.room.obstacles
  );
  // Room hazards update and player-hazard damage
  stepRoom(state.room, dt);
  applyHazardDamage(state.room, state.player, dt);
  applyHazardDamageToEnemy(state.room, state.enemy, dt);
  applyContactDamage(state.player, state.enemy, dt);

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
  // Persist best performer (top fitness) for this room to localStorage
  try {
    const best = ranked[0];
    saveBestPerformer(state.room.id, {
      roomId: state.room.id,
      archetype: state.enemy.archetype || 'Enemy',
      fitness: Number(best.fitness || 0),
      fairness: Number(best.fairness || 0),
      rules: best.rules && best.rules.rules ? best.rules.rules : (best.rules || []),
      timestamp: Date.now()
    });
  } catch (_) { /* ignore storage errors */ }
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
  // next room (world-sized, independent of viewport)
  state.room = createRoom(state.room.id + 1, WORLD_W, WORLD_H);
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
  // Update camera and clamp to world
  state.camera.x = Math.max(0, Math.min(state.room.W - R.W, state.player.x - R.W * 0.5));
  state.camera.y = Math.max(0, Math.min(state.room.H - R.H, state.player.y - R.H * 0.5));

  // World-space draw
  R.beginWorld(state.camera.x, state.camera.y);
  // Player
  R.circle(state.player.x, state.player.y, state.player.r, pal.playerFill, pal.playerStroke);
  // Obstacles
  for (const ob of state.room.obstacles || []) {
    R.rect(ob.x, ob.y, ob.w, ob.h, 'rgba(255,255,255,0.06)', '#555');
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
  // Health bars (world-space) for player and enemy
  drawHealthBar(R, state.player.x, state.player.y - state.player.r - 10, Math.max(28, state.player.r*2), 4, state.player.hp, state.player.maxHp || 100);
  drawHealthBar(R, state.enemy.x, state.enemy.y - state.enemy.r - 10, Math.max(28, state.enemy.r*2), 4, state.enemy.hp, state.enemy.maxHp || 60);
  // Projectiles
  renderProjectiles(state.projectiles, R);
  // Telegraph near enemy (world-space)
  if (state.enemy.memory.telegraph && state.enemy.memory.telegraph.timer > 0) {
    const t = state.enemy.memory.telegraph;
    const a = Math.max(0, Math.min(1, t.timer / (t.duration || 0.45)));
    const mul = telegraphMultiplier(state.settings);
    const ringR = state.enemy.r + 4 + (1 - a) * 18 * mul;
    R.ring(state.enemy.x, state.enemy.y, ringR, pal.ring, 2, Math.min(1, a * 0.85 * mul));
    // Draw action label below the enemy to avoid overlapping HP bar
    const tx = state.enemy.x - 22;
    const ty = state.enemy.y + state.enemy.r + 16;
    const bg = `rgba(0,0,0,${0.45 * a + 0.15})`;
    R.textWithBg(t.text, tx, ty, t.color, bg);
  }
  R.endWorld();
  const r0 = state.enemy.rules[0];
  const r1 = state.enemy.rules[1];
  R.text('Score: ' + (state.score|0), 12, 18);
  R.text('Room: ' + state.room.id + '  FPS: ' + (state.fps||0), 12, 18 + 18);
  R.text('Archetype: ' + (state.enemy.archetype || 'Grunt'), 12, 18 + 18*2);
  R.text(`${r0.name} weight: ${r0.weights.toFixed(2)}`, 12, 18 + 18*3);
  R.text(`${r1.name} weight: ${r1.weights.toFixed(2)}`, 12, 18 + 18*4);

  // UI: Reset Best button (center-top)
  const btnW = 160, btnH = 28;
  const btnX = Math.floor((R.W - btnW) / 2);
  const btnY = 12;
  state.ui.resetBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
  const hover = (state.mouse.x >= btnX && state.mouse.x <= btnX+btnW && state.mouse.y >= btnY && state.mouse.y <= btnY+btnH);
  const fill = hover ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)';
  R.rect(btnX, btnY, btnW, btnH, fill, '#666');
  R.text('Reset Best', btnX + 14, btnY + 20, '#eaeaea');
  if (state.ui.resetMsgTimer > 0) {
    R.textWithBg('Cleared best performers', btnX - 8, btnY + btnH + 20, '#aef', 'rgba(0,0,0,0.5)');
  }
  if (state.enemy.archetype === 'Boss') {
    R.text(`Boss Phase: ${state.enemy.memory.phase||1}`, 12, 104);
  }
  // Removed HUD HP text; health shown above entities
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

// Enemy contact (body) damage to player
function applyContactDamage(player, enemy, dt) {
  if (!enemy || enemy.hp <= 0) return;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const rr = (player.r + (enemy.r||12));
  if (dx*dx + dy*dy <= rr*rr) {
    if (!player.invuln || player.invuln <= 0) {
      // Contact DPS
      player.hp = Math.max(0, player.hp - 30*dt);
    }
  }
}

start({ fixed, render, onFps: (v)=>{ state.fps = v; } });

// Helper: draw simple health bar in world-space
function drawHealthBar(R, cx, cy, w, h, hp, maxHp) {
  const ratio = Math.max(0, Math.min(1, (maxHp > 0 ? hp / maxHp : 0)));
  const x = Math.floor(cx - w/2);
  const y = Math.floor(cy - h/2);
  R.rect(x, y, w, h, 'rgba(0,0,0,0.5)');
  if (ratio > 0) {
    const fw = Math.max(1, Math.floor(w * ratio));
    const color = ratio > 0.5 ? '#40d370' : ratio > 0.25 ? '#f5c044' : '#ef5a5a';
    R.rect(x, y, fw, h, color);
  }
}
