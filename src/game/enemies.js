import { moveToward, strafeAround } from '../actions.js';

export function createEnemy(x, y) {
  return {
    x, y, r: 12, speed: 140, vx: 0, vy: 0,
    rules: [
      { name:'Approach', weights: 0.8, cooldown: 0, cdMs: 150, blacklistTags: ['NoClose'] },
      { name:'Strafe',   weights: 0.2, cooldown: 0, cdMs: 300, blacklistTags: ['NoFar'] }
    ],
    memory: { lastChoose: 0 },
    hp: 60
  };
}
export function stepEnemy(e, player, dt) {
  // Execute movement based on last chosen rule from ai_runtime
  const choice = e.memory.lastChoose | 0;
  if (choice === 0) {
    const v = moveToward(e, player.x, player.y, e.speed, 1.0, dt);
    e.vx = v.vx; e.vy = v.vy;
  } else {
    const v = strafeAround(e, player, e.speed, 0.6, dt);
    e.vx = v.vx; e.vy = v.vy;
  }
}
