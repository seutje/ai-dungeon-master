import { moveToward, strafeAround, keepDistance, makeCharge, feint } from '../actions.js';

export function createEnemy(type, x, y) {
  // Backward compatibility: if first arg is number, assume old signature
  if (typeof type === 'number') {
    return createEnemy('enemy', type, x);
  }
  const base = { x, y, r: 12, vx: 0, vy: 0, memory: { lastChoose: 0 }, hp: 60, maxHp: 60 };
  // Single generic enemy with a compact rule set (no archetypes/boss)
  return {
    ...base,
    speed: 150,
    rules: [
      { name:'Approach',     weights: 0.8, cooldown: 0, cdMs: 180 },
      { name:'Strafe',       weights: 0.6, cooldown: 0, cdMs: 260 },
      { name:'KeepDistance', weights: 0.5, cooldown: 0, cdMs: 280 },
      { name:'Charge',       weights: 0.3, cooldown: 0, cdMs: 900 },
      { name:'Feint',        weights: 0.2, cooldown: 0, cdMs: 700 }
    ]
  };
}
export function stepEnemy(e, player, dt, emitProjectile) {
  // Execute movement based on last chosen rule from ai_runtime
  const idx = e.memory.lastChoose | 0;
  const name = e.rules[idx]?.name || 'Approach';
  if (name === 'Approach') {
    const v = moveToward(e, player.x, player.y, e.speed, 1.0, dt);
    e.vx = v.vx; e.vy = v.vy;
  } else if (name === 'Strafe') {
    const v = strafeAround(e, player, e.speed, 0.6, dt);
    e.vx = v.vx; e.vy = v.vy;
  } else if (name === 'KeepDistance') {
    const v = keepDistance(e, player, e.speed, 220, dt);
    e.vx = v.vx; e.vy = v.vy;
  } else if (name === 'Charge') {
    // Stateful charge using memory
    if (!e.memory.charge) e.memory.charge = makeCharge({ windup_ms: 220, duration_ms: 420, mul: 3.0 });
    const done = e.memory.charge.update(e, player, dt, e.speed);
    if (done) e.memory.charge = null; // finished charge
  } else if (name === 'Feint') {
    e.memory.feint = e.memory.feint || feint(250);
    e.memory.feint.remaining -= dt;
    if (e.memory.feint.remaining <= 0) e.memory.feint = null;
  } else {
    // Fallback behavior
    const v = moveToward(e, player.x, player.y, e.speed, 0.8, dt);
    e.vx = v.vx; e.vy = v.vy;
  }

  // Apply short evasion burst if set by AI (near-miss dodge)
  if (e.memory && e.memory.evadeTimer && e.memory.evadeTimer > 0 && e.memory.evadeDir) {
    e.vx += e.memory.evadeDir.x * e.speed * 1.8;
    e.vy += e.memory.evadeDir.y * e.speed * 1.8;
    e.memory.evadeTimer = Math.max(0, e.memory.evadeTimer - dt);
  }
}

function tuneRuleWeight(e, name, to) {
  const r = e.rules.find(r => r.name === name);
  if (r) r.weights = Math.max(0.05, to);
}
function telegraphPhase() { /* removed */ }
