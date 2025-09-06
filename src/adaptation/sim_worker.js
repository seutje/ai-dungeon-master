import { restoreSnapshot, stepSimulation } from './snapshot.js';
import { fitness } from './fitness.js';

self.onmessage = e => {
  const { id, snapshot, rules } = e.data;
  const sim = restoreSnapshot(snapshot, rules);
  // Deterministic PRNG (Mulberry32) for tiny input jitter
  let t = (sim.seed >>> 0) + 1337;
  const rng = () => {
    t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < sim.steps; i++) {
    let bits = sim.inputs[i] || 0;
    // Small, fair jitter: occasionally drop or add a direction (5% chance)
    if (rng() < 0.05) {
      const mask = 1 << (Math.floor(rng() * 4) & 3); // one of Up/Down/Left/Right
      bits ^= mask; // toggle
    }
    stepSimulation(sim, sim.dt, bits);
  }
  const fit = fitness(sim.log);
  self.postMessage({ id, fitness: fit, fairness: sim.log.unfairFlags || 0, rules });
};
