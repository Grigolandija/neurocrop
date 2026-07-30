import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isGatewayEligibleForRelease,
  readGatewayRelease,
  rolloutBucket
} from '../gateway-updates.js';

async function releaseDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neurocrop-gateway-release-'));
  const contents = Buffer.from('signed gateway runtime');
  const file = 'neurocrop-gateway-runtime-0.2.0.tar.gz';
  await fs.writeFile(path.join(directory, file), contents);
  await fs.writeFile(path.join(directory, 'latest.json'), JSON.stringify({
    version: '0.2.0',
    file,
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    signature: Buffer.from('test signature').toString('base64'),
    size: contents.length,
    publishedAt: '2026-07-30T08:00:00Z'
  }));
  return directory;
}

test('gateway release validates its declared package checksum and size', async (context) => {
  const directory = await releaseDirectory();
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const release = readGatewayRelease(directory);
  assert.equal(release.version, '0.2.0');
  assert.equal(release.size, Buffer.byteLength('signed gateway runtime'));

  await fs.appendFile(release.packagePath, 'tampered');
  assert.throws(() => readGatewayRelease(directory), /checksum/);
});

test('gateway rollout is deterministic and explicit scheduling overrides a paused rollout', () => {
  const release = { version: '0.2.0' };
  const gateway = {
    gateway_id: '0011223344556677',
    agent_version: '0.1.0',
    target_agent_version: null
  };
  assert.equal(rolloutBucket(gateway.gateway_id, release.version), rolloutBucket(gateway.gateway_id, release.version));
  assert.equal(isGatewayEligibleForRelease(gateway, release, {
    release_version: release.version,
    rollout_percent: 100,
    paused: false
  }), true);
  assert.equal(isGatewayEligibleForRelease(gateway, release, {
    release_version: release.version,
    rollout_percent: 100,
    paused: true
  }), false);
  assert.equal(isGatewayEligibleForRelease({
    ...gateway,
    target_agent_version: release.version
  }, release, {
    release_version: null,
    rollout_percent: 0,
    paused: false
  }), true);
});

test('a gateway never receives its already installed release', () => {
  assert.equal(isGatewayEligibleForRelease({
    gateway_id: '0011223344556677',
    agent_version: '0.2.0',
    target_agent_version: '0.2.0'
  }, { version: '0.2.0' }, {
    release_version: '0.2.0',
    rollout_percent: 100,
    paused: false
  }), false);
});
