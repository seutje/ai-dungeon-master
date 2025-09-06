export function createPlayer(x, y) {
  const maxHp = 100;
  return { x, y, r: 12, speed: 200, dashCd: 0, dashTime: 0, vx:0, vy:0, hp: maxHp, maxHp, invuln: 0, shootCd: 0 };
}
export function handleInput(p, keys, dt) {
  // keys here are logical actions: { Up, Down, Left, Right, Dash }
  let dx = (keys.Right?1:0) - (keys.Left?1:0);
  let dy = (keys.Down?1:0) - (keys.Up?1:0);
  const len = Math.hypot(dx, dy) || 1;
  p.vx = (dx/len) * p.speed;
  p.vy = (dy/len) * p.speed;
  if (keys.Dash && p.dashCd <= 0) { p.dashTime = 0.12; p.dashCd = 0.9; p.invuln = Math.max(p.invuln||0, 0.16); }
  if (p.dashTime > 0) { p.vx *= 3.2; p.vy *= 3.2; p.dashTime -= dt; }
  if (p.dashCd > 0) p.dashCd -= dt;
}
export function stepPlayer(p, dt, boundsW, boundsH) {
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.x = Math.max(p.r, Math.min(boundsW - p.r, p.x));
  p.y = Math.max(p.r, Math.min(boundsH - p.r, p.y));
  if (p.invuln && p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.shootCd && p.shootCd > 0) p.shootCd = Math.max(0, p.shootCd - dt);
}
