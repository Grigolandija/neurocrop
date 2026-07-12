export function createMemoryRateLimiter({ limit, windowMs, maxEntries = 10_000 }) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('Invalid rate limiter configuration');
  }

  const attempts = new Map();

  function prune(now) {
    if (attempts.size < maxEntries) return;
    for (const [key, entry] of attempts) {
      if (now - entry.startedAt >= windowMs) attempts.delete(key);
    }
    while (attempts.size >= maxEntries) {
      attempts.delete(attempts.keys().next().value);
    }
  }

  return {
    isLimited(key, now = Date.now()) {
      const entry = attempts.get(String(key));
      if (!entry || now - entry.startedAt >= windowMs) return false;
      return entry.count >= limit;
    },
    record(key, now = Date.now()) {
      prune(now);
      const normalizedKey = String(key);
      const entry = attempts.get(normalizedKey);
      if (!entry || now - entry.startedAt >= windowMs) {
        attempts.set(normalizedKey, { startedAt: now, count: 1 });
      } else {
        entry.count += 1;
      }
    },
    reset(key) {
      attempts.delete(String(key));
    }
  };
}
