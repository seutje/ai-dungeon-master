// Reusable action atoms for enemy behavior (demo-friendly, minimal state)

// Move toward a point (tx, ty) with a speed multiplier.
export function moveToward(e, tx, ty, baseSpeed, speedMul, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const vx = (dx / d) * baseSpeed * (speedMul || 1);
  const vy = (dy / d) * baseSpeed * (speedMul || 1);
  e.x += vx * dt; e.y += vy * dt;
  return { vx, vy };
}

// Strafe around a target with tangential component (orbit in [0..1]).
export function strafeAround(e, target, baseSpeed, orbit = 0.6, dt) {
  const dx = target.x - e.x, dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const tx = dx / d, ty = dy / d; // toward
  const vx = (tx + -ty * orbit) * baseSpeed;
  const vy = (ty + tx * orbit) * baseSpeed;
  e.x += vx * dt; e.y += vy * dt;
  return { vx, vy };
}

// Charge: windup then burst movement for duration.
// Usage: const charge = makeCharge({ windup_ms:300, duration_ms:600, mul:2.8 });
// Each frame: const done = charge.update(enemy, player, dt);
export function makeCharge(params = {}) {
  let wind = (params.windup_ms ?? 300) / 1000;
  let dur = (params.duration_ms ?? 600) / 1000;
  const mul = params.mul ?? 3.0;
  let heading = { x: 0, y: 0 };
  return {
    update(e, target, dt, baseSpeed = e.speed) {
      if (wind > 0) {
        // lock heading during windup
        const dx = target.x - e.x, dy = target.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        heading.x = dx / d; heading.y = dy / d;
        wind -= dt; return false;
      }
      if (dur > 0) {
        const vx = heading.x * baseSpeed * mul;
        const vy = heading.y * baseSpeed * mul;
        e.x += vx * dt; e.y += vy * dt;
        dur -= dt; return false;
      }
      return true; // done
    }
  };
}

// BurstFire (stub): returns a list of projectile specs (engine TBD).
export function burstFire(origin, target, count = 3, spread = 0.1, speed = 420) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const d = Math.hypot(dx, dy) || 1;
  const dirX = dx / d, dirY = dy / d;
  const shots = [];
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * spread;
    const cs = Math.cos(a), sn = Math.sin(a);
    const vx = dirX * cs - dirY * sn;
    const vy = dirX * sn + dirY * cs;
    shots.push({ x: origin.x, y: origin.y, vx: vx * speed, vy: vy * speed });
  }
  return shots;
}

// Feint (stub): return a short duration that callers can use to telegraph.
export function feint(duration_ms = 200) {
  return { remaining: duration_ms / 1000 };
}

// Keep distance: move away if closer than desired range; otherwise orbit slowly.
export function keepDistance(e, target, baseSpeed, desired = 220, dt) {
  const dx = target.x - e.x, dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < desired) {
    // move away to open space
    const vx = (-dx / d) * baseSpeed * 0.9;
    const vy = (-dy / d) * baseSpeed * 0.9;
    e.x += vx * dt; e.y += vy * dt; return { vx, vy };
  } else {
    // gentle orbit when comfortable
    const tx = dx / d, ty = dy / d;
    const orbit = 0.4;
    const vx = (tx + -ty * orbit) * baseSpeed * 0.6;
    const vy = (ty + tx * orbit) * baseSpeed * 0.6;
    e.x += vx * dt; e.y += vy * dt; return { vx, vy };
  }
}
