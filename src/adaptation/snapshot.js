// Capture a richer snapshot for headless gameplay simulation
export function captureSnapshot(state) {
  const horizon = 180; // ~1.5s at 120Hz by default
  return {
    seed: state.seed >>> 0,
    world: { W: state.room.W, H: state.room.H },
    room: {
      id: state.room.id,
      time: 0,
      hazards: (state.room.hazards||[]).map(h => ({ ...h })),
      obstacles: (state.room.obstacles||[]).map(o => ({ ...o }))
    },
    player: { x: state.player.x, y: state.player.y, r: state.player.r, speed: state.player.speed, hp: state.player.hp, maxHp: state.player.maxHp||100, dashCd:0, dashTime:0, invuln:0 },
    enemy: {
      x: state.enemy.x, y: state.enemy.y, r: state.enemy.r, speed: state.enemy.speed||150,
      hp: state.enemy.hp||60, maxHp: state.enemy.maxHp||60, archetype: state.enemy.archetype||'Grunt',
      rules: state.enemy.rules.map(r => ({...r})), memory: { lastChoose: 0, phase: 1, phaseTimer: 0 }
    },
    // Record last N inputs; inject small jitter in worker
    steps: horizon, dt: 1/120,
    inputs: Array.isArray(state.recorder?.log) ? state.recorder.log.slice(-horizon) : []
  };
}

export function restoreSnapshot(snap, rules) {
  // Apply variant rules; keep other snapshot fields
  const enemy = { ...snap.enemy, rules: rules.rules.map(r => ({...r})) };
  return {
    seed: snap.seed >>> 0,
    world: { ...snap.world },
    room: { id: snap.room.id, time: 0, hazards: snap.room.hazards.map(h => ({...h})), obstacles: snap.room.obstacles.map(o => ({...o})) },
    player: { ...snap.player },
    enemy,
    steps: snap.steps,
    dt: snap.dt,
    inputs: snap.inputs || [],
    projectiles: { list: [], pool: [] },
    log: { dps: 0, controlTime: 0, jitter: 0, economy: 0, unfairFlags: 0 },
    _prev: { ex: enemy.x, ey: enemy.y }
  };
}

