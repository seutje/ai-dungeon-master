// Fixed-step accumulator + RAF
export function start(loop, stepMs = 1000/60) {
  let last = performance.now(), acc = 0, frames = 0, lastFps = performance.now();
  function frame(now) {
    acc += now - last; last = now;
    while (acc >= stepMs) { loop.fixed(stepMs/1000); acc -= stepMs; }
    loop.render(acc/stepMs);
    frames++;
    if (now - lastFps >= 500) {
      const fps = Math.round((frames * 1000) / (now - lastFps));
      if (typeof loop.onFps === 'function') loop.onFps(fps);
      frames = 0; lastFps = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
