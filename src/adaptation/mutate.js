import { CONFIG } from '../config.js';

export function mutatePopulation(base, count, rng=Math.random) {
  const out = [];
  for (let i=0;i<count;i++) out.push(mutateOnce(structuredClone(base), rng));
  return out;
}
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function mutateOnce(ruleSet, rng) {
  // Weight nudge for demo: randomly tweak either rule 0 or 1
  const idx = Math.floor(rng() * ruleSet.rules.length) | 0;
  const r = ruleSet.rules[idx];
  const rate = (CONFIG.MUTATION_RATE ?? 0.25);
  const span = rate * 0.6 + 0.2; // shape magnitude a bit
  r.weights = clamp(r.weights * (1 - span + rng()*(2*span)), 0.05, 2.0);
  return { rules: ruleSet.rules };
}
