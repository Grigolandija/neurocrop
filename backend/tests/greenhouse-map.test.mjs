import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { validateGreenhouseMap } from '../greenhouse-map-routes.js';

function validMap() {
  return {
    schemaVersion: 1,
    id: 'map-test',
    name: 'Test greenhouse',
    shape: { type: 'rectangle' },
    dimensions: { widthM: 20, lengthM: 8, heightM: 4 },
    gridSizeM: 0.5,
    orientationDeg: 0,
    wallThicknessM: 0.15,
    layers: [{ id: 'sensors', name: 'Sensor nodes', visible: true, locked: false, opacity: 1 }],
    objects: [{
      id: 'node-1', type: 'sensor-node', name: 'Node 1', xM: 2, yM: 2,
      widthM: 0.65, lengthM: 0.65, rotationDeg: 0, layerId: 'sensors',
      visible: true, locked: false, metadata: { sensor: { devEui: '70b3d57ed0060001' } }
    }],
    heatmapSettings: {
      enabled: true, metric: 'air-temperature', interpolationMethod: 'idw',
      idwPower: 2, opacity: 0.7, scaleMode: 'auto', showConfidence: true
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  };
}

test('greenhouse map validation accepts a bounded typed map', () => {
  assert.deepEqual(validateGreenhouseMap(validMap()), { valid: true });
});

test('greenhouse map validation rejects invalid geometry without changing the input', () => {
  const map = validMap();
  map.objects[0].xM = -1;
  assert.equal(validateGreenhouseMap(map).valid, false);
  assert.equal(map.objects[0].xM, -1);
});

test('greenhouse map validation rejects duplicate ids, unknown layers and invalid IDW power', () => {
  const duplicate = validMap();
  duplicate.objects.push({ ...duplicate.objects[0] });
  assert.match(validateGreenhouseMap(duplicate).message, /unique id/i);

  const unknownLayer = validMap();
  unknownLayer.objects[0].layerId = 'other';
  assert.match(validateGreenhouseMap(unknownLayer).message, /invalid layer/i);

  const invalidPower = validMap();
  invalidPower.heatmapSettings.idwPower = 0;
  assert.match(validateGreenhouseMap(invalidPower).message, /IDW power/i);
});

test('greenhouse map validation accepts wall-mounted openings and rejects detached mounts', () => {
  const map = validMap();
  map.layers.push({ id: 'structure', name: 'Structure', visible: true, locked: false, opacity: 1 });
  const door = {
    id: 'door-east', type: 'door', name: 'East door', xM: 19.8, yM: 2,
    widthM: 0.2, lengthM: 1.2, rotationDeg: 0, layerId: 'structure',
    visible: true, locked: false, metadata: { wallMount: { wall: 'east', offsetM: 2 } }
  };
  map.objects.push(door);
  assert.deepEqual(validateGreenhouseMap(map), { valid: true });

  const detached = structuredClone(map);
  detached.objects[1].xM = 19.5;
  assert.match(validateGreenhouseMap(detached).message, /detached from its perimeter wall/i);
});

test('Area Map routes are authenticated, role protected and organization scoped', async () => {
  const source = await fs.readFile(new URL('../greenhouse-map-routes.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/areas\/:areaId\/map', requireUserAuth/);
  assert.match(source, /app\.get\('\/areas\/:areaId\/map\/history', requireUserAuth/);
  assert.match(source, /app\.patch\('\/areas\/:areaId\/map', requireUserAuth, requireRole\(\.\.\.writableRoles\)/);
  assert.match(source, /app\.patch\('\/areas\/:areaId\/map\/nodes\/:devEui\/section', requireUserAuth, requireRole\(\.\.\.writableRoles\)/);
  assert.match(source, /const organizationId = req\.user\.organizationId/);
  assert.match(source, /WHERE organization_id=\$1 AND area_id=\$2/);
  assert.match(source, /n\.organization_id=\$1/);
  assert.match(source, /Map history is limited to 24 hours/);
  assert.match(source, /MAP_HISTORY_STEP_MINUTES = 10/);
  assert.match(source, /NODE_AREA_MISMATCH/);
  assert.match(source, /MAP_REVISION_CONFLICT/);
});

test('greenhouse map migration creates a tenant-scoped cascading record', async () => {
  const migration = await fs.readFile(new URL('../migrations/0019_greenhouse_maps.sql', import.meta.url), 'utf8');
  assert.match(migration, /PRIMARY KEY \(organization_id, area_id\)/);
  assert.match(migration, /FOREIGN KEY \(organization_id, area_id\)/);
  assert.match(migration, /REFERENCES areas \(organization_id, id\)/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /revision.*CHECK \(revision > 0\)/s);
});
