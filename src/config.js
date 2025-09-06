// Config facade to load JSON config with import assertion.
// Falls back to defaults if import fails (older browsers).
let CONFIG = {
  SIM_COUNT_NORMAL: 32,
  SIM_COUNT_BOSS: 96,
  MAX_RULES_PER_ARCHETYPE: 16,
  MUTATION_RATE: 0.25,
  FITNESS_WEIGHTS: { dps: 1.0, control: 0.6, economy: 0.3, jitter: -0.5, unfair: -2.0 },
  ADAPT_BUDGET_PER_ROOM: 3,
  EARLY_GAME_LEARNING_MULTIPLIER: 0.5,
};
try {
  // eslint-disable-next-line import/no-unresolved
  const mod = await import('./config.json', { assert: { type: 'json' } });
  CONFIG = mod.default || CONFIG;
} catch (_) {
  // ignore; keep defaults
}
export { CONFIG };

