// Records per-fixed-step input state as a compact bitset.
// Bit layout: 1=Up, 2=Down, 4=Left, 8=Right, 16=Dash(Space)

export const InputBits = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Dash: 1 << 4,
  Fire: 1 << 5,
};

export function keysToBits(keys) {
  let b = 0;
  if (keys['ArrowUp'] || keys['KeyW']) b |= InputBits.Up;
  if (keys['ArrowDown'] || keys['KeyS']) b |= InputBits.Down;
  if (keys['ArrowLeft'] || keys['KeyA']) b |= InputBits.Left;
  if (keys['ArrowRight'] || keys['KeyD']) b |= InputBits.Right;
  if (keys['Space']) b |= InputBits.Dash;
  return b;
}

export function createRecorder() {
  return {
    log: [],     // bitset per step
    aim: [],     // {x,y} per step in world coords
    push(bits, aimX = 0, aimY = 0) { this.log.push(bits|0); this.aim.push({ x: aimX|0, y: aimY|0 }); },
    clear() { this.log.length = 0; this.aim.length = 0; }
  };
}
