export function fitness(log) {
  return (0.6 * log.controlTime) - (0.5 * log.jitter);
}
