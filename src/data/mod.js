// Lightweight mod loader for optional rule overrides.
// If src/data/rules.json exists, it may define per-archetype rule arrays:
// { "Grunt": { "rules": [...] }, "Ranged": { "rules": [...] }, ... }

const MOD = { rules: null };

export async function loadModRules() {
  try {
    const url = new URL('./rules.json', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) return;
    MOD.rules = await res.json();
    // basic shape validation
    if (typeof MOD.rules !== 'object') MOD.rules = null;
  } catch (_) {
    // ignore; mods are optional
  }
}

export function getRulesOverride(archetype) {
  if (!MOD.rules) return null;
  const key = String(archetype || '').trim();
  const ov = MOD.rules[key];
  if (ov && Array.isArray(ov.rules)) return ov;
  return null;
}

