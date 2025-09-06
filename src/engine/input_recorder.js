// Records per-fixed-step input state as a compact bitset.
// Bit layout: 1=Up, 2=Down, 4=Left, 8=Right, 16=Dash(Space)

export const InputBits = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Dash: 1 << 4,
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
    log: [],
    push(bits) { this.log.push(bits|0); },
    clear() { this.log.length = 0; }
  };
}

