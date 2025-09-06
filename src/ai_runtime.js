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
  const hz = ctx.hazards || [];
  const hazardNear = nearestHazardDistance(hz, enemy) < 28 ? 1 : 0;

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
    if (r.name === 'Approach') {
      score *= (d > 120 ? 1.0 : 0.5);
      if (hazardNear) score *= 0.7; // avoid pushing into hazards
    } else if (r.name === 'Strafe') {
      score *= (d <= 160 ? 1.0 : 0.3);
      if (hazardNear) score *= 1.1;
    } else if (r.name === 'KeepDistance') {
      score *= (d < 220 ? 1.2 : 0.7);
      if (hazardNear) score *= 1.15;
    } else if (r.name === 'Charge') {
      // prefer mid-range to start a charge
      score *= (d > 90 && d < 220) ? 1.1 : 0.4;
      if (hazardNear) score *= 0.8;
    } else if (r.name === 'AreaDeny') {
      // prefer when player shares nearby space or mid-range
      score *= (d > 80 && d < 260) ? 1.0 : 0.5;
    } else if (r.name === 'Feint') {
      // occasional feint to disrupt rhythm, more likely when close
      score *= (d < 160 ? 0.8 : 0.3);
    }

    // Archetype-specific preference shaping to create distinct behaviors
    const arch = enemy.archetype || 'Grunt';
    if (arch === 'Grunt') {
      if (r.name === 'Approach') score *= 1.2;
      if (r.name === 'Charge') score *= 1.3;
      if (r.name === 'KeepDistance') score *= 0.6;
      if (r.name === 'Strafe') score *= 0.9;
    } else if (arch === 'Ranged') {
      if (r.name === 'Approach') score *= 0.4;
      if (r.name === 'KeepDistance') score *= 1.35;
      if (r.name === 'Strafe') score *= 1.15;
      if (r.name === 'Charge') score *= 0.3;
    } else if (arch === 'Support') {
      if (r.name === 'Strafe') score *= 1.3;
      if (r.name === 'Feint') score *= 1.2;
      if (r.name === 'Approach') score *= 0.7;
    } else if (arch === 'Boss') {
      // keep boss flexible but mildly prefer area/charge in later phases
      if ((enemy.memory?.phase||1) >= 2) {
        if (r.name === 'AreaDeny') score *= 1.15;
        if (r.name === 'Charge') score *= 1.1;
      }
    }

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
    const mul = (ctx.settings && ctx.settings.telegraph === 'low') ? 0.6 : (ctx.settings && ctx.settings.telegraph === 'high') ? 1.4 : 1.0;
    const dur = 0.45 * mul;
    enemy.memory.telegraph = { text: chosen.name, timer: dur, duration: dur, color, just: true };
    enemy.memory.flash = 0.14;
  }
}

function nearestHazardDistance(hazards, e) {
  let best = Infinity;
  for (const h of hazards) {
    if (h.type === 'spike') {
      if (!h.active) continue;
      const dx = h.x - e.x, dy = h.y - e.y;
      const d = Math.hypot(dx, dy) - (h.r || 0);
      if (d < best) best = d;
    } else if (h.type === 'beam') {
      // Distance from point to beam segment
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(e.x, e.y, x1, y1, x2, y2) - (h.width || 6);
      if (d < best) best = d;
    }
  }
  return best;
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx*wx + vy*wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx*vx + vy*vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  const bx = x1 + b*vx, by = y1 + b*vy;
  return Math.hypot(px - bx, py - by);
}

function isBlacklisted(rule, distance) {
  const tags = rule.blacklistTags || rule.blacklist || [];
  for (const t of tags) {
    if (t === 'NoClose' && distance < 100) return true;
    if (t === 'NoFar' && distance > 200) return true;
  }
  return false;
}
