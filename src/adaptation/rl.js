// Simple evolution strategies style RL update for rule weights
// Proposes Gaussian perturbations around current weights, evaluates them,
// and applies a weighted update toward higher-fitness samples.

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

export function proposePopulation(baseRules, count, sigma = 0.15, rng = Math.random) {
  const pop = [];
  for (let i = 0; i < count; i++) {
    const eps = [];
    const rules = baseRules.rules.map((r) => {
      const e = (gauss(rng) * sigma);
      eps.push(e);
      return { ...r, weights: clamp((r.weights || 0.5) + e, 0.05, 2.0) };
    });
    pop.push({ rules: { rules }, _eps: eps });
  }
  return pop;
}

export function applyEsUpdate(baseRules, results, alpha = 0.6, sigma = 0.15) {
  // results: array of { fitness, rules: { rules: [...] , _eps: [...] } }
  if (!results.length) return baseRules;
  const K = results.length;
  // z-score normalize fitness
  const mean = results.reduce((a, r) => a + (r.fitness || 0), 0) / K;
  const varv = results.reduce((a, r) => { const d = (r.fitness || 0) - mean; return a + d*d; }, 0) / Math.max(1, K-1);
  const std = Math.sqrt(Math.max(1e-8, varv));
  const z = results.map(r => ((r.fitness || 0) - mean) / std);
  // accumulate gradient estimate per rule index
  const n = baseRules.rules.length;
  const grad = new Array(n).fill(0);
  for (let i = 0; i < K; i++) {
    const eps = results[i].rules._eps || [];
    for (let j = 0; j < n; j++) grad[j] += (z[i] || 0) * (eps[j] || 0);
  }
  for (let j = 0; j < n; j++) grad[j] /= (K * sigma);
  // apply update
  const updated = { rules: baseRules.rules.map((r, i) => ({ ...r, weights: clamp((r.weights||0.5) + alpha * grad[i], 0.05, 2.0) })) };
  return updated;
}

// Box-Muller
function gauss(rng) {
  let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

