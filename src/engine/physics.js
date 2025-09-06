export function overlapCircles(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const r = a.r + b.r;
  return (dx*dx + dy*dy) <= (r*r);
}

// Circle vs AABB overlap test
export function circleAabbOverlap(cx, cy, r, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx*dx + dy*dy) <= (r*r);
}

// Resolve circle vs AABB by pushing circle out along minimal translation vector
export function resolveCircleAabb(e, rect) {
  const cx = e.x, cy = e.y, r = e.r || 0;
  let closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  let closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  let dx = cx - closestX;
  let dy = cy - closestY;
  let d2 = dx*dx + dy*dy;
  if (d2 > r*r) return false;
  let d = Math.sqrt(Math.max(1e-6, d2));
  if (d === 0) {
    // Center is exactly on corner/edge; push out toward shallowest side
    const left = Math.abs((cx - rect.x));
    const right = Math.abs((rect.x + rect.w) - cx);
    const top = Math.abs((cy - rect.y));
    const bottom = Math.abs((rect.y + rect.h) - cy);
    const min = Math.min(left, right, top, bottom);
    if (min === left) { dx = -1; dy = 0; d = 1; closestX = rect.x; }
    else if (min === right) { dx = 1; dy = 0; d = 1; closestX = rect.x + rect.w; }
    else if (min === top) { dx = 0; dy = -1; d = 1; closestY = rect.y; }
    else { dx = 0; dy = 1; d = 1; closestY = rect.y + rect.h; }
  }
  const nx = dx / d;
  const ny = dy / d;
  const push = (r - d);
  e.x += nx * push;
  e.y += ny * push;
  return true;
}

export function resolveCircleAabbs(e, rects) {
  let hit = false;
  for (let i = 0; i < rects.length; i++) {
    if (resolveCircleAabb(e, rects[i])) hit = true;
  }
  return hit;
}
