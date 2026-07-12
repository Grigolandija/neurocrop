import { hashUserPassword } from '../auth-users.js';
import { closePool, query } from '../db.js';

const password = process.env.TENANT_TEST_PASSWORD || 'NeuroCrop-CI-Password-2026';
const passwordHash = hashUserPassword(password);

const tenants = [
  { suffix: 'a', email: 'tenant-a@ci.neurocrop.test', devEui: '00000000000000a1' },
  { suffix: 'b', email: 'tenant-b@ci.neurocrop.test', devEui: '00000000000000b1' },
  { suffix: 'empty', email: 'tenant-empty@ci.neurocrop.test', empty: true },
  { suffix: 'large', email: 'tenant-large@ci.neurocrop.test', large: true }
];

for (const tenant of tenants) {
  const organizationId = `org-ci-${tenant.suffix}`;
  const userId = `user-ci-${tenant.suffix}`;
  const areaId = `area-ci-${tenant.suffix}`;
  const sectionId = `section-ci-${tenant.suffix}`;

  await query(
    `INSERT INTO organizations (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status='active'`,
    [organizationId, `CI Tenant ${tenant.suffix.toUpperCase()}`]
  );
  await query(
    `INSERT INTO users (id, email, display_name, password_hash, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, is_active=true`,
    [userId, tenant.email, `CI User ${tenant.suffix.toUpperCase()}`, passwordHash]
  );
  await query(
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role='owner'`,
    [organizationId, userId]
  );
  if (tenant.empty) continue;
  if (tenant.large) {
    for (let index = 1; index <= 101; index += 1) {
      await query(
        `INSERT INTO areas (id, organization_id, name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET organization_id=EXCLUDED.organization_id, name=EXCLUDED.name`,
        [`area-ci-large-${index}`, organizationId, `Scale Area ${String(index).padStart(3, '0')}`]
      );
    }
    continue;
  }

  await query(
    `INSERT INTO crop_profiles (organization_id, id, name, hero_name, metrics)
     VALUES ($1, 'default', 'Default', 'Default', $2::jsonb)
     ON CONFLICT (organization_id, id) DO UPDATE SET metrics=EXCLUDED.metrics`,
    [organizationId, JSON.stringify({
      airTemp: { unit: 'degC', optimal: [18, 24], warning: [16, 26], critical: [14, 30] },
      humidity: { unit: '%', optimal: [50, 70], warning: [45, 75], critical: [35, 85] }
    })]
  );
  await query(
    `INSERT INTO areas (id, organization_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET organization_id=EXCLUDED.organization_id, name=EXCLUDED.name`,
    [areaId, organizationId, `CI Area ${tenant.suffix.toUpperCase()}`]
  );
  await query(
    `INSERT INTO sections (id, organization_id, area_id, name, crop_profile)
     VALUES ($1, $2, $3, $4, 'default')
     ON CONFLICT (id) DO UPDATE SET organization_id=EXCLUDED.organization_id, area_id=EXCLUDED.area_id`,
    [sectionId, organizationId, areaId, `CI Section ${tenant.suffix.toUpperCase()}`]
  );
  await query(
    `INSERT INTO nodes (dev_eui, organization_id, area_id, section_id, name, last_seen)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (dev_eui) DO UPDATE
       SET organization_id=EXCLUDED.organization_id, area_id=EXCLUDED.area_id,
           section_id=EXCLUDED.section_id, name=EXCLUDED.name`,
    [tenant.devEui, organizationId, areaId, sectionId, `CI Node ${tenant.suffix.toUpperCase()}`]
  );
  await query(
    `INSERT INTO measurements (
       time, received_at, dev_eui, temperature, humidity, battery_percent, raw_object
     ) VALUES (now(), now(), $1, 22, 60, 90, $2::jsonb)`,
    [tenant.devEui, JSON.stringify({ sensors: { sht45: { present: true } } })]
  );
}

console.log('CI tenant fixtures ready.');
await closePool();
