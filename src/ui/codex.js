export function createCodex(maxEntries = 6) {
  return { entries: [], max: maxEntries, visible: true };
}

export function recordAdaptation(codex, roomId, archetype, prevRules, newRules) {
  // Compute top deltas by absolute weight change
  const deltas = [];
  const byPrev = new Map(prevRules.map(r => [r.name, r.weights]));
  for (const r of newRules) {
    const before = byPrev.has(r.name) ? byPrev.get(r.name) : r.weights;
    const after = r.weights;
    const d = after - before;
    deltas.push({ name: r.name, before, after, d });
  }
  deltas.sort((a,b)=> Math.abs(b.d) - Math.abs(a.d));
  const top = deltas.slice(0, 2);
  const entry = { roomId, archetype, changes: top };
  codex.entries.unshift(entry);
  if (codex.entries.length > codex.max) codex.entries.length = codex.max;
}

export function renderCodex(codex, R) {
  if (!codex.visible) return;
  const lh = R.lineHeightPx();
  const x = R.W - 260, y = 16;
  const title = 'Codex — Recent Adaptations';
  R.textWithBg(title, x, y + Math.round(lh), '#cde', 'rgba(0,0,0,0.35)');
  let yy = y + Math.round(lh * 2);
  for (const e of codex.entries) {
    const header = `Room ${e.roomId} • ${e.archetype}`;
    R.textWithBg(header, x, yy, '#eee', 'rgba(0,0,0,0.25)');
    yy += Math.round(lh);
    for (const c of e.changes) {
      const dir = c.d > 0 ? '+' : (c.d < 0 ? '−' : '·');
      const col = c.d > 0 ? '#8fd' : (c.d < 0 ? '#f99' : '#aaa');
      const line = `${c.name}: ${dir}${Math.abs(c.d).toFixed(2)} → ${c.after.toFixed(2)}`;
      R.text(line, x + 8, yy, col);
      yy += Math.round(lh);
    }
    yy += 6;
    if (yy > R.H - 40) break;
  }
}
