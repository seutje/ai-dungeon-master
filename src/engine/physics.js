export function overlapCircles(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const r = a.r + b.r;
  return (dx*dx + dy*dy) <= (r*r);
}
