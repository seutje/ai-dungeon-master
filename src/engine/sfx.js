let ctx = null;
let unlocked = false;

export function initSfx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  const unlock = () => {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function beep(freq = 880, duration = 0.08, gain = 0.02) {
  try {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'square';
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + duration);
    osc.stop(t0 + duration + 0.02);
  } catch (_) { /* ignore */ }
}

