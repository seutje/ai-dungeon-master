export function createProjectileSystem() {
  return { list: [], pool: [] };
}

// owner: 'enemy' | 'player' (default: 'enemy' for backward-compat)
export function spawnBullet(sys, x, y, vx, vy, damage = 10, life = 2, radius = 3, color = '#9ad', owner = 'enemy') {
  const p = (sys.pool.length ? sys.pool.pop() : {});
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = radius; p.damage = damage; p.life = life; p.color = color; p.owner = owner;
  sys.list.push(p);
}

// Optionally pass enemy plus callbacks for scoring
// onEnemyHit(damage), onEnemyKilled()
export function stepProjectiles(sys, dt, boundsW, boundsH, player, enemy, onEnemyHit, onEnemyKilled) {
  const list = sys.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    // Out of bounds or expired
    if (p.life <= 0 || p.x < -8 || p.x > boundsW + 8 || p.y < -8 || p.y > boundsH + 8) {
      sys.pool.push(list.splice(i, 1)[0]);
      continue;
    }
    if (p.owner === 'enemy') {
      // Player collision (circle-circle)
      const dx = player.x - p.x, dy = player.y - p.y;
      const rr = (player.r + p.r);
      if (dx*dx + dy*dy <= rr*rr) {
        if (!player.invuln || player.invuln <= 0) {
          player.hp = Math.max(0, player.hp - p.damage);
        }
        sys.pool.push(list.splice(i, 1)[0]);
      }
    } else if (p.owner === 'player' && enemy) {
      // Enemy collision
      const dx = enemy.x - p.x, dy = enemy.y - p.y;
      const rr = ((enemy.r || 12) + p.r);
      if (dx*dx + dy*dy <= rr*rr) {
        if (typeof onEnemyHit === 'function') onEnemyHit(p.damage);
        enemy.hp = Math.max(0, (enemy.hp || 0) - p.damage);
        const killed = enemy.hp <= 0;
        sys.pool.push(list.splice(i, 1)[0]);
        if (killed && typeof onEnemyKilled === 'function') onEnemyKilled();
      }
    }
  }
}

export function renderProjectiles(sys, R) {
  for (const p of sys.list) {
    R.circle(p.x, p.y, p.r, p.color || '#9ad', '#89a');
  }
}