// Lightweight internal helpers (duplicated to avoid importing DOM-affecting code)
function handleInputLike(p, bits, dt) {
  const up = !!(bits & 1), down = !!(bits & 2), left = !!(bits & 4), right = !!(bits & 8), dash = !!(bits & 16);
  let dx = (right?1:0) - (left?1:0);
  let dy = (down?1:0) - (up?1:0);
  const len = Math.hypot(dx, dy) || 1;
  p.vx = (dx/len) * p.speed;
  p.vy = (dy/len) * p.speed;
  if (dash && p.dashCd <= 0) { p.dashTime = 0.12; p.dashCd = 0.9; p.invuln = Math.max(p.invuln||0, 0.16); }
  if (p.dashTime > 0) { p.vx *= 3.2; p.vy *= 3.2; p.dashTime -= dt; }
  if (p.dashCd > 0) p.dashCd -= dt;
}
function clampToWorld(e, W, H) {
  e.x = Math.max(e.r, Math.min(W - e.r, e.x));
  e.y = Math.max(e.r, Math.min(H - e.r, e.y));
}
function resolveCircleAabb(e, rect) {
  const cx = e.x, cy = e.y, r = e.r || 0;
  let closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  let closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  let dx = cx - closestX;
  let dy = cy - closestY;
  let d2 = dx*dx + dy*dy;
  if (d2 > r*r) return false;
  let d = Math.sqrt(Math.max(1e-6, d2));
  if (d === 0) {
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
function collideWithObstacles(e, obstacles) {
  for (let i = 0; i < obstacles.length; i++) resolveCircleAabb(e, obstacles[i]);
}
function stepHazards(room, dt) {
  room.time += dt;
  for (const h of room.hazards) {
    if (h.type === 'spike') {
      const t = room.time + (h.phase || 0);
      const s = Math.sin((t * Math.PI * 2) / (h.period || 2));
      h.active = s > 0;
    } else if (h.type === 'beam') {
      h.angle = (h.angle + (h.angVel||0) * dt) % (Math.PI*2);
    }
  }
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx*wx + vy*wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx*vx + vy*vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  const bx = x1 + b*vx, by = y1 + b*vy;
  return Math.hypot(px - bx, py - by);
}

function applyHazardDamage(room, player, dt) {
  for (const h of room.hazards) {
    if (h.type === 'spike' && h.active) {
      const dx = player.x - h.x, dy = player.y - h.y;
      if (dx*dx + dy*dy <= Math.pow(player.r + h.r, 2)) {
        if (!player.invuln || player.invuln <= 0) player.hp = Math.max(0, player.hp - 25*dt);
      }
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(player.x, player.y, x1, y1, x2, y2);
      if (d <= (h.width||8)/2 + player.r) {
        if (!player.invuln || player.invuln <= 0) player.hp = Math.max(0, player.hp - 18*dt);
      }
    }
  }
}
function applyHazardDamageToEnemy(room, enemy, dt) {
  for (const h of room.hazards) {
    if (h.type === 'spike' && h.active) {
      const dx = enemy.x - h.x, dy = enemy.y - h.y;
      if (dx*dx + dy*dy <= Math.pow((enemy.r || 12) + (h.r || 0), 2)) {
        enemy.hp = Math.max(0, enemy.hp - 25*dt);
      }
    } else if (h.type === 'beam') {
      const x1 = h.cx, y1 = h.cy;
      const x2 = h.cx + Math.cos(h.angle) * h.len;
      const y2 = h.cy + Math.sin(h.angle) * h.len;
      const d = distToSegment(enemy.x, enemy.y, x1, y1, x2, y2);
      if (d <= (h.width||8)/2 + (enemy.r || 12)) {
        enemy.hp = Math.max(0, enemy.hp - 18*dt);
      }
    }
  }
}
function applyContactDamage(player, enemy, dt) {
  if (!enemy || enemy.hp <= 0) return 0;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const rr = (player.r + (enemy.r||12));
  if (dx*dx + dy*dy <= rr*rr) {
    if (!player.invuln || player.invuln <= 0) {
      const before = player.hp;
      player.hp = Math.max(0, player.hp - 30*dt);
      return before - player.hp;
    }
  }
  return 0;
}

// Headless gameplay step
export function stepSimulation(sim, dt, inputBits = 0) {
  // 1) Player input and movement
  handleInputLike(sim.player, inputBits, dt);
  sim.player.x += (sim.player.vx||0) * dt; sim.player.y += (sim.player.vy||0) * dt;
  clampToWorld(sim.player, sim.world.W, sim.world.H);
  collideWithObstacles(sim.player, sim.room.obstacles);
  if (sim.player.invuln && sim.player.invuln > 0) sim.player.invuln = Math.max(0, sim.player.invuln - dt);

  // 2) Enemy AI + movement
  // Inline simple AI: reuse rule weights indirectly via preferences similar to runtime
  // We import-free approximate using lastChoose memory and name-based decisions
  const enemy = sim.enemy; const player = sim.player;
  // Evaluate best rule by name/weights and simple distance features (mirrors ai_runtime logic)
  let bestIdx = 0, bestScore = -1e9; const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  const hz = sim.room.hazards; let hazardNear = 0;
  // quick hazard proximity
  for (let i=0;i<hz.length;i++){const h=hz[i]; if(h.type==='spike' && h.active){const dx=h.x-enemy.x,dy=h.y-enemy.y;const dd=Math.hypot(dx,dy)-(h.r||0); if(dd<28){hazardNear=1;break;}}}
  for (let i=0;i<enemy.rules.length;i++){
    const r = enemy.rules[i]; if ((r.cooldown||0)>0) continue; let score = r.weights||0.5;
    if (r.name==='Approach'){ score *= (d>120?1.0:0.5); if(hazardNear) score*=0.7; }
    else if (r.name==='Strafe'){ score *= (d<=160?1.0:0.3); if(hazardNear) score*=1.1; }
    else if (r.name==='KeepDistance'){ score *= (d<220?1.2:0.7); if(hazardNear) score*=1.15; }
    else if (r.name==='Charge'){ score *= (d>90&&d<220)?1.1:0.4; if(hazardNear) score*=0.8; }
    else if (r.name==='AreaDeny'){ score *= (d>80&&d<260)?1.0:0.5; }
    else if (r.name==='Feint'){ score *= (d<160?0.8:0.3); }
    if (score>bestScore){bestScore=score; bestIdx=i;}
  }
  enemy.memory.lastChoose = bestIdx; const chosen = enemy.rules[bestIdx];
  chosen.cooldown = (chosen.cdMs ? chosen.cdMs : 250) / 1000;
  // Execute movement/attacks similar to stepEnemy
  const moveSpeed = enemy.speed||150;
  let evx=0, evy=0;
  const name = chosen.name||'Approach';
  if (name==='Approach'){ const vx = (player.x - enemy.x), vy = (player.y - enemy.y); const L = Math.hypot(vx,vy)||1; evx = (vx/L)*moveSpeed; evy=(vy/L)*moveSpeed; }
  else if (name==='Strafe'){ const vx=player.x-enemy.x, vy=player.y-enemy.y; const L=Math.hypot(vx,vy)||1; const nx=-(vy/L), ny=(vx/L); evx = nx*moveSpeed*0.6; evy = ny*moveSpeed*0.6; }
  else if (name==='KeepDistance'){ const vx=enemy.x-player.x, vy=enemy.y-player.y; const L=Math.hypot(vx,vy)||1; const desired=220; const mul=(d<desired?1:-0.6); evx=(vx/L)*moveSpeed*mul; evy=(vy/L)*moveSpeed*mul; }
  else if (name==='Charge'){ // simple windup then burst
    enemy._charge = enemy._charge || { wind:0.22, dur:0.42, headX:0, headY:0 };
    if (enemy._charge.wind>0){ const vx = (player.x - enemy.x), vy=(player.y - enemy.y); const L=Math.hypot(vx,vy)||1; enemy._charge.headX=vx/L; enemy._charge.headY=vy/L; enemy._charge.wind-=dt; }
    else if (enemy._charge.dur>0){ evx = enemy._charge.headX*moveSpeed*3.0; evy = enemy._charge.headY*moveSpeed*3.0; enemy._charge.dur-=dt; } else { enemy._charge=null; }
  } else if (name==='AreaDeny') {
    enemy._burstCd = (enemy._burstCd||0) - dt; if (enemy._burstCd<=0){
      // shoot radial burst
      const shots = 10 + (enemy.memory.phase||1)*2; const speed = 340 + (enemy.memory.phase||1)*30;
      for (let i=0;i<shots;i++){ const ang = (i/shots)*Math.PI*2; sim.projectiles.list.push({ x:enemy.x, y:enemy.y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, r:3, damage:10, life:2.0, owner:'enemy' }); }
      enemy._burstCd = 1.2;
    }
  }
  enemy.x += evx*dt; enemy.y += evy*dt;
  clampToWorld(enemy, sim.world.W, sim.world.H); collideWithObstacles(enemy, sim.room.obstacles);
  enemy.prevVx = evx; enemy.prevVy = evy;

  // Boss simple phase timing
  enemy.memory.phaseTimer = (enemy.memory.phaseTimer||0)+dt;
  if (enemy.archetype==='Boss'){
    if (enemy.memory.phase===1 && enemy.memory.phaseTimer>6){ enemy.memory.phase=2; }
    else if (enemy.memory.phase===2 && enemy.memory.phaseTimer>12){ enemy.memory.phase=3; }
  }

  // 3) Projectiles step with collisions
  // Enemy shooter (ranged) burst behavior
  if (enemy.archetype==='Ranged'){
    enemy._shootCd = (enemy._shootCd||0) - dt; if (enemy._shootCd<=0){
      const vx = player.x-enemy.x, vy = player.y-enemy.y; const dL=Math.hypot(vx,vy)||1; if (dL<=340){
        const shots = 3; const spread=0.09; const speed=500; const base=Math.atan2(vy,vx);
        for (let i=0;i<shots;i++){ const a = base + (i-1)*spread; sim.projectiles.list.push({ x:enemy.x, y:enemy.y, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, r:3, damage:10, life:2.0, owner:'enemy' }); }
        enemy._shootCd = 0.9;
      }
    }
  }
  // Player auto-fire approximation: assumes holding fire toward enemy
  player._shootCd = (player._shootCd||0) - dt; if (player._shootCd<=0){
    const vx = enemy.x-player.x, vy = enemy.y-player.y; const L=Math.hypot(vx,vy)||1; const speed=520;
    sim.projectiles.list.push({ x:player.x, y:player.y, vx:(vx/L)*speed, vy:(vy/L)*speed, r:3, damage:12, life:1.2, owner:'player' });
    player._shootCd = 0.18;
  }
  // Advance and handle projectile collisions with world bounds & obstacles
  for (let i=sim.projectiles.list.length-1;i>=0;i--){
    const p = sim.projectiles.list[i]; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if (p.life<=0 || p.x<-8 || p.x>sim.world.W+8 || p.y<-8 || p.y>sim.world.H+8){ sim.projectiles.list.splice(i,1); continue; }
    // obstacle hit
    let hitObs=false; for (let k=0;k<sim.room.obstacles.length;k++){ const ob=sim.room.obstacles[k]; const cx=Math.max(ob.x, Math.min(p.x, ob.x+ob.w)); const cy=Math.max(ob.y, Math.min(p.y, ob.y+ob.h)); const dx=p.x-cx, dy=p.y-cy; if (dx*dx+dy*dy <= (p.r||2)*(p.r||2)){ hitObs=true; break; } }
    if (hitObs){ sim.projectiles.list.splice(i,1); continue; }
    if (p.owner==='enemy'){
      const dx = player.x-p.x, dy=player.y-p.y; const rr = (player.r + (p.r||2)); if (dx*dx+dy*dy<=rr*rr){ const before=player.hp; if (!player.invuln||player.invuln<=0) player.hp=Math.max(0, player.hp - (p.damage||10)); sim.projectiles.list.splice(i,1); sim.log.dps += (before - player.hp); continue; }
    } else if (p.owner==='player'){
      const dx = enemy.x-p.x, dy=enemy.y-p.y; const rr = ((enemy.r||12) + (p.r||2)); if (dx*dx+dy*dy<=rr*rr){ enemy.hp=Math.max(0, enemy.hp - (p.damage||12)); sim.projectiles.list.splice(i,1); continue; }
    }
  }

  // 4) Hazards and contact damage
  stepHazards(sim.room, dt);
  applyHazardDamage(sim.room, sim.player, dt);
  applyHazardDamageToEnemy(sim.room, sim.enemy, dt);
  sim.log.dps += applyContactDamage(sim.player, sim.enemy, dt);

  // 5) Metrics
  // Control when distance in mid-band
  if (d>90 && d<260) sim.log.controlTime += dt;
  // Jitter by heading changes of enemy
  if (sim._prev){ const dx = enemy.x - sim._prev.ex, dy = enemy.y - sim._prev.ey; const pdx= (sim._prev.pdx||dx), pdy=(sim._prev.pdy||dy); const a=Math.atan2(dy,dx), b=Math.atan2(pdy,pdx); let da = Math.abs(a-b); if (da>Math.PI) da = 2*Math.PI - da; const excess = Math.max(0, da - 0.06); sim.log.jitter += excess; sim._prev.pdx=dx; sim._prev.pdy=dy; sim._prev.ex=enemy.x; sim._prev.ey=enemy.y; }
  // Economy: small penalty for frequent player dashes (from input) to discourage overreliance
  if (inputBits & 16) sim.log.economy -= 0.003;
  // Unfair flags from extreme rule configs
  const wBy = {}; for (const r of enemy.rules) wBy[r.name||''] = r.weights||0; if ((wBy.Charge||0)>1.6 && (wBy.KeepDistance||0)<0.2) sim.log.unfairFlags += 0.001; if ((wBy.AreaDeny||0)>1.5) sim.log.unfairFlags += 0.001;
}
