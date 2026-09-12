// A gap marker is evidence of missing coverage, not an interpolated reading.
// Allow the longest supported sensor schedule; CO2 can legitimately be hourly.
export function withHistoryGaps(points, metric, stepMinutes) {
  const maximumScheduleSec = metric === 'co2' || metric === 'batteryLevel' ? 3600 : 900;
  const thresholdMs = Math.max(maximumScheduleSec * 1000, stepMinutes * 60_000) * 2;
  return points.flatMap((point, index) => {
    const previous = points[index - 1];
    const before = new Date(previous?.observedAt).getTime();
    const after = new Date(point.observedAt).getTime();
    return Number.isFinite(before) && after - before > thresholdMs
      ? [{ observedAt: new Date(before + thresholdMs).toISOString(), value: null }, point]
      : [point];
  });
}
