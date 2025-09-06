# AI Dungeon Master — Design Document (Browser, Plain JS)

## 1) High Concept
A 2D top-down action roguelite where enemies are driven by a lightweight **procedural rule engine** that **rewrites itself after each round**. After each combat round, the AI replays the same round multiple times (seeded deterministic simulations) in background Web Workers, **mutates** its rule set, and selects the **best-performing variant** to counter the player's style, all while preserving **fairness** (no clairvoyance) and **readability**.

**Design Pillars**
- Readable Depth • Low-Latency Adaptation • Systemic Surprise • Fairness First

## 2) Game Overview
- **Genre:** 2D top-down arena/room-based action roguelite
- **Loop:** Enter room → Fight (30–90s) → Simulate & Learn → Apply rewrite → Next room
- **Victory/Fail:** Defeat floor bosses / Player HP 0

## 3) Player Kit
Move + dash (i-frames), primary, secondary, ultimate (charge), relics/augments.

## 4) Enemy Archetypes
Grunts, Elites, Bosses, Support. Each exposes tunable parameters: spacing, focus fire, burst windows, retreat thresholds, formations, baiting.

## 5) Procedural Rule Engine
**Rule = (Trigger, Conditions, Action, Weights, Cooldowns, BlacklistTags)**
- Triggers: `OnTick`, `OnPlayerDash`, `OnAllyDowned`, etc.
- Conditions: boolean/soft predicates over observable state (no future knowledge).
- Actions: parameterized atoms (`Strafe`, `BurstFire`, `Charge`, `Feint`, `Net`, `Shield`…).
- Weights & cooldowns gate selection; blacklist prevents bad combos.

**Runtime Evaluation:**
Each tick: score candidates → pick best (softmax/epsilon-greedy) → enqueue action → update cooldowns & short memory buffer.

## 6) Post-Round Learning (Self-Rewrite)
- **Snapshot & Replay:** Capture start state + RNG seed + player ghost inputs; run N fast deterministic replays in Web Workers with **mutated** rule sets.
- **Mutation Operators:** weight nudge, threshold shift, cooldown tweak, add/remove rule, swap action atom, cohesion/focus tweaks. Budgeted complexity caps keep perf and readability.
- **Fitness:** DPS + control time + economy − chaos/jitter − unfairness. Multi-objective scalar.
- **Selection:** Tournament + elitism + diversity (novelty) → rewrite base rule set. 

**Fairness:** Ghost model re-injects the player’s recorded inputs with small jitter; workers never peek future inputs. Build/stats locked per round.

## 7) Difficulty & Governance
Adaptation budget per room, early-game lower learning rate, rubberbanding if player struggles, telemetry-gated operators.

## 8) Content
Procedural rooms & hazards exposed to AI; composable action atoms with safe parameter ranges.

## 9) Readability & Telegraphy
Windups and consistent micro-strategies (1–3s) before pivoting. Optional “what changed” card between rooms with counter tips.

## 10) UI/UX
Round summary, codex of observed enemy playbook fragments, assist toggles (telegraph intensity, explain changes).

## 11) Technology (Browser, Plain JS)
- **Language:** ES2020+ modules, no frameworks.
- **Render:** Canvas 2D (default), optional WebGL2 path.
- **Loop:** `requestAnimationFrame` + fixed-step simulation.
- **Concurrency:** Web Workers for replays; optional OffscreenCanvas; optional SharedArrayBuffer (COOP/COEP).
- **Data:** JSON rule sets and snapshots; IndexedDB for persistence; localStorage for settings.
- **Determinism:** Seeded PRNG (Mulberry32/XorShift), fixed-step only in sims.

**Perf Budgets:** Main thread ≤2.5ms logic/frame on mid-tier laptops; replays 64–256 at 8–16× speed across workers; auto-scale on weak devices.

## 12) Anti-Degeneracy & Fairness
Exploit bans (no-escape heuristics), camping penalties, cooldown minima, visibility bounds, no clairvoyance.

## 13) Telemetry
Dash timing distributions, preferred range, outcome labels, mutation deltas. Rollback on anomaly.

## 14) Tuning Knobs (Designer)
`MAX_RULES_PER_ARCHETYPE`, `MUTATION_RATE`, `SIM_COUNT_(NORMAL|BOSS)`, `FITNESS_WEIGHTS`, `ADAPT_BUDGET_PER_ROOM`, `DIVERSITY_KEEP`, `EARLY_GAME_LEARNING_MULTIPLIER`.

## 15) Example Rule (JSON)
```json
{
  "name": "PunishDashWithDelayCharge",
  "trigger": "OnPlayerDash",
  "conditions": ["distToPlayer < 6", "cooldowns.charge.ready", "lineOfSight"],
  "action": { "type": "Charge", "params": { "windup_ms": 300, "duration_ms": 600, "overshoot": 1.2 } },
  "weights": 0.9,
  "cooldowns": { "local_ms": 3000 },
  "blacklistTags": ["NoBurstWhileRetreating"]
}
```

## 16) Pseudocode (JS-ish)
- **Runtime:** score best rule → enqueue action → execute.
- **Adaptation:** mutate population → simulate in workers → pick best → rewrite with budget.

## 17) Boss Meta
HP gates expand rule budget; remembers last two rooms for seeding; may feint counters that the player learned.

## 18) QA
Determinism tests (same seed → same logs), fairness A/B, performance profiling, regression seeds bank.

## 19) Accessibility
Assist caps, scalable telegraphs, colorblind-safe, input remap, aim assist.

## 20) Roadmap
MVP → Alpha → Beta → Launch → Post-Launch (mutator seeds).

## 21) Risks & Mitigations
Overfitting (diversity + decayed memory), unfun counters (fitness includes readability & counterplay), perf spikes (auto-scale sims & horizons).

---

## 22) Browser Starter Repo Overview
This repo is a minimal, framework-free baseline that:
- Implements a fixed-step game loop and Canvas renderer.
- Stubs the rule engine, snapshotting, mutation, and worker-based simulation.
- Shows an on-canvas demo with a controllable player and a dummy enemy.
- Runs deterministic fast sims in workers and “adapts” a single weight across rooms.

See **README.md** for how to run locally.
