export function createEnemy(x, y) {
  return {
    x, y, r: 12, speed: 140, vx: 0, vy: 0,
    rules: [
      { name:'Approach', weights: 0.8, cooldown: 0, cdMs: 150 },
      { name:'Strafe', weights: 0.2, cooldown: 0, cdMs: 300 }
    ],
    memory: { lastChoose: 0 },
    hp: 60
  };
}
export function stepEnemy(e, player, dt) {
  // Very dumb placeholder behavior: approach with a bit of orbit
  const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
  const towardX = dx / d, towardY = dy / d;
  const orbit = 0.6;
  e.vx = (towardX + -towardY * orbit) * e.speed;
  e.vy = (towardY + towardX * orbit) * e.speed;
  e.x += e.vx * dt; e.y += e.vy * dt;
}
