let ctx = null;
let unlocked = false;
let compressor = null;
let master = null;
let targetGain = 0.6; // overall mix level

export function initSfx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Global compressor to tame overlapping transients
    compressor = ctx.createDynamicsCompressor();
    try {
      compressor.threshold.value = -24; // dB
      compressor.knee.value = 30;       // dB
      compressor.ratio.value = 12;      // :1
      compressor.attack.value = 0.003;  // seconds
      compressor.release.value = 0.25;  // seconds
    } catch (_) { /* older browsers may not support setting all props */ }
    master = ctx.createGain();
    master.gain.value = 0; // start muted to avoid pop on first resume
    compressor.connect(master).connect(ctx.destination);

    // Fade master on tab visibility changes to avoid pops
    const onVis = () => {
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (document.visibilityState === 'visible') {
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(targetGain, now + 0.06);
      } else {
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.0, now + 0.03);
      }
    };
    document.addEventListener('visibilitychange', onVis);
  }
  const unlock = () => {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    // Smoothly fade in master to avoid a loud pop on (re)activation
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0, now);
      master.gain.linearRampToValueAtTime(targetGain, now + 0.08);
    } catch (_) { /* ignore */ }
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
    if (compressor) {
      osc.connect(g).connect(compressor);
    } else {
      osc.connect(g).connect(ctx.destination);
    }
    osc.start(t0);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + duration);
    osc.stop(t0 + duration + 0.02);
  } catch (_) { /* ignore */ }
}

export function setMasterGain(v = 0.6) {
  targetGain = Math.max(0, Math.min(1, v));
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.linearRampToValueAtTime(targetGain, now + 0.05);
}
