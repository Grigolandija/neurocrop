import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool, query } from './db.js';
import { createMemoryRateLimiter } from './rate-limit.js';
import { requireSuperAdmin, requireUserAuth } from './auth-users.js';
import {
  GATEWAY_UPDATE_DIRECTORY,
  isGatewayEligibleForRelease,
  publicGatewayRelease,
  readGatewayRelease
} from './gateway-updates.js';

const DEFAULT_ACTIVATION_TTL_MINUTES = 30;
const MAX_ACTIVATION_TTL_MINUTES = 24 * 60;
const NODE_FIRMWARE_DIRECTORY = process.env.NODE_FACTORY_FIRMWARE_DIR || '/opt/neurocrop-node-firmware';

function configuredValue(envName, secretPath, fallback = '') {
  const environmentValue = String(process.env[envName] || '').trim();
  if (environmentValue) return environmentValue;
  try {
    return fs.readFileSync(secretPath, 'utf8').trim() || fallback;
  } catch {
    return fallback;
  }
}

export function normalizeGatewayId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

export function normalizeFactorySerial(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
}

export function validFactorySerial(value) {
  return /^[A-Z0-9][A-Z0-9-]{2,63}$/.test(value);
}

export function formatFactorySerial(sequence) {
  const number = Number(sequence);
  if (!Number.isSafeInteger(number) || number < 1 || number > 999999) {
    throw new Error('Gateway NSG sequence is exhausted or invalid');
  }
  return `NSG-${String(number).padStart(6, '0')}`;
}

export function factorySequenceFromIdentity(value) {
  const match = /^NSG-([0-9]{6})$/.exec(String(value || '').trim().toUpperCase());
  return match ? Number(match[1]) : 0;
}

export function hashGatewaySecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function secretMatches(actual, expected) {
  if (!actual || !expected) return false;
  const actualHash = Buffer.from(hashGatewaySecret(actual), 'hex');
  const expectedHash = Buffer.from(hashGatewaySecret(expected), 'hex');
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return match?.[1]?.trim() || '';
}

function factoryKey() {
  return configuredValue('GATEWAY_FACTORY_KEY', '/run/secrets/gateway_factory_key');
}

function readNodeFirmwareRelease() {
  const manifestPath = path.join(NODE_FIRMWARE_DIRECTORY, 'latest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = String(manifest.version || '').trim();
  const fileName = path.basename(String(manifest.file || '').trim());
  const expectedSha256 = String(manifest.sha256 || '').trim().toLowerCase();
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(version) ||
      !/^NeuroSense-[0-9A-Za-z._-]+\.uf2$/.test(fileName) ||
      !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error('Node firmware manifest is invalid');
  }

  const firmwarePath = path.join(NODE_FIRMWARE_DIRECTORY, fileName);
  const contents = fs.readFileSync(firmwarePath);
  const actualSha256 = crypto.createHash('sha256').update(contents).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error('Node firmware checksum does not match the manifest');
  }
  return { version, fileName, sha256: actualSha256, size: contents.length, firmwarePath };
}

function deviceTokenSecret() {
  return configuredValue('GATEWAY_DEVICE_TOKEN_SECRET', '/run/secrets/gateway_device_token_secret');
}

function deriveDeviceToken(activationToken, gatewayId) {
  const secret = deviceTokenSecret();
  if (!secret) throw new Error('GATEWAY_DEVICE_TOKEN_SECRET is not configured');
  return crypto.createHmac('sha256', secret).update(`${activationToken}:${gatewayId}`).digest('base64url');
}

function mqttConfig() {
  const config = {
    server: configuredValue('GATEWAY_MQTT_SERVER', '/run/secrets/gateway_mqtt_server'),
    username: configuredValue('GATEWAY_MQTT_USERNAME', '/run/secrets/gateway_mqtt_username'),
    password: configuredValue('GATEWAY_MQTT_PASSWORD', '/run/secrets/gateway_mqtt_password'),
    topicPrefix: String(process.env.GATEWAY_MQTT_TOPIC_PREFIX || 'eu868').trim(),
    qos: 1
  };
  if (!config.server || !config.username || !config.password) {
    throw new Error('Gateway MQTT configuration is incomplete');
  }
  const allowInsecure = process.env.GATEWAY_ALLOW_INSECURE_MQTT === 'true';
  if (!allowInsecure && !config.server.startsWith('ssl://')) {
    throw new Error('GATEWAY_MQTT_SERVER must use ssl://');
  }
  return config;
}

