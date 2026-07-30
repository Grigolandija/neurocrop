import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const GATEWAY_UPDATE_DIRECTORY =
  process.env.GATEWAY_UPDATE_DIR || '/opt/neurocrop-gateway-releases';

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const FILE_PATTERN = /^neurocrop-gateway-runtime-[0-9A-Za-z._-]+\.tar\.gz$/;
let cachedRelease = null;

export function rolloutBucket(gatewayId, version) {
  const digest = crypto.createHash('sha256').update(`${gatewayId}:${version}`).digest();
  return digest.readUInt32BE(0) / 0x100000000 * 100;
}

export function isGatewayEligibleForRelease(gateway, release, policy = {}) {
  if (!gateway || !release) return false;
  if (gateway.agent_version === release.version) return false;
  if (gateway.target_agent_version === release.version) return true;
  if (policy.paused === true) return false;
  if (policy.release_version !== release.version) return false;
  const percentage = Math.max(0, Math.min(100, Number(policy.rollout_percent) || 0));
  return percentage > 0 && rolloutBucket(gateway.gateway_id, release.version) < percentage;
}

export function readGatewayRelease(directory = GATEWAY_UPDATE_DIRECTORY) {
  const manifestPath = path.join(directory, 'latest.json');
  const manifestStats = fs.statSync(manifestPath);
  if (cachedRelease?.directory === directory &&
      cachedRelease.manifestMtimeMs === manifestStats.mtimeMs) {
    const packageStats = fs.statSync(cachedRelease.release.packagePath);
    if (cachedRelease.packageMtimeMs === packageStats.mtimeMs &&
        cachedRelease.release.size === packageStats.size) {
      return cachedRelease.release;
    }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = String(manifest.version || '').trim();
  const fileName = path.basename(String(manifest.file || '').trim());
  const expectedSha256 = String(manifest.sha256 || '').trim().toLowerCase();
  const signature = String(manifest.signature || '').trim();
  const publishedAt = String(manifest.publishedAt || '').trim();
  if (!VERSION_PATTERN.test(version) || !FILE_PATTERN.test(fileName) ||
      !/^[a-f0-9]{64}$/.test(expectedSha256) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) ||
      !Number.isFinite(new Date(publishedAt).getTime())) {
    throw new Error('Gateway update manifest is invalid');
  }

  const packagePath = path.join(directory, fileName);
  const contents = fs.readFileSync(packagePath);
  const actualSha256 = crypto.createHash('sha256').update(contents).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error('Gateway update checksum does not match the manifest');
  }
  const declaredSize = Number(manifest.size);
  if (!Number.isSafeInteger(declaredSize) || declaredSize !== contents.length || declaredSize < 1) {
    throw new Error('Gateway update size does not match the manifest');
  }

  const release = {
    version,
    fileName,
    sha256: actualSha256,
    signature,
    size: contents.length,
    publishedAt,
    packagePath
  };
  cachedRelease = {
    directory,
    manifestMtimeMs: manifestStats.mtimeMs,
    packageMtimeMs: fs.statSync(packagePath).mtimeMs,
    release
  };
  return release;
}

export function publicGatewayRelease(release) {
  return {
    version: release.version,
    file: release.fileName,
    sha256: release.sha256,
    signature: release.signature,
    size: release.size,
    publishedAt: release.publishedAt
  };
}
