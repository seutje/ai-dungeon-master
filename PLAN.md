# Development Plan — AI Dungeon Master (Programming Only)

This document is structured into **phases** and **tasks** that can be checked off (`[ ]` → `[x]`) as they are completed.  
It is designed for AI agents or developers to track programming progress.

---

## Phase 0 — Project Setup
- [x] Initialize repository with folder structure (`src/engine`, `src/game`, etc.).
- [x] Add **DESIGN.md** and **PLAN.md** documents.
- [x] Configure simple static file server run instructions (Node http-server with live-reload).
- [x] Implement deterministic PRNG module (`rng.js`).
- [x] Implement fixed-step game loop (`time.js`) with `requestAnimationFrame`.

---

## Phase 1 — Rendering & Input
- [x] Create `canvas2d.js` for drawing primitives (circles, text, sprites placeholder).
- [x] Add main `index.html` with `<canvas>` element and HUD overlay.
- [x] Implement basic input handler for keyboard (WASD, arrows, space for dash).
- [x] Add FPS counter to HUD.

---

## Phase 2 — Player Core
- [x] Implement `player.js` with position, velocity, radius, dash cooldown.
- [x] Add movement logic (normalize input, clamp to arena bounds).
- [x] Add dash logic with speed multiplier and cooldown.
- [x] Draw player on canvas.

---

## Phase 3 — Enemy Core (Static Rules)
- [x] Implement `enemies.js` with a simple archetype (Approach + Strafe weights).
- [x] Add `ai_runtime.js` stub to select a rule (based on distance/weights).
- [x] Add `stepEnemy` logic to move toward player with orbit modifier.
- [x] Draw enemy with color feedback (which rule chosen).

---

## Phase 4 — Rooms & Progression
- [x] Implement `rooms.js` with room timer and clearing condition.
- [x] Track room count and show on HUD.
- [x] End round automatically after N seconds for demo.

---

## Phase 5 — Adaptation System (Simulation Framework)
- [x] Implement `snapshot.js` to capture player/enemy state + seed.
- [x] Implement `mutate.js` to nudge enemy rule weights (demo version).
- [x] Implement `fitness.js` to score performance metrics.
- [x] Implement `sim_worker.js` to restore snapshot and simulate horizon steps.
- [x] Implement `worker_pool.js` to spawn worker pool and evaluate variants.
- [x] Integrate adaptation: after room ends → capture snapshot → mutate → simulate → pick best → apply rules.

---

## Phase 6 — Action System Expansion
- [x] Create `actions.js` with reusable atoms: `Move`, `Strafe`, `Charge`, `BurstFire`, `Feint`.
- [x] Extend `ai_runtime.js` to evaluate conditions and actions more formally.
- [x] Add cooldowns and blacklists to rules.
- [x] Implement simple telegraphs (color flash, text indicators).

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
