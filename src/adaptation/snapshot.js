export function captureSnapshot(state) {
  // Minimal snapshot for demo
  return {
    seed: state.seed,
    player: { x: state.player.x, y: state.player.y },
    enemy: { rules: state.enemy.rules.map(r => ({...r})) },
    // record last N inputs; here we take the most recent horizonSteps
    horizonSteps: 120, dt: 1/120,
    inputs: Array.isArray(state.recorder?.log) ? state.recorder.log.slice(-120) : []
  };
}
export function restoreSnapshot(snap, rules) {
  return {
    seed: snap.seed,
    player: { ...snap.player },
    enemy: { rules: rules.rules.map(r => ({...r})) },
    steps: snap.horizonSteps,
    dt: snap.dt,
    inputs: snap.inputs || [],
    log: { dps: 0, controlTime: 0, jitter: 0, economy: 0, unfairFlags: 0 }
  };
}
export function stepSimulation(sim, dt, inputBits = 0) {
  // Multi-objective toy sim based on rule weights and ghost inputs
  const byName = indexRuleWeights(sim.enemy.rules);
  const approach = byName.Approach ?? (sim.enemy.rules[0]?.weights || 0.5);
  const strafe = byName.Strafe ?? (sim.enemy.rules[1]?.weights || 0.5);
  const keepDist = byName.KeepDistance ?? 0.4;
  const charge = byName.Charge ?? 0.0;
  const area = byName.AreaDeny ?? 0.0;
  const feint = byName.Feint ?? 0.0;

  // Input magnitude: number of directional keys pressed (0..2) + dash weight
  const dirCount = ((inputBits & 1)?1:0)+((inputBits & 2)?1:0)+((inputBits & 4)?1:0)+((inputBits & 8)?1:0);
  const dash = (inputBits & 16) ? 1 : 0;
  const activity = Math.min(2, dirCount) + dash * 0.5;

  // DPS: boosted by charge and area denial; approach helps slightly
  sim.log.dps += 0.02 * ((charge * 1.2) + (area * 0.9) + (approach * 0.5)) * (1 + 0.2 * activity);
  // Control time: approach + keep distance; benefits from player activity
  sim.log.controlTime += 0.008 * (approach * 0.7 + keepDist * 0.6) * (1 + 0.25 * activity);
  // Jitter: reduced by strafe and feints; activity reduces jitter up to point
  sim.log.jitter += Math.max(0, 0.006 - 0.006 * Math.min(1, strafe + 0.2 * feint + 0.15 * activity));
  // Economy: penalize dashes, rewarded slightly by keep distance (efficiency)
  sim.log.economy += 0.002 * keepDist - 0.003 * dash;
  // Fairness: penalize extreme charge without spacing; excessive area spam
  if (charge > 1.6 && keepDist < 0.2) sim.log.unfairFlags += 0.001;
  if (area > 1.5) sim.log.unfairFlags += 0.001;
}

function indexRuleWeights(rules) {
  const out = Object.create(null);
  for (const r of rules) {
    if (r && r.name) out[r.name] = r.weights || 0;
  }
  return out;
}
