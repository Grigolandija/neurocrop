import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('staging ignores successful CI from an older main revision without checking out or deploying it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'staging-main-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const old = 'a'.repeat(40), current = 'b'.repeat(40);
    const log = join(dir, 'calls'); writeFileSync(log, '');
    writeFileSync(join(bin, 'curl'), `#!/bin/sh\necho '{"workflow_runs":[{"head_sha":"${old}"}]}'\n`, { mode: 0o755 });
    writeFileSync(join(bin, 'flock'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> "$MOCK_CALLS"\ncase "$*" in *rev-parse*) echo ${current};; *fetch*) exit 0;; *) exit 99;; esac\n`, { mode: 0o755 });
    writeFileSync(join(bin, 'docker'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    const run = spawnSync('bash', [fileURLToPath(new URL('../../deploy/update-staging-from-ci.sh', import.meta.url))], {
      encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NEUROCROP_RELEASE_LOCK_HELD: '1',
        NEUROCROP_STAGING_SOURCE: dir, NEUROCROP_STAGING_DEPLOY_DIR: join(dir, 'staging'),
        NEUROCROP_STAGING_UPDATE_LOCK: join(dir, 'lock'), MOCK_CALLS: log }
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /waiting for successful CI of current main/);
    assert.doesNotMatch(readFileSync(log, 'utf8'), /checkout/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
