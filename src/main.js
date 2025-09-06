import { start } from './engine/time.js';
import { createRenderer } from './render/canvas2d.js';
import { createPlayer, handleInput, stepPlayer } from './game/player.js';
import { createEnemy, stepEnemy } from './game/enemies.js';
import { tickAI } from './ai_runtime.js';
import { createRoom, stepRoom, roomDuration } from './game/rooms.js';
import { captureSnapshot } from './adaptation/snapshot.js';
import { mutatePopulation } from './adaptation/mutate.js';
import { initPool, evaluateVariants } from './adaptation/worker_pool.js';
import { CONFIG, loadConfig } from './config.js';
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
// Increase global canvas text size
//R.setTextSize(30);
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
// Load config overrides (sim counts, weights, etc.)
// Fire-and-forget; values are read later during adaptation.
try { loadConfig(); } catch (_) {}

// Query flag to enable mod rule overrides (off by default)
const _params = new URLSearchParams(window.location.search);
const MODS_ENABLED = _params.has('mods') || _params.get('mod') === '1';

// World size independent from viewport
const WORLD_W = 2000;
const WORLD_H = 1200;

function fixedSpawns(W, H) {
  return {
    player: { x: Math.floor(W * 0.25), y: Math.floor(H * 0.5) },
    enemy:  { x: Math.floor(W * 0.75), y: Math.floor(H * 0.5) }
  };
}

const SPAWN = fixedSpawns(WORLD_W, WORLD_H);

let state = {
  seed: 12345,
  room: createRoom(1, WORLD_W, WORLD_H),
  player: createPlayer(SPAWN.player.x, SPAWN.player.y),
  enemy: createEnemy('grunt', SPAWN.enemy.x, SPAWN.enemy.y),
  projectiles: createProjectileSystem(),
  recorder: createRecorder(),
  adaptHistory: [],
  codex: createCodex(),
  settings: createSettings(),
  toggles: Object.create(null),
  betweenRooms: false,
  gameOver: false,
  started: false,
  score: 0,
  // Persist learned rules per archetype across rooms
  learned: Object.create(null),
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
  // Start game if on start screen
  if (!state.started) { state.started = true; return; }
  state.firing = true;
});
window.addEventListener('pointerup',   () => { state.firing = false; });
window.addEventListener('keydown', (e) => {
  if (!state.started && (e.code === 'Enter' || e.code === 'Space')) {
    state.started = true;
  }
});

