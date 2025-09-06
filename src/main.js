import { start } from './engine/time.js';
import { createRenderer } from './render/canvas2d.js';
import { createPlayer, handleInput, stepPlayer } from './game/player.js';
import { createEnemy, stepEnemy } from './game/enemies.js';
import { tickAI } from './ai_runtime.js';
import { createRoom } from './game/rooms.js';
import { captureSnapshot } from './adaptation/snapshot.js';
import { mutatePopulation } from './adaptation/mutate.js';
import { initPool, evaluateVariants } from './adaptation/worker_pool.js';

const canvas = document.getElementById('game');
const R = createRenderer(canvas);

const keys = Object.create(null);
window.addEventListener('keydown', e => keys[e.code]=true);
window.addEventListener('keyup',   e => keys[e.code]=false);

let state = {
  seed: 12345,
  room: createRoom(1, R.W, R.H),
  player: createPlayer(R.W*0.25, R.H*0.5),
  enemy: createEnemy(R.W*0.75, R.H*0.5),
  betweenRooms: false
};

initPool();

function fixed(dt) {
  if (state.betweenRooms) return;
  handleInput(state.player, keys, dt);
  tickAI(state.enemy, { player: state.player }, dt);
  stepPlayer(state.player, dt, R.W, R.H);
  stepEnemy(state.enemy, state.player, dt);
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
  // next room
  state.room = createRoom(state.room.id + 1, R.W, R.H);
  document.getElementById('room').textContent = String(state.room.id);
  state.betweenRooms = false;
}

function render(alpha) {
  R.clear();
  // Player
  R.circle(state.player.x, state.player.y, state.player.r, '#4fb', '#2aa');
  // Enemy (color shows which rule was last selected by dummy AI)
  const baseCol = state.enemy.memory.lastChoose === 0 ? '#f95' : '#fd6';
  const flashing = state.enemy.memory.flash && state.enemy.memory.flash > 0;
  const fillCol = flashing ? '#fff' : baseCol;
  R.circle(state.enemy.x, state.enemy.y, state.enemy.r, fillCol, '#a53');
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
  R.text('Approach weight: ' + state.enemy.rules[0].weights.toFixed(2), 12, 28);
  R.text('Strafe weight:   ' + state.enemy.rules[1].weights.toFixed(2), 12, 46);
  if (state.betweenRooms) R.text('Adapting...', 420, 24);
}

start({ fixed, render });
