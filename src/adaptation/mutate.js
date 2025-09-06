import { CONFIG } from '../config.js';

export function mutatePopulation(base, count, rng = Math.random) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(mutateOnce(structuredClone(base), rng));
  return out;
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function mutateOnce(ruleSet, rng) {
  const rate = (CONFIG.MUTATION_RATE ?? 0.25);
  const wSpan = rate * 0.6 + 0.2; // weight magnitude band
  const cdBase = rate * 0.4 + 0.1; // smaller tweaks for cooldowns

  let mutated = 0;
  for (let i = 0; i < ruleSet.rules.length; i++) {
    if (rng() < rate) {
      const r = ruleSet.rules[i];
      r.weights = clamp(r.weights * (1 - wSpan + rng() * (2 * wSpan)), 0.05, 2.0);
      // Occasionally tweak cooldowns to discover different rhythms
      if (r.cdMs != null && rng() < 0.3) {
        const mul = (1 - cdBase) + rng() * (2 * cdBase);
        r.cdMs = Math.max(120, Math.min(1200, Math.round(r.cdMs * mul)));
      }
      mutated++;
    }
  }
  // Ensure at least one change per variant
  if (mutated === 0 && ruleSet.rules.length > 0) {
    const j = Math.floor(rng() * ruleSet.rules.length) | 0;
    const r = ruleSet.rules[j];
    r.weights = clamp(r.weights * (1 - wSpan + rng() * (2 * wSpan)), 0.05, 2.0);
  }
  return { rules: ruleSet.rules };
}