function fixed(dt) {
  if (!state.started || state.betweenRooms || state.gameOver) return;
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
  // Flush any boss-spawned hazards into the room
  if (state.enemy.memory && Array.isArray(state.enemy.memory.spawnHazards) && state.enemy.memory.spawnHazards.length) {
    const list = state.enemy.memory.spawnHazards;
    for (let i = 0; i < list.length; i++) state.room.hazards.push(list[i]);
    state.enemy.memory.spawnHazards.length = 0;
  }
  // Reset one-shot latches if rule switched
  if (state.enemy.memory && state.enemy.memory.telegraph && state.enemy.memory.telegraph.just === false) {
    // On any rule switch we can clear one-shot latches so they can trigger next time selected
    state.enemy.memory._spikeLatch = false;
    state.enemy.memory._laserLatch = false;
  }
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
  const prevArch = state.enemy.archetype || 'Enemy';
  // Persist best performer (top fitness) for this room to localStorage
  try {
    const best = ranked[0];
    saveBestPerformer(state.room.id, {
      roomId: state.room.id,
      archetype: prevArch,
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
  // Record codex entry for this archetype's adapted rules (before swapping enemy)
  recordAdaptation(state.codex, state.room.id, prevArch, prevRules, state.enemy.rules);
  // Persist learned rules by archetype so future spawns continue evolving
  state.learned[prevArch] = state.enemy.rules.map(r => ({...r}));
  // store recent winners for boss seeding (keep last two)
  state.adaptHistory.push(chosenVariant);
  if (state.adaptHistory.length > 2) state.adaptHistory.shift();
  // next room (world-sized, independent of viewport)
  state.room = createRoom(state.room.id + 1, WORLD_W, WORLD_H);
  // rotate archetype to showcase variety
  const isBoss = (state.room.id % 4 === 0);
  const types = isBoss ? ['boss'] : ['grunt', 'ranged', 'support'];
  const t = isBoss ? 'boss' : types[(state.room.id - 1) % types.length];
  // Spawn entities at fixed positions for determinism
  const prev = state.enemy;
  const spawn = fixedSpawns(state.room.W, state.room.H);
  state.player.x = spawn.player.x; state.player.y = spawn.player.y;
  state.player.vx = 0; state.player.vy = 0; state.player.dashTime = 0; state.player.dashCd = 0; state.player.invuln = 0;
  state.enemy = createEnemy(t, spawn.enemy.x, spawn.enemy.y);
  // Apply mod override if present for this archetype
  if (MODS_ENABLED) {
    const ov = getRulesOverride(state.enemy.archetype || t);
    if (ov && Array.isArray(ov.rules)) {
      state.enemy.rules = ov.rules.map(r => ({...r}));
    }
  }
  // Apply learned rules for this archetype if available (takes precedence over defaults/mods)
  const learned = state.learned[state.enemy.archetype || t];
  if (learned && Array.isArray(learned)) {
    state.enemy.rules = learned.map(r => ({...r}));
    // Clamp on load
    const wmax2 = CONFIG.RULE_WEIGHT_MAX || 1.6;
    for (const r of state.enemy.rules) { if (r.weights > wmax2) r.weights = wmax2; if (r.weights < 0.05) r.weights = 0.05; }
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
  state.betweenRooms = false;
}

function render(alpha) {
  R.clear();
  // Colors
  const pal = palette(state.settings);
  const lh = R.lineHeightPx();
  // Start screen overlay
  if (!state.started) {
    // Dim background
    R.rect(0, 0, R.W, R.H, 'rgba(0,0,0,0.6)');
    const cx = Math.floor(R.W/2) - 220;
    let y = Math.floor(R.H/2) - 120;
    R.textWithBg('AI Dungeon Master', cx, y, '#fff', 'rgba(0,0,0,0.55)'); y += lh;
    R.text('How to Play', cx, y, '#aef'); y += lh;
    R.text('- Move: WASD / Arrows (toggle VIM with M)', cx, y); y += lh;
    R.text('- Dash: Space (brief invulnerability)', cx, y); y += lh;
    R.text('- Shoot: Click (aim with mouse)', cx, y); y += lh;
    y += 6;
    R.text('Goal', cx, y, '#aef'); y += lh;
    R.text('- Defeat the enemy to clear the room', cx, y); y += lh;
    R.text('- Every 4th room is a boss', cx, y); y += lh;
    R.text('- Survive hazards and bullets; HP at top of units', cx, y); y += lh;
    y += 6;
    R.text('Tips', cx, y, '#aef'); y += lh;
    R.text('- Enemies adapt between rooms — keep them guessing', cx, y); y += lh;
    R.text('- T: change telegraph intensity, B: color mode, C/V: Codex', cx, y); y += lh;
    y += 12;
    const msg = 'Press Enter or Click to Start';
    const tx = Math.floor(R.W/2) - 124; // rough centering for this message
    const ty = y + 8 + 20;
    R.text(msg, tx, ty, '#eaeaea');
    // Also draw Reset Best button so it’s available on start screen
    drawResetButton(R);
    return;
  }
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
  R.text('Score: ' + (state.score|0), 12, Math.round(lh * 1));
  R.text('Room: ' + state.room.id + '  FPS: ' + (state.fps||0), 12, Math.round(lh * 2));
  R.text('Archetype: ' + (state.enemy.archetype || 'Grunt'), 12, Math.round(lh * 3));
  R.text(`${r0.name} weight: ${r0.weights.toFixed(2)}`, 12, Math.round(lh * 4));
  R.text(`${r1.name} weight: ${r1.weights.toFixed(2)}`, 12, Math.round(lh * 5));

  drawResetButton(R);
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

function drawResetButton(R) {
  // UI: Reset Best button (center-top), size based on text metrics
  const label = 'Reset Best';
  const lh = R.lineHeightPx();
  const padX = 14, padY = 8;
  const textW = (typeof R.textWidth === 'function') ? R.textWidth(label) : 140;
  const btnW = Math.max(160, textW + padX * 2);
  const btnH = Math.max( Math.ceil(lh) + padY, 32 );
  const btnX = Math.floor((R.W - btnW) / 2);
  const btnY = 12;
  state.ui.resetBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
  const hover = (state.mouse.x >= btnX && state.mouse.x <= btnX+btnW && state.mouse.y >= btnY && state.mouse.y <= btnY+btnH);
  const fill = hover ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)';
  R.rect(btnX, btnY, btnW, btnH, fill, '#666');
  // Align baseline to vertically center text within the button
  const textY = btnY + Math.floor((btnH + lh) / 2) - Math.floor(lh * 0.25);
  R.text(label, btnX + padX, textY, '#eaeaea');
  if (state.ui.resetMsgTimer > 0) {
    R.textWithBg('Cleared best performers', btnX - 8, btnY + btnH + 20, '#aef', 'rgba(0,0,0,0.5)');
  }
}
