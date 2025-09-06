export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = canvas.width, H = canvas.height;
  let fontPx = 18;
  function clear() {
    ctx.fillStyle = '#0e0e13';
    ctx.fillRect(0, 0, W, H);
  }
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function text(s, x, y, color = '#eaeaea') {
    ctx.fillStyle = color; ctx.font = fontPx + 'px system-ui, sans-serif'; ctx.fillText(s, x, y);
  }
  function textWithBg(s, x, y, color = '#eaeaea', bg = 'rgba(0,0,0,0.55)') {
    ctx.save();
    ctx.font = fontPx + 'px system-ui, sans-serif';
    const padX = 6, padY = 3;
    const w = Math.ceil(ctx.measureText(s).width);
    const h = Math.ceil(fontPx * 1.1); // approx line height
    ctx.fillStyle = bg;
    ctx.fillRect(Math.floor(x - padX), Math.floor(y - h + padY), w + padX*2, h + padY*2);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function ring(x, y, r, color = '#fff', width = 2, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }
  function beginWorld(camX, camY) {
    ctx.save();
    ctx.translate(-Math.floor(camX), -Math.floor(camY));
  }
  function endWorld() {
    ctx.restore();
  }
  function resize() {
    W = canvas.width;
    H = canvas.height;
  }
  function setTextSize(px) { fontPx = Math.max(10, Math.min(48, px|0)); }
  function rect(x, y, w, h, fill, stroke) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
  }
  return { clear, circle, text, textWithBg, ring, rect, setTextSize, beginWorld, endWorld, resize, get W(){ return W; }, get H(){ return H; } };
}
