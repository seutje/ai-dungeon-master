import { restoreSnapshot, stepSimulation } from './snapshot.js';
import { fitness } from './fitness.js';

self.onmessage = e => {
  const { id, snapshot, rules } = e.data;
  const sim = restoreSnapshot(snapshot, rules);
  for (let i = 0; i < sim.steps; i++) stepSimulation(sim, sim.dt);
  const fit = fitness(sim.log);
  self.postMessage({ id, fitness: fit, rules });
};
