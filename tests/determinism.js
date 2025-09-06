import { initPool, evaluateVariants, setWorkerDebug } from '../src/adaptation/worker_pool.js';
import { loadConfig } from '../src/config.js';
import { mutatePopulation } from '../src/adaptation/mutate.js';

const logEl = document.getElementById('log');
logEl.textContent = '';
function log(msg, cls) {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  logEl.appendChild(line);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSnapshot(seed=123) {
  return {
    seed,
    player: { x: 100, y: 100 },
    enemy: { rules: [] }, // worker uses variant rules
    horizonSteps: 60,
    dt: 1/120,
    inputs: new Array(60).fill(0) // stationary ghost
  };
}

function baseRules() {
  return { rules: [
    { name: 'Approach', weights: 0.8, cooldown: 0, cdMs: 150 },
    { name: 'Strafe',   weights: 0.2, cooldown: 0, cdMs: 300 }
  ]};
}

function makePopulation(seed, count=24) {
  const rng = mulberry32(seed);
  return mutatePopulation(baseRules(), count, rng);
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout: ${label} > ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function runDeterminism() {
  // Ensure config (non-blocking if fetch fails)
  await loadConfig().catch(() => {});
  log('Initializing worker pool…');
  setWorkerDebug((e) => log(`[worker] ${e.type}${e.error?': '+e.error:''}`));
  initPool(2);
  const snap = makeSnapshot(12345);
  const popA = makePopulation(999, 24);
  const popB = makePopulation(999, 24); // same seed → same population

  log('Evaluating population A…');
  const res1 = await withTimeout(evaluateVariants(snap, baseRules(), popA), 8000, 'Eval A');
  log('Evaluating population B…');
  const res2 = await withTimeout(evaluateVariants(snap, baseRules(), popB), 8000, 'Eval B');

  const fitness1 = res1.ranked.map(r => r.fitness.toFixed(6));
  const fitness2 = res2.ranked.map(r => r.fitness.toFixed(6));
  const winner1 = JSON.stringify(res1.winner);
  const winner2 = JSON.stringify(res2.winner);

  const fitnessEqual = JSON.stringify(fitness1) === JSON.stringify(fitness2);
  const winnerEqual = winner1 === winner2;

  if (fitnessEqual && winnerEqual) {
    log('PASS: Fitness ordering and winner are identical across runs.', 'pass');
    document.title = 'PASS — Determinism Test';
  } else {
    log('FAIL: Non-deterministic ordering or winner.', 'fail');
    document.title = 'FAIL — Determinism Test';
    log('Fitness A: ' + fitness1.join(', '));
    log('Fitness B: ' + fitness2.join(', '));
    log('Winner A: ' + winner1);
    log('Winner B: ' + winner2);
  }
}

runDeterminism().catch(e => {
  console.error(e);
  log('ERROR: ' + e.message, 'fail');
  document.title = 'ERROR — Determinism Test';
});
