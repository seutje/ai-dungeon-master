import { initPool, evaluateVariants } from '../src/adaptation/worker_pool.js';
import { mutatePopulation } from '../src/adaptation/mutate.js';

const logEl = document.getElementById('log');
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

async function runDeterminism() {
  initPool(2);
  const snap = makeSnapshot(12345);
  const popA = makePopulation(999, 24);
  const popB = makePopulation(999, 24); // same seed → same population

  const res1 = await evaluateVariants(snap, baseRules(), popA);
  const res2 = await evaluateVariants(snap, baseRules(), popB);

  const fitness1 = res1.ranked.map(r => r.fitness.toFixed(6));
  const fitness2 = res2.ranked.map(r => r.fitness.toFixed(6));
  const winner1 = JSON.stringify(res1.winner);
  const winner2 = JSON.stringify(res2.winner);

  const fitnessEqual = JSON.stringify(fitness1) === JSON.stringify(fitness2);
  const winnerEqual = winner1 === winner2;

  if (fitnessEqual && winnerEqual) {
    log('PASS: Fitness ordering and winner are identical across runs.', 'pass');
  } else {
    log('FAIL: Non-deterministic ordering or winner.', 'fail');
    log('Fitness A: ' + fitness1.join(', '));
    log('Fitness B: ' + fitness2.join(', '));
    log('Winner A: ' + winner1);
    log('Winner B: ' + winner2);
  }
}

runDeterminism().catch(e => {
  console.error(e);
  log('ERROR: ' + e.message, 'fail');
});