function chirpstackConfig() {
  return {
    apiUrl: process.env.CHIRPSTACK_API_URL || 'http://chirpstack-rest-api:8090/api',
    token: configuredValue('CHIRPSTACK_API_TOKEN', '/run/secrets/chirpstack_api_token'),
    tenantId: configuredValue('CHIRPSTACK_TENANT_ID', '/run/secrets/chirpstack_tenant_id'),
    applicationId: configuredValue('CHIRPSTACK_APPLICATION_ID', '/run/secrets/chirpstack_application_id'),
    deviceProfileId: configuredValue('CHIRPSTACK_DEVICE_PROFILE_ID', '/run/secrets/chirpstack_device_profile_id')
  };
}

async function chirpstackRequest(path, options = {}) {
  const config = chirpstackConfig();
  if (!config.token) throw new Error('CHIRPSTACK_API_TOKEN is not configured');
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      'Grpc-Metadata-Authorization': `Bearer ${config.token}`,
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(body || `ChirpStack API failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body ? JSON.parse(body) : null;
}

async function ensureChirpstackGateway({ gatewayId, name, serialNumber }) {
  const config = chirpstackConfig();
  if (!config.tenantId) throw new Error('CHIRPSTACK_TENANT_ID is not configured');
  try {
    await chirpstackRequest('/gateways', {
      method: 'POST',
      body: JSON.stringify({
        gateway: {
          gatewayId,
          tenantId: config.tenantId,
          name,
          description: `NeuroCrop gateway ${serialNumber}`,
          statsInterval: 30,
          tags: { serial_number: serialNumber }
        }
      })
    });
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}

export function normalizeNodeDevEui(value) {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

export function formatNodeFactorySerial(sequence) {
  const number = Number(sequence);
  if (!Number.isSafeInteger(number) || number < 1 || number > 999999) {
    throw new Error('Node NSN sequence is exhausted or invalid');
  }
  return `NSN-${String(number).padStart(6, '0')}`;
}

export function nodeSequenceFromIdentity(value) {
  const match = /^NSN-([0-9]{6})$/.exec(String(value || '').trim().toUpperCase());
  return match ? Number(match[1]) : 0;
}

export function isMissingChirpstackResource(error) {
  if (error?.status === 404) return true;
  if (error?.status !== 401) return false;
  try {
    return Number(JSON.parse(String(error.message || '{}')).code) === 16;
  } catch {
    return false;
  }
}

async function getChirpstackDeviceKeys(devEui) {
  try {
    return await chirpstackRequest(`/devices/${devEui}/keys`);
  } catch (error) {
    if (isMissingChirpstackResource(error)) return null;
    throw error;
  }
}

async function getChirpstackDevice(devEui) {
  try {
    return await chirpstackRequest(`/devices/${devEui}`);
  } catch (error) {
    if (isMissingChirpstackResource(error)) return null;
    throw error;
  }
}

async function createFactoryNodeKeysInChirpstack({ devEui, appKey }) {
  await chirpstackRequest(`/devices/${devEui}/keys`, {
    method: 'POST',
    body: JSON.stringify({
      deviceKeys: {
        devEui,
        nwkKey: appKey,
        appKey,
        genAppKey: '00000000000000000000000000000000'
      }
    })
  });
}

async function createFactoryNodeInChirpstack({ devEui, name, appKey, onDeviceCreated }) {
  const config = chirpstackConfig();
  if (!config.applicationId || !config.deviceProfileId) {
    throw new Error('ChirpStack node configuration is incomplete');
  }
  await chirpstackRequest('/devices', {
    method: 'POST',
    body: JSON.stringify({
      device: {
        applicationId: config.applicationId,
        deviceProfileId: config.deviceProfileId,
        devEui,
        name,
        description: `NeuroCrop factory node ${name}`,
        isDisabled: false,
        skipFcntCheck: false,
        tags: { factory_serial: name },
        variables: {}
      }
    })
  });
  onDeviceCreated?.();
  await createFactoryNodeKeysInChirpstack({ devEui, appKey });
}

async function deleteChirpstackDevice(devEui) {
  try {
    await chirpstackRequest(`/devices/${devEui}`, { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

function factoryNodeResponse(row, appKey) {
  return {
    node: {
      devEui: row.dev_eui,
      serialNumber: row.factory_serial,
      name: row.name,
      factoryStatus: row.factory_status,
      firmwareVersion: row.factory_firmware_version,
      provisionedAt: row.factory_provisioned_at,
      lastReceivedAt: row.last_received_at,
      online: Boolean(row.last_received_at && row.factory_provisioned_at
        && new Date(row.last_received_at) >= new Date(row.factory_provisioned_at))
    },
    credentials: appKey ? {
      joinEui: '0000000000000000',
      appKey
    } : undefined
  };
}

function factoryAuth(req, res, next) {
  const configuredKey = factoryKey();
  if (!configuredKey) {
    return res.status(503).json({ error: { code: 'FACTORY_NOT_CONFIGURED', message: 'Gateway factory is not configured' } });
  }
  if (!secretMatches(bearerToken(req), configuredKey)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid factory credential' } });
  }
  next();
}

export function gatewayConnectivityStatus(row, now = Date.now()) {
  const storedStatus = String(row?.status || 'offline');
  if (['retired', 'provisioning', 'configuration_error'].includes(storedStatus)) {
    return storedStatus;
  }
  const lastSeenAt = new Date(row?.last_seen_at || '').getTime();
  if (!Number.isFinite(lastSeenAt) || now - lastSeenAt > 3 * 60 * 1000) {
    return 'offline';
  }
  return 'online';
}

function publicGateway(row) {
  return {
    gatewayId: row.gateway_id,
    serialNumber: row.serial_number,
    name: row.display_name,
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    organizationStatus: row.organization_status || null,
    concentratorEui: row.concentrator_eui || null,
    hardwareModel: row.hardware_model || null,
    imageVersion: row.image_version || null,
    agentVersion: row.agent_version || null,
    targetAgentVersion: row.target_agent_version || null,
    updateStatus: row.update_status || 'idle',
    updateError: row.update_error || null,
    updateAttempts: Number(row.update_attempts) || 0,
    updateStartedAt: row.update_started_at || null,
    updateCompletedAt: row.update_completed_at || null,
    status: gatewayConnectivityStatus(row),
    lastHealth: row.last_health || {},
    firstEnrolledAt: row.first_enrolled_at,
    lastEnrolledAt: row.last_enrolled_at,
    lastSeenAt: row.last_seen_at
  };
}

export function publicAdminGateway(row, chirpstackGateway, chirpstackAvailable) {
  const gateway = publicGateway(row);
  const chirpstackLastSeenAt = chirpstackGateway?.lastSeenAt || null;
  let connectivityStatus = 'unknown';
  if (chirpstackAvailable && !chirpstackGateway) {
    connectivityStatus = 'not_registered';
  } else if (chirpstackGateway) {
    connectivityStatus = gatewayConnectivityStatus({
      status: 'online',
      last_seen_at: chirpstackLastSeenAt
    });
  }
  return {
    ...gateway,
    status: connectivityStatus,
    lastSeenAt: chirpstackLastSeenAt,
    connectivitySource: 'chirpstack',
    chirpstackRegistered: chirpstackAvailable ? Boolean(chirpstackGateway) : null,
    chirpstackName: chirpstackGateway?.name || null,
    agentStatus: gateway.status,
    agentLastSeenAt: gateway.lastSeenAt
  };
}

async function chirpstackGatewayInventory() {
  const config = chirpstackConfig();
  const tenantQuery = config.tenantId ? `&tenantId=${encodeURIComponent(config.tenantId)}` : '';
  const inventory = await chirpstackRequest(`/gateways?limit=1000${tenantQuery}`);
  return Array.isArray(inventory?.result) ? inventory.result : [];
}

function gatewayUpdatePublicKey() {
  const value = fs.readFileSync(path.join(GATEWAY_UPDATE_DIRECTORY, 'update-public-key.pem'), 'utf8').trim();
  if (!value.startsWith('-----BEGIN PUBLIC KEY-----') || !value.endsWith('-----END PUBLIC KEY-----')) {
    throw new Error('Gateway update public key is invalid');
  }
  return `${value}\n`;
}

async function gatewayPolicy() {
  const { rows } = await query(
    `SELECT release_version, rollout_percent, paused, updated_at
     FROM gateway_update_policy WHERE singleton=true`
  );
  return rows[0] || { release_version: null, rollout_percent: 0, paused: true, updated_at: null };
}

async function authenticatedGateway(gatewayId, token) {
  if (gatewayId.length !== 16 || !token) return null;
  const { rows } = await query(
    `SELECT * FROM gateways
     WHERE gateway_id=$1 AND device_token_hash=$2 AND status<>'retired'`,
    [gatewayId, hashGatewaySecret(token)]
  );
  return rows[0] || null;
}

async function availableGatewayUpdate(gateway) {
  try {
    const release = readGatewayRelease();
    const policy = await gatewayPolicy();
    return isGatewayEligibleForRelease(gateway, release, policy)
      ? { ...publicGatewayRelease(release), downloadPath: '/gateway/update/download' }
      : null;
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) {
      console.error('[gateway-update] release unavailable:', error.message);
    }
    return null;
  }
}

export function registerGatewayFactoryRoutes(app) {
  const enrollmentLimiter = createMemoryRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });

  app.get('/gateway-factory/health', factoryAuth, (req, res) => {
    try {
      mqttConfig();
      const chirpstack = chirpstackConfig();
      if (!chirpstack.token || !chirpstack.tenantId || !deviceTokenSecret()) {
        throw new Error('Gateway enrollment secrets are incomplete');
      }
      res.json({ status: 'ready', region: 'EU868' });
    } catch (error) {
      console.error('[gateway-factory] readiness:', error.message);
      res.status(503).json({
        error: { code: 'GATEWAY_FACTORY_NOT_READY', message: 'Gateway factory configuration is incomplete' }
      });
    }
  });

  app.get('/node-factory/firmware/latest', factoryAuth, (req, res, next) => {
    try {
      const release = readNodeFirmwareRelease();
      res.json({
        version: release.version,
        file: release.fileName,
        sha256: release.sha256,
        size: release.size,
        downloadPath: '/node-factory/firmware/download'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/node-factory/firmware/download', factoryAuth, (req, res, next) => {
    try {
      const release = readNodeFirmwareRelease();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(release.size));
      res.setHeader('Content-Disposition', `attachment; filename="${release.fileName}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      fs.createReadStream(release.firmwarePath)
        .on('error', next)
        .pipe(res);
    } catch (error) {
      next(error);
    }
  });

  app.post('/node-factory/registrations', factoryAuth, async (req, res, next) => {
    const devEui = normalizeNodeDevEui(req.body?.devEui);
    const firmwareVersion = String(req.body?.firmwareVersion || '').trim().slice(0, 64) || null;
    if (!/^[0-9a-f]{16}$/.test(devEui)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid node DevEUI' } });
    }

    let client;
    let chirpstackDeviceCreated = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('neurocrop-node-nsn-sequence'))`);

      const { rows: existingRows } = await client.query(
        `SELECT dev_eui, name, factory_serial, factory_status, factory_firmware_version,
                factory_provisioned_at, last_received_at, organization_id, archived_at
         FROM nodes WHERE dev_eui=$1 FOR UPDATE`,
        [devEui]
      );
      const existing = existingRows[0];
      if (existing) {
        const archivedFactoryNode = Boolean(existing.factory_serial && existing.archived_at);
        if (!existing.factory_serial || (existing.factory_status === 'assigned' && !archivedFactoryNode)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: { code: 'NODE_ALREADY_EXISTS', message: 'Node already exists outside factory inventory' } });
        }
        const keys = await getChirpstackDeviceKeys(devEui);
        const appKey = String(keys?.deviceKeys?.appKey || keys?.deviceKeys?.nwkKey || '').toLowerCase();
        const existingAppKeyIsValid = /^[0-9a-f]{32}$/.test(appKey);
        if (existingAppKeyIsValid && !archivedFactoryNode) {
          await client.query('COMMIT');
          return res.json(factoryNodeResponse(existing, appKey));
        }

        const restoredAppKey = existingAppKeyIsValid ? appKey : crypto.randomBytes(16).toString('hex');
        if (!existingAppKeyIsValid) {
          const chirpstackDevice = await getChirpstackDevice(devEui);
          if (chirpstackDevice) {
            await createFactoryNodeKeysInChirpstack({ devEui, appKey: restoredAppKey });
          } else {
            await createFactoryNodeInChirpstack({
              devEui,
              name: existing.factory_serial,
              appKey: restoredAppKey,
              onDeviceCreated: () => {
                chirpstackDeviceCreated = true;
              }
            });
          }
        }
        const { rows: restoredRows } = await client.query(
          `UPDATE nodes
           SET factory_firmware_version=COALESCE($2, factory_firmware_version),
               factory_provisioned_at=now(),
               organization_id=CASE WHEN archived_at IS NOT NULL THEN NULL ELSE organization_id END,
               area_id=CASE WHEN archived_at IS NOT NULL THEN NULL ELSE area_id END,
               section_id=CASE WHEN archived_at IS NOT NULL THEN NULL ELSE section_id END,
               name=CASE WHEN archived_at IS NOT NULL THEN factory_serial ELSE name END,
               factory_status=CASE WHEN archived_at IS NOT NULL THEN 'unassigned' ELSE factory_status END,
               archived_at=NULL,
               last_seen=NULL,
               last_received_at=NULL,
               last_battery_mv=NULL,
               last_battery_percent=NULL,
               last_firmware_version=NULL,
               last_profile=NULL,
               last_rssi=NULL,
               last_snr=NULL,
               last_spreading_factor=NULL,
               last_sensor_presence=NULL,
               last_error_flags=NULL,
               last_error_counters=NULL
           WHERE dev_eui=$1
           RETURNING dev_eui, name, factory_serial, factory_status, factory_firmware_version,
                     factory_provisioned_at, last_received_at`,
          [devEui, firmwareVersion]
        );
        await client.query('COMMIT');
        return res.json(factoryNodeResponse(restoredRows[0], restoredAppKey));
      }

      const config = chirpstackConfig();
      if (!config.applicationId || !config.deviceProfileId) {
        throw new Error('ChirpStack node configuration is incomplete');
      }
      const inventory = await chirpstackRequest(
        `/devices?limit=1000&applicationId=${encodeURIComponent(config.applicationId)}`
      );
      const chirpstackDevices = Array.isArray(inventory?.result) ? inventory.result : [];
      const { rows: sequenceRows } = await client.query(
        `SELECT COALESCE(MAX(substring(factory_serial FROM '^NSN-([0-9]{6})$')::integer), 0) + 1 AS next_sequence
         FROM nodes WHERE factory_serial ~ '^NSN-[0-9]{6}$'`
      );
      const chirpstackMax = Math.max(
        0,
        ...chirpstackDevices.map((device) => nodeSequenceFromIdentity(device?.name))
      );
      const nextSequence = Math.max(Number(sequenceRows[0]?.next_sequence || 1), chirpstackMax + 1);
      const serialNumber = formatNodeFactorySerial(nextSequence);
      const appKey = crypto.randomBytes(16).toString('hex');

      if (chirpstackDevices.some((device) => normalizeNodeDevEui(device?.devEui) === devEui)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'NODE_ALREADY_EXISTS', message: 'DevEUI already exists in ChirpStack' } });
      }

      const { rows } = await client.query(
        `INSERT INTO nodes (
           dev_eui, name, node_type, factory_serial, factory_status,
           factory_firmware_version, factory_provisioned_at
         ) VALUES ($1, $2, 'air', $2, 'unassigned', $3, now())
         RETURNING dev_eui, name, factory_serial, factory_status, factory_firmware_version,
                   factory_provisioned_at, last_received_at`,
        [devEui, serialNumber, firmwareVersion]
      );
      await createFactoryNodeInChirpstack({
        devEui,
        name: serialNumber,
        appKey,
        onDeviceCreated: () => {
          chirpstackDeviceCreated = true;
        }
      });
      await client.query('COMMIT');
      res.status(201).json(factoryNodeResponse(rows[0], appKey));
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      if (chirpstackDeviceCreated) await deleteChirpstackDevice(devEui).catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  app.get('/node-factory/nodes/:devEui', factoryAuth, async (req, res, next) => {
    const devEui = normalizeNodeDevEui(req.params.devEui);
    if (!/^[0-9a-f]{16}$/.test(devEui)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid node DevEUI' } });
    }
    try {
      const { rows } = await query(
        `SELECT dev_eui, name, factory_serial, factory_status, factory_firmware_version,
                factory_provisioned_at, last_received_at
         FROM nodes WHERE dev_eui=$1 AND factory_serial IS NOT NULL`,
        [devEui]
      );
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Factory node not found' } });
      res.json(factoryNodeResponse(rows[0]));
    } catch (error) {
      next(error);
    }
  });

  app.post('/gateway-factory/activations', factoryAuth, async (req, res, next) => {
    const requestedTtl = Number(req.body?.ttlMinutes || DEFAULT_ACTIVATION_TTL_MINUTES);
    const ttlMinutes = Math.min(Math.max(Math.round(requestedTtl), 5), MAX_ACTIVATION_TTL_MINUTES);

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('neurocrop-gateway-nsg-sequence'))`);
      const { rows: sequenceRows } = await client.query(
        `SELECT COALESCE(MAX(substring(identifier FROM '^NSG-([0-9]{6})$')::integer), 0) + 1 AS next_sequence
         FROM (
           SELECT serial_number AS identifier FROM gateway_activations
           UNION ALL
           SELECT display_name AS identifier FROM gateway_activations
           UNION ALL
           SELECT serial_number AS identifier FROM gateways
           UNION ALL
           SELECT display_name AS identifier FROM gateways
         ) identities
         WHERE identifier ~ '^NSG-[0-9]{6}$'`
      );
      const chirpstack = chirpstackConfig();
      const inventory = await chirpstackRequest(
        `/gateways?limit=1000&tenantId=${encodeURIComponent(chirpstack.tenantId)}`
      );
      const chirpstackMax = Math.max(
        0,
        ...(Array.isArray(inventory?.result)
          ? inventory.result.map((gateway) => factorySequenceFromIdentity(gateway?.name))
          : [])
      );
      const nextSequence = Math.max(Number(sequenceRows[0]?.next_sequence || 1), chirpstackMax + 1);
      const serialNumber = formatFactorySerial(nextSequence);
      const displayName = serialNumber;
      const activationToken = crypto.randomBytes(32).toString('base64url');
      const gatewayId = crypto.randomBytes(8).toString('hex');
      const { rows } = await client.query(
        `INSERT INTO gateway_activations (
           id, token_hash, gateway_id, serial_number, display_name, expires_at
         ) VALUES ($1, $2, $3, $4, $5, now() + ($6 * interval '1 minute'))
         RETURNING gateway_id, serial_number, display_name, expires_at`,
        [crypto.randomUUID(), hashGatewaySecret(activationToken), gatewayId, serialNumber, displayName, ttlMinutes]
      );
      await client.query('COMMIT');
      res.status(201).json({
        activationToken,
        gatewayId: rows[0].gateway_id,
        serialNumber: rows[0].serial_number,
        name: rows[0].display_name,
        expiresAt: rows[0].expires_at
      });
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  app.post('/gateway-factory/enroll', async (req, res, next) => {
    const ipKey = String(req.ip || 'unknown');
    if (enrollmentLimiter.isLimited(ipKey)) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many enrollment attempts' } });
    }

    const activationToken = String(req.body?.activationToken || '').trim();
    const gatewayId = normalizeGatewayId(req.body?.gatewayId);
    const serialNumber = normalizeFactorySerial(req.body?.serialNumber);
    const concentratorEui = normalizeGatewayId(req.body?.concentratorEui) || null;
    const hardwareModel = String(req.body?.hardwareModel || '').trim().slice(0, 160) || null;
    const imageVersion = String(req.body?.imageVersion || '').trim().slice(0, 64) || null;
    if (activationToken.length < 32 || gatewayId.length !== 16 || !validFactorySerial(serialNumber)
        || (concentratorEui && concentratorEui.length !== 16)) {
      enrollmentLimiter.record(ipKey);
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid enrollment payload' } });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows: activationRows } = await client.query(
        `SELECT gateway_id, serial_number, display_name, status, expires_at
         FROM gateway_activations WHERE token_hash=$1 FOR UPDATE`,
        [hashGatewaySecret(activationToken)]
      );
      const activation = activationRows[0];
      const sameIdentity = activation?.gateway_id === gatewayId && activation?.serial_number === serialNumber;
      if (!activation || !sameIdentity || activation.status === 'revoked'
          || (activation.status === 'pending' && new Date(activation.expires_at).getTime() <= Date.now())) {
        await client.query('ROLLBACK');
        enrollmentLimiter.record(ipKey);
        return res.status(401).json({ error: { code: 'INVALID_ACTIVATION', message: 'Activation code is invalid or expired' } });
      }

      const deviceToken = deriveDeviceToken(activationToken, gatewayId);
      const { rows: gatewayRows } = await client.query(
        `INSERT INTO gateways (
           gateway_id, serial_number, display_name, device_token_hash, concentrator_eui,
           hardware_model, image_version, status, last_ip, last_enrolled_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'provisioning', $8, now(), now())
         ON CONFLICT (gateway_id) DO UPDATE SET
           serial_number=EXCLUDED.serial_number,
           display_name=EXCLUDED.display_name,
           device_token_hash=EXCLUDED.device_token_hash,
           concentrator_eui=COALESCE(EXCLUDED.concentrator_eui, gateways.concentrator_eui),
           hardware_model=EXCLUDED.hardware_model,
           image_version=EXCLUDED.image_version,
           status='provisioning',
           last_ip=EXCLUDED.last_ip,
           last_enrolled_at=now(),
           updated_at=now()
         RETURNING *`,
        [gatewayId, serialNumber, activation.display_name, hashGatewaySecret(deviceToken), concentratorEui,
          hardwareModel, imageVersion, req.ip]
      );
      await client.query(
        `UPDATE gateway_activations
         SET status='consumed', consumed_at=COALESCE(consumed_at, now())
         WHERE token_hash=$1`,
        [hashGatewaySecret(activationToken)]
      );
      await client.query('COMMIT');

      try {
        await ensureChirpstackGateway({ gatewayId, name: activation.display_name, serialNumber });
        const config = mqttConfig();
        enrollmentLimiter.reset(ipKey);
        res.json({
          gateway: publicGateway(gatewayRows[0]),
          deviceToken,
          mqtt: config,
          region: 'EU868',
          heartbeatIntervalSeconds: 60
        });
      } catch (configurationError) {
        await query(
          `UPDATE gateways SET status='configuration_error', updated_at=now() WHERE gateway_id=$1`,
          [gatewayId]
        );
        console.error('[gateway-factory] enrollment configuration:', configurationError.message);
        res.status(503).json({ error: { code: 'GATEWAY_CONFIGURATION_UNAVAILABLE', message: 'Gateway configuration is temporarily unavailable' } });
      }
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });

  app.post('/gateway/heartbeat', async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.body?.gatewayId);
    const token = bearerToken(req);
    if (gatewayId.length !== 16 || !token) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Gateway authentication required' } });
    }
    const health = req.body?.health && typeof req.body.health === 'object' && !Array.isArray(req.body.health)
      ? req.body.health
      : {};
    try {
      const { rows } = await query(
        `UPDATE gateways SET
           status='online', last_seen_at=now(), last_ip=$3,
           last_health=$4::jsonb,
           image_version=COALESCE(NULLIF($5, ''), image_version),
           agent_version=COALESCE(NULLIF($6, ''), agent_version),
           updated_at=now()
         WHERE gateway_id=$1 AND device_token_hash=$2 AND status<>'retired'
         RETURNING *`,
        [gatewayId, hashGatewaySecret(token), req.ip, JSON.stringify(health),
          String(req.body?.imageVersion || '').slice(0, 64),
          String(req.body?.agentVersion || '').slice(0, 64)]
      );
      if (!rows[0]) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid gateway credential' } });
      }
      res.json({
        gateway: publicGateway(rows[0]),
        update: await availableGatewayUpdate(rows[0]),
        serverTime: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/gateway/update/check', async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.query.gatewayId);
    try {
      const gateway = await authenticatedGateway(gatewayId, bearerToken(req));
      if (!gateway) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid gateway credential' } });
      }
      res.setHeader('Cache-Control', 'no-store');
      const update = await availableGatewayUpdate(gateway);
      res.json({
        gateway: publicGateway(gateway),
        update,
        publicKeyPem: update ? gatewayUpdatePublicKey() : null,
        serverTime: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/gateway/update/download', async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.query.gatewayId);
    const requestedVersion = String(req.query.version || '').trim();
    try {
      const gateway = await authenticatedGateway(gatewayId, bearerToken(req));
      if (!gateway) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid gateway credential' } });
      }
      const release = readGatewayRelease();
      const policy = await gatewayPolicy();
      if (requestedVersion !== release.version || !isGatewayEligibleForRelease(gateway, release, policy)) {
        return res.status(404).json({ error: { code: 'UPDATE_NOT_AVAILABLE', message: 'Gateway update is not available' } });
      }
      await query(
        `UPDATE gateways SET
           target_agent_version=$2,
           update_status='downloading',
           update_started_at=COALESCE(update_started_at, now()),
           updated_at=now()
         WHERE gateway_id=$1`,
        [gatewayId, release.version]
      );
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Length', String(release.size));
      res.setHeader('Content-Disposition', `attachment; filename="${release.fileName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      fs.createReadStream(release.packagePath).on('error', next).pipe(res);
    } catch (error) {
      next(error);
    }
  });

  app.post('/gateway/update/status', async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.body?.gatewayId);
    const status = String(req.body?.status || '').trim();
    const version = String(req.body?.version || '').trim().slice(0, 64);
    const errorMessage = String(req.body?.error || '').trim().slice(0, 500) || null;
    const allowed = new Set(['downloading', 'verifying', 'installing', 'succeeded', 'failed', 'rolled_back']);
    if (!allowed.has(status) || !version) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid gateway update status' } });
    }
    try {
      const gateway = await authenticatedGateway(gatewayId, bearerToken(req));
      if (!gateway) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid gateway credential' } });
      }
      const continuingUpdate = gateway.target_agent_version === version;
      let mayStartUpdate = false;
      if (!continuingUpdate && status === 'downloading') {
        const release = readGatewayRelease();
        mayStartUpdate = release.version === version &&
          isGatewayEligibleForRelease(gateway, release, await gatewayPolicy());
      }
      if (!continuingUpdate && !mayStartUpdate) {
        return res.status(409).json({
          error: { code: 'UPDATE_NOT_SCHEDULED', message: 'This gateway update is not scheduled' }
        });
      }
      const { rows } = await query(
        `UPDATE gateways SET
           update_status=$3,
           update_error=$4,
           update_attempts=update_attempts + CASE WHEN $3='downloading' THEN 1 ELSE 0 END,
           update_started_at=CASE WHEN $3='downloading' THEN now() ELSE update_started_at END,
           update_completed_at=CASE WHEN $3 IN ('succeeded','failed','rolled_back') THEN now() ELSE NULL END,
           agent_version=CASE WHEN $3='succeeded' THEN $5 ELSE agent_version END,
           target_agent_version=CASE
             WHEN $3 IN ('succeeded','failed','rolled_back') THEN NULL
             WHEN $3='downloading' THEN $5
             ELSE target_agent_version
           END,
           updated_at=now()
         WHERE gateway_id=$1 AND device_token_hash=$2
         RETURNING *`,
        [gatewayId, hashGatewaySecret(bearerToken(req)), status, errorMessage, version]
      );
      res.json({ gateway: publicGateway(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/platform/gateway-updates', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT g.*, o.name AS organization_name, o.status AS organization_status
         FROM gateways g
         LEFT JOIN organizations o ON o.id=g.organization_id
         ORDER BY g.first_enrolled_at DESC`
      );
      let release = null;
      let chirpstackAvailable = true;
      let chirpstackGateways = [];
      try {
        release = publicGatewayRelease(readGatewayRelease());
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
      }
      try {
        chirpstackGateways = await chirpstackGatewayInventory();
      } catch (error) {
        chirpstackAvailable = false;
        console.error('[gateway-fleet] ChirpStack inventory unavailable:', error.message);
      }
      const chirpstackById = new Map(
        chirpstackGateways.map((gateway) => [normalizeGatewayId(gateway?.gatewayId), gateway])
      );
      res.json({
        gateways: rows.map((row) => publicAdminGateway(
          row,
          chirpstackById.get(normalizeGatewayId(row.gateway_id)) || null,
          chirpstackAvailable
        )),
        chirpstackAvailable,
        release,
        policy: await gatewayPolicy()
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/platform/gateways/:gatewayId/organization', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.params.gatewayId);
    const rawOrganizationId = req.body?.organizationId;
    const organizationId = rawOrganizationId === null || rawOrganizationId === ''
      ? null
      : String(rawOrganizationId || '').trim();
    if (gatewayId.length !== 16 || (organizationId !== null && organizationId.length > 128)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid gateway assignment' } });
    }
    try {
      let organization = null;
      if (organizationId) {
        const { rows: organizationRows } = await query(
          `SELECT id, name, status FROM organizations WHERE id=$1`,
          [organizationId]
        );
        organization = organizationRows[0] || null;
        if (!organization) {
          return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
        }
        if (organization.status === 'archived') {
          return res.status(409).json({
            error: { code: 'ORGANIZATION_ARCHIVED', message: 'Restore the organization before assigning a gateway' }
          });
        }
      }
      const { rows } = await query(
        `UPDATE gateways SET organization_id=$2, updated_at=now()
         WHERE gateway_id=$1 AND status<>'retired'
         RETURNING *`,
        [gatewayId, organizationId]
      );
      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gateway not found' } });
      }
      res.json({
        gateway: publicGateway({
          ...rows[0],
          organization_name: organization?.name || null,
          organization_status: organization?.status || null
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/platform/gateways/:gatewayId/update', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.params.gatewayId);
    try {
      const release = readGatewayRelease();
      const { rows } = await query(
        `UPDATE gateways SET
           target_agent_version=$2, update_status='scheduled', update_error=NULL, updated_at=now()
         WHERE gateway_id=$1 AND status<>'retired'
         RETURNING *`,
        [gatewayId, release.version]
      );
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gateway not found' } });
      res.json({ gateway: publicGateway(rows[0]), release: publicGatewayRelease(release) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/platform/gateway-updates/policy', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const rolloutPercent = Number(req.body?.rolloutPercent);
    const paused = req.body?.paused === true;
    if (!Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rollout percentage must be 0–100' } });
    }
    try {
      const release = readGatewayRelease();
      const { rows } = await query(
        `UPDATE gateway_update_policy SET
           release_version=$1, rollout_percent=$2, paused=$3, updated_by=$4, updated_at=now()
         WHERE singleton=true
         RETURNING release_version, rollout_percent, paused, updated_at`,
        [release.version, rolloutPercent, paused, req.user.id]
      );
      res.json({ policy: rows[0], release: publicGatewayRelease(release) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/gateway-factory/gateways/:gatewayId', factoryAuth, async (req, res, next) => {
    const gatewayId = normalizeGatewayId(req.params.gatewayId);
    if (gatewayId.length !== 16) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid gateway id' } });
    }
    try {
      const { rows } = await query('SELECT * FROM gateways WHERE gateway_id=$1', [gatewayId]);
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gateway not found' } });
      res.json({ gateway: publicGateway(rows[0]) });
    } catch (error) {
      next(error);
    }
  });
}
