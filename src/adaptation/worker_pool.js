const workers = [];
export function initPool(n = Math.max(1, (navigator.hardwareConcurrency||4)-1)) {
  for (let i = 0; i < n; i++) {
    workers.push(new Worker(new URL('./sim_worker.js', import.meta.url), { type:'module' }));
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
    const onMsg = e => { if (e.data && e.data.id === id) { w.removeEventListener('message', onMsg); res(e.data); } };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, ...payload });
  });
}
