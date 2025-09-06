import { start } from './engine/time.js';
import { createRenderer } from './render/canvas2d.js';
import { createPlayer, handleInput, stepPlayer } from './game/player.js';
import { createEnemy, stepEnemy } from './game/enemies.js';
import { tickAI } from './ai_runtime.js';
import { createRoom } from './game/rooms.js';
import { captureSnapshot } from './adaptation/snapshot.js';
import { mutatePopulation } from './adaptation/mutate.js';
import { initPool, evaluateVariants } from './adaptation/worker_pool.js';
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
  tickAI(state.enemy, { player: state.player }, dt);
  stepPlayer(state.player, dt, R.W, R.H);
  stepEnemy(state.enemy, state.player, dt, (spec) => {
    spawnBullet(state.projectiles, spec.x, spec.y, spec.vx, spec.vy, 10, 2.0, 3, '#9ad');
  });
  stepProjectiles(state.projectiles, dt, R.W, R.H, state.player);
  // simplistic collision: if overlap, damage player a little (hidden)
  state.room.time += dt;
  if (state.room.time >= 10) { // end the room after 10s for demo
    endRoomAndAdapt();
  }
}

async function endRoomAndAdapt() {
  state.betweenRooms = true;
  const snap = captureSnapshot(state);
  const baseRules = { rules: state.enemy.rules.map(r => ({...r})) };
  const population = mutatePopulation(baseRules, 24);
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

start({ fixed, render });
