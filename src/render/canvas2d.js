export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  function clear() {
    ctx.fillStyle = '#0e0e13';
    ctx.fillRect(0, 0, W, H);
  }
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function text(s, x, y) {
    ctx.fillStyle = '#eaeaea'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(s, x, y);
  }
  return { clear, circle, text, W, H };
}
