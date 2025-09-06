export function mutatePopulation(base, count, rng=Math.random) {
  const out = [];
  for (let i=0;i<count;i++) out.push(mutateOnce(structuredClone(base), rng));
  return out;
}
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function mutateOnce(ruleSet, rng) {
  // Weight nudge for demo: randomly tweak either rule 0 or 1
  const idx = (rng() < 0.5 ? 0 : 1);
  const r = ruleSet.rules[idx];
  r.weights = clamp(r.weights * (0.85 + rng()*0.3), 0.05, 2.0);
  return { rules: ruleSet.rules };
}
