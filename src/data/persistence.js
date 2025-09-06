// Simple localStorage helpers for saving best performers per room
const KEY = 'adm_best_performers_v1';

export function loadBestPerformers() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveBestPerformer(roomId, entry) {
  try {
    const map = loadBestPerformers();
    map[String(roomId)] = entry;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch (_) {
    // ignore storage failures (quota/privileges)
  }
}

export function clearBestPerformers() {
  try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
}

