# Repository Guidelines

## Project Structure & Module Organization
- `index.html`: Entry page and HUD. Loads `src/main.js`.
- `src/engine/`: Core loop and utilities (`time.js`, `rng.js`, `physics.js`, `ecs.js`).
- `src/game/`: Gameplay modules (`player.js`, `enemies.js`, `rooms.js`).
- `src/render/`: Canvas 2D renderer (`canvas2d.js`).
- `src/adaptation/`: Learning pipeline (`snapshot.js`, `mutate.js`, `fitness.js`, `worker_pool.js`, `sim_worker.js`).
- `devserver.js`: Local static server with SSE live‑reload.
- `DESIGN.md`, `PLAN.md`, `README.md`: Design, roadmap, and usage docs.

## Build, Test, and Development Commands
- `npm run dev`: Serve at `http://localhost:8000` with live‑reload.
- Static hosting: Any server that serves the repo root (e.g., `python -m http.server`) works, but without live‑reload.
- No build step: ES modules are loaded directly in the browser.

## Coding Style & Naming Conventions
- Language: Vanilla ES2020+ modules; browser APIs only.
- Indentation: 2 spaces; include semicolons; single quotes or consistent style.
- Filenames: lower_snake_case (e.g., `ai_runtime.js`, `worker_pool.js`).
- Identifiers: `camelCase` for functions/vars, `PascalCase` for factories/classes.
- Structure: Small, focused modules; avoid global state; prefer pure helpers.
- Dependencies: Keep zero‑dependency by default; discuss before adding any.

## Testing Guidelines
- Status: No test suite yet. If adding tests:
  - Framework: lightweight (e.g., Vitest/Jest). Put tests under `tests/`.
  - Naming: `*.test.js` mirrors source paths (e.g., `tests/engine/rng.test.js`).
  - Focus: determinism (RNG, fixed‑step), AI selection invariants, worker messaging.
  - Add `npm test` script and document commands in `README.md`.

## Commit & Pull Request Guidelines
- Commits: Follow Conventional Commits (e.g., `feat(engine): add fixed step`, `fix(game): clamp dash`).
- Scope changes narrowly; keep diffs coherent and focused.
- PRs: Include purpose, summary of changes, and links to relevant `PLAN.md` tasks.
  - Add screenshots/GIFs for visual changes.
  - Note any design implications and update `README.md`/docs when applicable.
- Before PR: run locally via `npm run dev` and sanity‑check console for errors.

## Security & Configuration Tips
- Do not commit secrets (`.env` is ignored). Keep the project static‑only.
- Web Workers should not access network; ensure simulations are deterministic.
