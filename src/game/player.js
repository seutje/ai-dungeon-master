export function createPlayer(x, y) {
  return { x, y, r: 12, speed: 200, dashCd: 0, dashTime: 0, vx:0, vy:0, hp: 100 };
}
export function handleInput(p, keys, dt) {
  let dx = (keys['ArrowRight']||keys['KeyD']?1:0) - (keys['ArrowLeft']||keys['KeyA']?1:0);
  let dy = (keys['ArrowDown']||keys['KeyS']?1:0) - (keys['ArrowUp']||keys['KeyW']?1:0);
  const len = Math.hypot(dx, dy) || 1;
  p.vx = (dx/len) * p.speed;
  p.vy = (dy/len) * p.speed;
  if (keys['Space'] && p.dashCd <= 0) { p.dashTime = 0.12; p.dashCd = 0.9; }
  if (p.dashTime > 0) { p.vx *= 3.2; p.vy *= 3.2; p.dashTime -= dt; }
  if (p.dashCd > 0) p.dashCd -= dt;
}
export function stepPlayer(p, dt, boundsW, boundsH) {
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.x = Math.max(p.r, Math.min(boundsW - p.r, p.x));
  p.y = Math.max(p.r, Math.min(boundsH - p.r, p.y));
}
