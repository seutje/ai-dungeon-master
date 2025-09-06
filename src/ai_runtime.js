// Placeholder rule evaluator (expand later)
export function tickAI(enemy, ctx, dt) {
  // Score simple two-rule set to demonstrate "weights" being adapted.
  const d = Math.hypot(ctx.player.x - enemy.x, ctx.player.y - enemy.y);
  // pretend 'Approach' gets priority when far; 'Strafe' when close
  const approachScore = enemy.rules[0].weights * (d > 120 ? 1 : 0.5);
  const strafeScore = enemy.rules[1].weights * (d <= 160 ? 1 : 0.3);
  enemy.memory.lastChoose = (approachScore >= strafeScore) ? 0 : 1;
  // real action execution happens in enemies.stepEnemy for demo
}
