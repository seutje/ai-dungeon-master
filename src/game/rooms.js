// Procedural rooms with simple hazards and obstacles
export function createRoom(n, W, H) {
  const rng = mulberry32(n * 1234567 + 8901);
  const spikes = [];
  const spikeCount = 3 + (n % 3);
  for (let i = 0; i < spikeCount; i++) {
    const r = 14 + Math.floor(rng()*10);
    const x = 40 + Math.floor(rng()*(W - 80));
    const y = 40 + Math.floor(rng()*(H - 80));
    const period = 1.6 + rng()*1.2;
    const phase = rng()*Math.PI*2;
    spikes.push({ type:'spike', x, y, r, period, phase, active:false });
  }
  const hazards = spikes;
  // Add a rotating beam every 3rd room
  if (n % 3 === 0) {
    hazards.push({ type:'beam', cx: W*0.5, cy: H*0.5, len: Math.min(W,H)*0.35, angle: 0, angVel: 0.7, width: 8 });
  }
  // Simple decorative obstacles
  const obstacles = [];
  const obsCount = 4 + (n % 4);
  for (let i = 0; i < obsCount; i++) {
    const w = 120 + Math.floor(rng()*180);
    const h = 24 + Math.floor(rng()*60);
    const x = 40 + Math.floor(rng()*(W - 80 - w));
    const y = 60 + Math.floor(rng()*(H - 120 - h));
    obstacles.push({ x, y, w, h });
  }
  return { id: n, W, H, time: 0, cleared:false, hazards, obstacles };
}

export function stepRoom(room, dt) {
  room.time += dt;
  for (const h of room.hazards) {
    if (h.type === 'spike') {
      const t = room.time + (h.phase || 0);
      const s = Math.sin((t * Math.PI * 2) / (h.period || 2));
      h.active = s > 0; // half duty cycle
    } else if (h.type === 'beam') {
      h.angle = (h.angle + (h.angVel||0) * dt) % (Math.PI*2);
    }
  }
}

export function roomDuration(id) {
  const base = 10 + Math.min(5, Math.max(0, id - 1));
  const boss = (id % 4 === 0) ? 4 : 0;
  return base + boss;
}

// Local PRNG (Mulberry32) for layout determinism per room id
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
