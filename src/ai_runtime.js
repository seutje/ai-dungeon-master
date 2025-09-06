// Rule-based evaluator with cooldowns and simple blacklist tags.
// Chooses the best rule, sets cooldown, and stores selection in memory.
export function tickAI(enemy, ctx, dt) {
  // Tick down cooldowns
  for (const r of enemy.rules) {
    if (r.cooldown && r.cooldown > 0) r.cooldown = Math.max(0, r.cooldown - dt);
  }
  // Decay telegraph/flash timers
  enemy.memory = enemy.memory || {};
  if (enemy.memory.flash && enemy.memory.flash > 0) enemy.memory.flash = Math.max(0, enemy.memory.flash - dt);
  if (enemy.memory.telegraph && enemy.memory.telegraph.timer > 0) {
    enemy.memory.telegraph.timer = Math.max(0, enemy.memory.telegraph.timer - dt);
  }

  const d = Math.hypot(ctx.player.x - enemy.x, ctx.player.y - enemy.y);

  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < enemy.rules.length; i++) {
    const r = enemy.rules[i];
    // Cooldown gate
    if ((r.cooldown || 0) > 0) continue;
    // Blacklist tags (optional)
    if (isBlacklisted(r, d)) continue;

    let score = r.weights || 0.5;
    // Preference shaping by distance based on rule name
    if (r.name === 'Approach') score *= (d > 120 ? 1.0 : 0.5);
    else if (r.name === 'Strafe') score *= (d <= 160 ? 1.0 : 0.3);

    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  const prev = enemy.memory.lastChoose;
  enemy.memory.lastChoose = bestIdx;
  // Apply cooldown for the chosen rule
  const chosen = enemy.rules[bestIdx];
  chosen.cooldown = (chosen.cdMs ? chosen.cdMs : 250) / 1000;

  // Telegraph on rule switch
  if (prev !== bestIdx) {
    const color = chosen.name === 'Approach' ? '#ffa94d' : '#ffe066';
    enemy.memory.telegraph = { text: chosen.name, timer: 0.35, color };
    enemy.memory.flash = 0.18;
  }
}

function isBlacklisted(rule, distance) {
  const tags = rule.blacklistTags || rule.blacklist || [];
  for (const t of tags) {
    if (t === 'NoClose' && distance < 100) return true;
    if (t === 'NoFar' && distance > 200) return true;
  }
  return false;
}
