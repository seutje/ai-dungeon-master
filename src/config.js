// Config facade to load JSON config without JSON modules (broad compatibility).
// Exports mutable CONFIG object with defaults; call loadConfig() to merge overrides.
const CONFIG = {
  SIM_COUNT_NORMAL: 32,
  SIM_COUNT_BOSS: 96,
  MAX_RULES_PER_ARCHETYPE: 16,
  MUTATION_RATE: 0.25,
  FITNESS_WEIGHTS: { dps: 1.0, control: 0.6, economy: 0.3, jitter: -0.5, unfair: -2.0 },
  ADAPT_BUDGET_PER_ROOM: 3,
  EARLY_GAME_LEARNING_MULTIPLIER: 0.5,
};
export async function loadConfig() {
  try {
    const url = new URL('./config.json', import.meta.url);
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      Object.assign(CONFIG, json);
    }
  } catch (_) { /* ignore; keep defaults */ }
}
export { CONFIG };
