export function createProjectileSystem() {
  return { list: [] };
}

export function spawnBullet(sys, x, y, vx, vy, damage = 10, life = 2, radius = 3, color = '#9ad') {
  sys.list.push({ x, y, vx, vy, r: radius, damage, life, color });
}

export function stepProjectiles(sys, dt, boundsW, boundsH, player) {
  const list = sys.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    // Out of bounds or expired
    if (p.life <= 0 || p.x < -8 || p.x > boundsW + 8 || p.y < -8 || p.y > boundsH + 8) {
      list.splice(i, 1); continue;
    }
    // Player collision (circle-circle)
    const dx = player.x - p.x, dy = player.y - p.y;
    const rr = (player.r + p.r);
    if (dx*dx + dy*dy <= rr*rr) {
      player.hp = Math.max(0, player.hp - p.damage);
      list.splice(i, 1);
    }
  }
}

export function renderProjectiles(sys, R) {
  for (const p of sys.list) {
    R.circle(p.x, p.y, p.r, p.color || '#9ad', '#89a');
  }
}
