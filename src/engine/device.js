export function computeSimScale() {
  const hc = (navigator.hardwareConcurrency || 4);
  const mem = (navigator.deviceMemory || 8);
  let scale = 1.0;
  if (hc <= 2) scale *= 0.4; else if (hc <= 4) scale *= 0.65; else if (hc <= 6) scale *= 0.85;
  if (mem <= 2) scale *= 0.8; else if (mem <= 4) scale *= 0.9;
  // Clamp
  return Math.max(0.25, Math.min(1.0, scale));
}

