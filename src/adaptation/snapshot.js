export function captureSnapshot(state) {
  // Minimal snapshot for demo
  return {
    seed: state.seed,
    player: { x: state.player.x, y: state.player.y },
    enemy: { rules: state.enemy.rules.map(r => ({...r})) },
    horizonSteps: 120, dt: 1/120
  };
}
export function restoreSnapshot(snap, rules) {
  return {
    seed: snap.seed,
    player: { ...snap.player },
    enemy: { rules: rules.rules.map(r => ({...r})) },
    steps: snap.horizonSteps,
    dt: snap.dt,
    log: { dps: 0, controlTime: 0, jitter: 0, economy: 0, unfairFlags: 0 }
  };
}
export function stepSimulation(sim, dt) {
  // Toy sim that nudges "performance" based on rule weights
  const approachW = sim.enemy.rules[0].weights || 0.5;
  const strafeW = sim.enemy.rules[1].weights || 0.5;
  // Fake signals: approach improves "controlTime" if player is far; strafe reduces "jitter"
  sim.log.controlTime += 0.01 * approachW;
  sim.log.jitter += Math.max(0, 0.006 - 0.006 * Math.min(1, strafeW));
}
