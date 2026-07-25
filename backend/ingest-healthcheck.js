import fs from 'fs';

const readyFile = process.env.INGEST_READY_FILE || '/tmp/neurocrop-ingest-ready';
const maxAgeMs = 90_000;

try {
  const ageMs = Date.now() - fs.statSync(readyFile).mtimeMs;
  if (ageMs < 0 || ageMs > maxAgeMs) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
