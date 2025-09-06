import { CONFIG } from '../config.js';

export function fitness(log) {
  const w = CONFIG.FITNESS_WEIGHTS || { dps:1, control:0.6, economy:0.3, jitter:-0.5, unfair:-2 };
  return (
    (w.dps || 0) * (log.dps || 0) +
    (w.control || 0) * (log.controlTime || 0) +
    (w.economy || 0) * (log.economy || 0) +
    (w.jitter || 0) * (log.jitter || 0) +
    (w.unfair || 0) * (log.unfairFlags || 0)
  );
}
