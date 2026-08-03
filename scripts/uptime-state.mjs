import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEALTHY = 'healthy';
const OUTAGE = 'outage';

export function advanceUptimeState(previousState, current, checkedAt = new Date().toISOString()) {
  if (![HEALTHY, OUTAGE].includes(current)) throw new Error(`Unsupported uptime state: ${current}`);

  const previous = previousState?.status === OUTAGE ? OUTAGE : HEALTHY;
  const previousStartedAt = previousState?.outageStartedAt || null;
  let transition = 'none';
  let outageStartedAt = null;
  let durationSeconds = 0;

  if (current === OUTAGE) {
    outageStartedAt = previous === OUTAGE && previousStartedAt ? previousStartedAt : checkedAt;
    if (previous !== OUTAGE) transition = OUTAGE;
  } else if (previous === OUTAGE) {
    transition = 'recovery';
    if (previousStartedAt) {
      const checkedAtMs = Date.parse(checkedAt);
      const startedAtMs = Date.parse(previousStartedAt);
      if (Number.isFinite(checkedAtMs) && Number.isFinite(startedAtMs)) {
        durationSeconds = Math.max(0, Math.round((checkedAtMs - startedAtMs) / 1000));
      }
    }
  }

  return {
    state: { status: current, outageStartedAt, checkedAt },
    result: { current, previous, transition, outageStartedAt: outageStartedAt || previousStartedAt, checkedAt, durationSeconds }
  };
}

function readState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function runCli() {
  const [statePath, current, checkedAt = new Date().toISOString()] = process.argv.slice(2);
  if (!statePath || !current) throw new Error('Usage: node scripts/uptime-state.mjs <state-path> <healthy|outage> [checked-at]');

  const { state, result } = advanceUptimeState(readState(statePath), current, checkedAt);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, statePath);
  process.stdout.write(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
