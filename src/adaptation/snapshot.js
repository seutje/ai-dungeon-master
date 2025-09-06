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
  // Toy sim that nudges performance based on rule weights and ghost inputs
  const approachW = sim.enemy.rules[0].weights || 0.5;
  const strafeW = sim.enemy.rules[1].weights || 0.5;
  // Input magnitude: number of directional keys pressed (0..2) + dash weight
  const dirCount = ((inputBits & 1)?1:0)+((inputBits & 2)?1:0)+((inputBits & 4)?1:0)+((inputBits & 8)?1:0);
  const dash = (inputBits & 16) ? 1 : 0;
  const activity = Math.min(2, dirCount) + dash * 0.5;
  // Approach improves control when player is active (closing distance), strafe reduces jitter.
  sim.log.controlTime += 0.008 * approachW * (1 + 0.25 * activity);
  sim.log.jitter += Math.max(0, 0.006 - 0.006 * Math.min(1, strafeW + 0.15 * activity));
  // Economy proxy: dashing reduces economy slightly
  sim.log.economy += -0.002 * dash;
}
