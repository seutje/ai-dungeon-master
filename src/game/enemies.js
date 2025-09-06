import { moveToward, strafeAround, keepDistance, makeCharge, burstFire, radialBurst, feint } from '../actions.js';

export function createEnemy(type, x, y) {
  // Backward compatibility: if first arg is number, assume old signature
  if (typeof type === 'number') {
    return createEnemy('grunt', type, x);
  }
  const base = { x, y, r: 12, vx: 0, vy: 0, memory: { lastChoose: 0 }, hp: 60, maxHp: 60 };
  if (type === 'ranged') {
    return {
      ...base,
      archetype: 'Ranged', speed: 130,
      rules: [
        { name:'KeepDistance', weights: 0.9, cooldown: 0, cdMs: 220 },
        { name:'Strafe',       weights: 0.6, cooldown: 0, cdMs: 320 }
      ]
    };
  } else if (type === 'support') {
    return {
      ...base,
      archetype: 'Support', speed: 110,
      rules: [
        { name:'Strafe',   weights: 0.9, cooldown: 0, cdMs: 260 },
        { name:'Feint',    weights: 0.6, cooldown: 0, cdMs: 700 },
        { name:'Approach', weights: 0.3, cooldown: 0, cdMs: 260 }
      ]
    };
  } else if (type === 'boss') {
    return {
      ...base,
      archetype: 'Boss', speed: 150,
      rules: [
        { name:'Approach',   weights: 0.9, cooldown: 0, cdMs: 180 },
        { name:'Strafe',     weights: 0.6, cooldown: 0, cdMs: 260 },
        { name:'KeepDistance', weights: 0.5, cooldown: 0, cdMs: 280 },
        { name:'Charge',     weights: 0.4, cooldown: 0, cdMs: 800 },
        { name:'AreaDeny',   weights: 0.3, cooldown: 0, cdMs: 900 },
        { name:'Feint',      weights: 0.2, cooldown: 0, cdMs: 700 },
        // New boss mechanics
        { name:'SpikeField', weights: 0.45, cooldown: 0, cdMs: 1200 },
        { name:'LaserSweep', weights: 0.4,  cooldown: 0, cdMs: 1400 }
      ],
      memory: { lastChoose: 0, phase: 1, phaseTimer: 0 }
    };
  }
  // default grunt
  return {
    ...base,
    archetype: 'Grunt', speed: 165,
    rules: [
      { name:'Approach', weights: 0.8, cooldown: 0, cdMs: 150, blacklistTags: ['NoClose'] },
      { name:'Charge',   weights: 0.3, cooldown: 0, cdMs: 900 }
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
  } else if (name === 'AreaDeny') {
    if (emitProjectile) {
      e.memory.burstCd = (e.memory.burstCd || 0) - dt;
      if (e.memory.burstCd <= 0) {
        const shots = radialBurst({ x: e.x, y: e.y }, 10 + (e.memory.phase||1)*2, 340 + (e.memory.phase||1)*30);
        for (const s of shots) emitProjectile(s);
        e.memory.burstCd = 1.2;
      }
    }
  } else if (name === 'SpikeField') {
    // One-shot: spawn temporary spikes around player
    e.memory._didSpikeField = e.memory._didSpikeField || 0;
    if (!e.memory._spikeLatch) {
      e.memory._spikeLatch = true;
      const count = 6;
      const radius = 110;
      const hazards = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const hx = player.x + Math.cos(a) * radius;
        const hy = player.y + Math.sin(a) * radius;
        hazards.push({ type:'spike', x: Math.round(hx), y: Math.round(hy), r: 16, period: 1.2, phase: (i*0.35)% (Math.PI*2), active: false, ttl: 6.0 });
      }
      (e.memory.spawnHazards || (e.memory.spawnHazards = [])).push(...hazards);
    }
  } else if (name === 'LaserSweep') {
    // One-shot: spawn a temporary rotating beam centered on boss
    if (!e.memory._laserLatch) {
      e.memory._laserLatch = true;
      const dx = player.x - e.x, dy = player.y - e.y;
      const base = Math.atan2(dy, dx) - 0.6; // start slightly before player
      const hazard = { type:'beam', cx: Math.round(e.x), cy: Math.round(e.y), len: 420, angle: base, angVel: 1.5, width: 10, ttl: 4.0 };
      (e.memory.spawnHazards || (e.memory.spawnHazards = [])).push(hazard);
    }
  } else if (name === 'Feint') {
    e.memory.feint = e.memory.feint || feint(250);
    e.memory.feint.remaining -= dt;
    if (e.memory.feint.remaining <= 0) e.memory.feint = null;
  } else {
    // Fallback behavior
    const v = moveToward(e, player.x, player.y, e.speed, 0.8, dt);
    e.vx = v.vx; e.vy = v.vy;
  }

  // Ranged archetype: fire periodically when within reasonable distance
  if (e.archetype === 'Ranged' && emitProjectile) {
    e.memory.shootCd = (e.memory.shootCd || 0) - dt;
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (e.memory.shootCd <= 0 && d <= 340) {
      const shots = burstFire({ x: e.x, y: e.y }, player, 3, 0.09, 500);
      for (const s of shots) emitProjectile(s);
      e.memory.shootCd = 0.9;
    }
  }

  // Boss multi-phase progression driven by time gates
  if (e.archetype === 'Boss') {
    e.memory.phase = e.memory.phase || 1;
    e.memory.phaseTimer = (e.memory.phaseTimer || 0) + dt;
    if (e.memory.phase === 1 && e.memory.phaseTimer > 6) {
      e.memory.phase = 2;
      // unlock stronger offense
      tuneRuleWeight(e, 'Charge', 0.6);
      tuneRuleWeight(e, 'AreaDeny', 0.6);
      tuneRuleWeight(e, 'SpikeField', 0.55);
      telegraphPhase(e, 'Phase 2');
    } else if (e.memory.phase === 2 && e.memory.phaseTimer > 12) {
      e.memory.phase = 3;
      tuneRuleWeight(e, 'KeepDistance', 0.8);
      tuneRuleWeight(e, 'Strafe', 0.8);
      tuneRuleWeight(e, 'LaserSweep', 0.55);
      telegraphPhase(e, 'Phase 3');
    }
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
function telegraphPhase(e, label) {
  e.memory.telegraph = { text: label, timer: 0.9, duration: 0.9, color: '#79f', just: true };
  e.memory.flash = 0.2;
}
