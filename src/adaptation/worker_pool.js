const workers = [];
let onDebug = null;
export function setWorkerDebug(fn) { onDebug = fn; }
export function initPool(n = Math.max(1, (navigator.hardwareConcurrency||4)-1)) {
  for (let i = 0; i < n; i++) {
    const url = new URL('./sim_worker.js', import.meta.url);
    let w;
    try {
      w = new Worker(url, { type:'module' });
    } catch (_) {
      // Fallback to classic worker
      w = new Worker(url);
    }
    if (onDebug) onDebug({ type:'create', index: workers.length });
    w.addEventListener('error', (e) => onDebug && onDebug({ type:'error', error: e.message||String(e) }));
    w.addEventListener('messageerror', (e) => onDebug && onDebug({ type:'messageerror', error: String(e) }));
    workers.push(w);
  }
}
export async function evaluateVariants(snapshot, baseRules, population) {
  const promises = population.map((variant, i) => callWorker(workers[i % workers.length], { snapshot, rules: variant }));
  const results = await Promise.all(promises);
  results.sort((a, b) => b.fitness - a.fitness);
  return { winner: results[0].rules, ranked: results };
}
function callWorker(w, payload) {
  return new Promise(res => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = e => { if (e.data && e.data.id === id) { w.removeEventListener('message', onMsg); onDebug && onDebug({ type:'result' }); res(e.data); } };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, ...payload });
  });
}
