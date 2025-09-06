import { initPool, evaluateVariants } from '../src/adaptation/worker_pool.js';
import { mutatePopulation } from '../src/adaptation/mutate.js';
import { CONFIG, loadConfig } from '../src/config.js';

const out = document.getElementById('out');
out.textContent = '';
function log(msg, cls) { const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls; out.appendChild(d); }

function makeSnapshot(seed, inputs) {
  return { seed, player: { x: 100, y: 100 }, enemy: { rules: [] }, horizonSteps: inputs.length, dt: 1/120, inputs };
}
function makeInputs(pattern, steps=90) {
  const arr = new Array(steps).fill(0);
  if (pattern === 'camp') return arr; // never moves
  if (pattern === 'dash_spam') { for (let i=0;i<steps;i++){ if (i%6===0) arr[i]|=16; } return arr; }
  if (pattern === 'strafe') { for (let i=0;i<steps;i++){ arr[i] |= (i%2?4:8);} return arr; }
  return arr;
}
function baseRules() { return { rules: [ { name:'Approach', weights:0.8, cooldown:0, cdMs:150 }, { name:'Strafe', weights:0.2, cooldown:0, cdMs:300 } ]}; }

async function run() {
  await loadConfig().catch(()=>{});
  initPool(2);
  const pop = mutatePopulation(baseRules(), 24);
  const fairMax = CONFIG.FAIRNESS_MAX || 0.02;

  const scenarios = [
    { name:'Camp (no movement)', snap: makeSnapshot(111, makeInputs('camp')) },
    { name:'Dash spam', snap: makeSnapshot(222, makeInputs('dash_spam')) },
  ];
  for (const sc of scenarios) {
    log(`Evaluating: ${sc.name}…`);
    const res = await evaluateVariants(sc.snap, baseRules(), pop);
    const top = res.ranked[0];
    const fair = (top.fairness || 0);
    const cls = fair <= fairMax ? 'ok' : (fair <= fairMax*2 ? 'warn' : 'bad');
    log(`Top fairness=${fair.toFixed(4)} (threshold ${fairMax})`, cls);
  }
  log('Done.');
}
run().catch(e => { console.error(e); log('ERROR: '+e.message, 'bad'); });

