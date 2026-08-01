import { performance } from 'node:perf_hooks';

export function createServerTiming() {
  let checkpoint = performance.now();
  const entries = [];

  return {
    mark(name, description = '') {
      const now = performance.now();
      entries.push({ name, description, duration: now - checkpoint });
      checkpoint = now;
    },
    apply(res) {
      if (!entries.length) return;
      res.set('Server-Timing', entries.map((entry) => {
        const description = entry.description
          ? `;desc="${String(entry.description).replace(/["\\]/g, '')}"`
          : '';
        return `${entry.name};dur=${entry.duration.toFixed(1)}${description}`;
      }).join(', '));
    }
  };
}
