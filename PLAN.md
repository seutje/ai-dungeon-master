# Development Plan — AI Dungeon Master (Programming Only)

This document is structured into **phases** and **tasks** that can be checked off (`[ ]` → `[x]`) as they are completed.  
It is designed for AI agents or developers to track programming progress.

---

## Phase 0 — Project Setup
- [ ] Initialize repository with folder structure (`src/engine`, `src/game`, etc.).
- [ ] Add **DESIGN.md** and **PLAN.md** documents.
- [ ] Configure simple static file server run instructions (Node http-server with live-reload).
- [ ] Implement deterministic PRNG module (`rng.js`).
- [ ] Implement fixed-step game loop (`time.js`) with `requestAnimationFrame`.

---

## Phase 1 — Rendering & Input
- [ ] Create `canvas2d.js` for drawing primitives (circles, text, sprites placeholder).
- [ ] Add main `index.html` with `<canvas>` element and HUD overlay.
- [ ] Implement basic input handler for keyboard (WASD, arrows, space for dash).
- [ ] Add FPS counter to HUD.

---

## Phase 2 — Player Core
- [ ] Implement `player.js` with position, velocity, radius, dash cooldown.
- [ ] Add movement logic (normalize input, clamp to arena bounds).
- [ ] Add dash logic with speed multiplier and cooldown.
- [ ] Draw player on canvas.

---

## Phase 3 — Enemy Core (Static Rules)
- [ ] Implement `enemies.js` with a simple archetype (Approach + Strafe weights).
- [ ] Add `ai_runtime.js` stub to select a rule (based on distance/weights).
- [ ] Add `stepEnemy` logic to move toward player with orbit modifier.
- [ ] Draw enemy with color feedback (which rule chosen).

---

## Phase 4 — Rooms & Progression
- [ ] Implement `rooms.js` with room timer and clearing condition.
- [ ] Track room count and show on HUD.
- [ ] End round automatically after N seconds for demo.

---

## Phase 5 — Adaptation System (Simulation Framework)
- [ ] Implement `snapshot.js` to capture player/enemy state + seed.
- [ ] Implement `mutate.js` to nudge enemy rule weights (demo version).
- [ ] Implement `fitness.js` to score performance metrics.
- [ ] Implement `sim_worker.js` to restore snapshot and simulate horizon steps.
- [ ] Implement `worker_pool.js` to spawn worker pool and evaluate variants.
- [ ] Integrate adaptation: after room ends → capture snapshot → mutate → simulate → pick best → apply rules.

---

## Phase 6 — Action System Expansion
- [ ] Create `actions.js` with reusable atoms: `Move`, `Strafe`, `Charge`, `BurstFire`, `Feint`.
- [ ] Extend `ai_runtime.js` to evaluate conditions and actions more formally.
- [ ] Add cooldowns and blacklists to rules.
- [ ] Implement simple telegraphs (color flash, text indicators).

---

## Phase 7 — Multiple Enemy Archetypes
- [ ] Add **Grunt** archetype: basic melee charger.
- [ ] Add **Ranged** archetype: keeps distance, fires projectiles.
- [ ] Add **Support** archetype: buffs or heals others.
- [ ] Add enemy factory to spawn different archetypes per room.

---

## Phase 8 — Combat & Projectiles
- [ ] Implement projectile system (straight shots, lobbed arcs).
- [ ] Add collision detection (player ↔ projectile, player ↔ enemy).
- [ ] Add HP to player/enemy, damage application.
- [ ] Add knockback or status effects (optional).

---

## Phase 9 — Replay & Ghost System
- [ ] Record player inputs with timestamps.
- [ ] Implement ghost replay injection with small jitter.
- [ ] Ensure determinism in replays (same seed + same inputs → same outcome).

---

## Phase 10 — Bosses & Multi-Phase Adaptation
- [ ] Implement Boss archetype with larger rule set and multiple phases.
- [ ] Add phase-gated unlock of new operators (e.g., feints, area denial).
- [ ] Store memory of last 2 rooms for seeding boss adaptation.

---

## Phase 11 — Procedural Rooms & Hazards
- [ ] Add procedural layout generator (obstacles, walls).
- [ ] Add hazards: spikes, beams, rotating traps.
- [ ] Expose hazard positions to AI as observables (to bait player).

---

## Phase 12 — Telemetry & Fitness Expansion
- [ ] Extend telemetry collection: DPS, control time, jitter, fairness checks.
- [ ] Improve fitness function to multi-objective scalar with weights.
- [ ] Add designer knobs (`config.json`) for tuning mutation rate, fitness weights, rule budgets.

---

## Phase 13 — Performance & Scaling
- [ ] Profile main loop performance (Chrome DevTools).
- [ ] Optimize object pooling, typed arrays for hot paths.
- [ ] Scale down replay count automatically on weak devices.
- [ ] Implement determinism regression tests.

---

## Phase 14 — Content & Polishing
- [ ] Expand enemy libraries with more actions and archetypes.
- [ ] Add telegraph visuals and SFX stubs.
- [ ] Improve room progression pacing (timers, waves, mid-bosses).
- [ ] Add codex of observed enemy tactics (UI).

---

## Phase 15 — Accessibility
- [ ] Add adjustable telegraph intensity.
- [ ] Add colorblind-safe palette modes.
- [ ] Add aim assist and input remapping.

---

## Phase 16 — Finalization
- [ ] Conduct fairness A/B testing with exploit seeds.
- [ ] Implement rollback mechanism if mutation produces unfair behavior.
- [ ] Stabilize boss fights and cross-round adaptation memory.
- [ ] Finalize balancing parameters.

---

## Phase 17 — Post-Launch Extensions (Optional)
- [ ] Add WebGL2 renderer for effects/particles.
- [ ] Add modding hooks for rule DSL & config loading.
- [ ] Add weekly mutator seeds system.

---

## Notes
- Each phase builds upon the previous; tasks are designed to be completed in order.
- Adaptation logic must always remain **deterministic** under fixed seeds and ghost inputs.
