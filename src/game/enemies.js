import { moveToward, strafeAround, keepDistance, makeCharge } from '../actions.js';

export function createEnemy(type, x, y) {
  // Backward compatibility: if first arg is number, assume old signature
  if (typeof type === 'number') {
    return createEnemy('grunt', type, x);
  }
  const base = { x, y, r: 12, vx: 0, vy: 0, memory: { lastChoose: 0 }, hp: 60 };
  if (type === 'ranged') {
    return {
      ...base,
      archetype: 'Ranged', speed: 135,
      rules: [
        { name:'KeepDistance', weights: 0.9, cooldown: 0, cdMs: 220 },
        { name:'Strafe',       weights: 0.6, cooldown: 0, cdMs: 320 }
      ]
    };
  } else if (type === 'support') {
    return {
      ...base,
      archetype: 'Support', speed: 120,
      rules: [
        { name:'Strafe',   weights: 0.7, cooldown: 0, cdMs: 260 },
        { name:'Approach', weights: 0.4, cooldown: 0, cdMs: 240 }
      ]
    };
  }
  // default grunt
  return {
    ...base,
    archetype: 'Grunt', speed: 150,
    rules: [
      { name:'Approach', weights: 0.8, cooldown: 0, cdMs: 150, blacklistTags: ['NoClose'] },
      { name:'Charge',   weights: 0.3, cooldown: 0, cdMs: 900 }
    ]
  };
}
export function stepEnemy(e, player, dt) {
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
  } else {
    // Fallback behavior
    const v = moveToward(e, player.x, player.y, e.speed, 0.8, dt);
    e.vx = v.vx; e.vy = v.vy;
  }
}
