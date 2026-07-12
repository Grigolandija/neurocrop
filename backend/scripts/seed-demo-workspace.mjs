import crypto from 'crypto';
import { hashUserPassword } from '../auth-users.js';
import { pool } from '../db.js';

const password = String(process.env.DEMO_PASSWORD || '');
if (password.length < 16) {
  throw new Error('DEMO_PASSWORD must contain at least 16 characters');
}

const organizationId = 'org-neurocrop-demo';
const demoUserId = 'user-neurocrop-demo';
const demoEmail = 'demo@neurocrop.lt';
const employeeIds = ['user-demo-agronomist', 'user-demo-technician', 'user-demo-viewer'];
const nodeIds = [
  'de00000000000001',
  'de00000000000002',
  'de00000000000003',
  'de00000000000004',
  'de00000000000005'
];

const profileMetrics = {
  airTemp: { label: 'Air temperature', unit: 'degC', decimals: 1, optimal: [20, 24], warning: [18, 26], critical: [14, 30] },
  humidity: { label: 'Relative humidity', unit: '%', decimals: 0, optimal: [55, 75], warning: [45, 80], critical: [35, 90] },
  co2: { label: 'CO2', unit: 'ppm', decimals: 0, optimal: [500, 900], warning: [400, 1100], critical: [300, 1400] },
  lux: { label: 'Light', unit: 'lx', decimals: 0, optimal: [10000, 35000], warning: [5000, 45000], critical: [0, 60000] },
  soilTemp: { label: 'Substrate temperature', unit: 'degC', decimals: 1, optimal: [18, 24], warning: [16, 26], critical: [12, 30] },
  vpd: { label: 'VPD', unit: 'kPa', decimals: 2, optimal: [0.8, 1.4], warning: [0.6, 1.7], critical: [0.3, 2.2] }
};

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [demoUserId]);
  await client.query(`DELETE FROM measurements WHERE dev_eui = ANY($1::text[])`, [nodeIds]);
  await client.query(`DELETE FROM nodes WHERE organization_id=$1 OR dev_eui = ANY($2::text[])`, [organizationId, nodeIds]);
  await client.query(`DELETE FROM sections WHERE organization_id=$1`, [organizationId]);
  await client.query(`DELETE FROM areas WHERE organization_id=$1`, [organizationId]);
  await client.query(`DELETE FROM crop_profiles WHERE organization_id=$1`, [organizationId]);
  await client.query(`DELETE FROM organization_memberships WHERE organization_id=$1`, [organizationId]);
  await client.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [employeeIds]);

  await client.query(
    `INSERT INTO organizations (id, name, status)
     VALUES ($1, 'NeuroCrop Demo Farm', 'active')
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status='active', archived_at=NULL, archived_by=NULL`,
    [organizationId]
  );
  await client.query(
    `INSERT INTO users (id, email, display_name, password_hash, is_active, is_platform_admin, is_super_admin, updated_at)
     VALUES ($1, $2, 'NeuroCrop Demo', $3, true, false, false, now())
     ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name,
       password_hash=EXCLUDED.password_hash, is_active=true, is_platform_admin=false,
       is_super_admin=false, updated_at=now()`,
    [demoUserId, demoEmail, hashUserPassword(password)]
  );
  await client.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ($1, $2, 'viewer')`,
    [organizationId, demoUserId]
  );

  const employees = [
    ['user-demo-agronomist', 'elena.agronomist@demo.neurocrop.lt', 'Elena Petrauskaitė', 'grower'],
    ['user-demo-technician', 'jonas.technician@demo.neurocrop.lt', 'Jonas Vaitkus', 'technician'],
    ['user-demo-viewer', 'researcher@demo.neurocrop.lt', 'Dr. Milda Kazlauskaitė', 'viewer']
  ];
  for (const [id, email, name, role] of employees) {
    await client.query(
      `INSERT INTO users (id, email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, $4, false)`,
      [id, email, name, hashUserPassword(crypto.randomBytes(24).toString('base64url'))]
    );
    await client.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, $3)`,
      [organizationId, id, role]
    );
  }

  await client.query(
    `INSERT INTO crop_profiles (
       organization_id, id, name, hero_name, stage, hint, requires_review, metrics
     ) VALUES ($1, 'demo-production', 'Demo production targets', 'Mixed crops', 'Production',
       'Synthetic demonstration targets. All readings in this workspace are demo data.', false, $2::jsonb)`,
    [organizationId, JSON.stringify(profileMetrics)]
  );

  const areas = [
    ['area-demo-greenhouse', 'Greenhouse Complex'],
    ['area-demo-laboratory', 'Plant Research Laboratory']
  ];
  for (const area of areas) {
    await client.query(`INSERT INTO areas (id, organization_id, name) VALUES ($1, $2, $3)`, [area[0], organizationId, area[1]]);
  }

  const sections = [
    ['section-demo-lettuce', 'area-demo-greenhouse', 'Lettuce Bench A'],
    ['section-demo-tomato', 'area-demo-greenhouse', 'Tomato Zone East'],
    ['section-demo-trial', 'area-demo-laboratory', 'Climate Trial Chamber']
  ];
  for (const section of sections) {
    await client.query(
      `INSERT INTO sections (id, organization_id, area_id, name, crop_profile)
       VALUES ($1, $2, $3, $4, 'demo-production')`,
      [section[0], organizationId, section[1], section[2]]
    );
  }

  const nodes = [
    ['de00000000000001', 'Lettuce climate 1', 'area-demo-greenhouse', 'section-demo-lettuce', true, false, false, 22.1, 64, 0],
    ['de00000000000002', 'Lettuce climate 2', 'area-demo-greenhouse', 'section-demo-lettuce', false, false, false, 22.4, 66, 0],
    ['de00000000000003', 'Tomato climate + CO2', 'area-demo-greenhouse', 'section-demo-tomato', true, false, false, 27.2, 47, 0],
    ['de00000000000004', 'Tomato light sensor', 'area-demo-greenhouse', 'section-demo-tomato', false, true, false, 26.8, 49, 0],
    ['de00000000000005', 'Trial substrate probe', 'area-demo-laboratory', 'section-demo-trial', false, false, true, 23.2, 68, 20.8]
  ];

  for (let index = 0; index < nodes.length; index += 1) {
    const [devEui, name, areaId, sectionId, hasCo2, hasLight, hasProbe, baseTemp, baseHumidity, baseSoilTemp] = nodes[index];
    const battery = 94 - index * 7;
    const presence = { sht45: true, scd41: hasCo2, bh1750: hasLight, ds18b20: hasProbe };
    await client.query(
      `INSERT INTO nodes (
         dev_eui, organization_id, area_id, section_id, name, node_type, firmware_build,
         last_seen, last_received_at, last_battery_mv, last_battery_percent,
         last_firmware_version, last_profile, last_rssi, last_snr, last_spreading_factor,
         last_sensor_presence, last_error_flags, last_error_counters
       ) VALUES ($1,$2,$3,$4,$5,'air',214,now(),now(),$6,$7,'2.1.4','normal',$8,$9,9,$10::jsonb,$11::jsonb,$12::jsonb)`,
      [
        devEui, organizationId, areaId, sectionId, name, 3950 + battery, battery,
        -57 - index * 3, 9 - index * 0.7, JSON.stringify(presence),
        JSON.stringify({ raw: 0, tx_timeout: false, sensor_missing: false }),
        JSON.stringify({ read_fail: 0, reinit: index === 2 ? 1 : 0, tx_fail: 0 })
      ]
    );

    await client.query(
      `INSERT INTO measurements (
         time, received_at, dev_eui, temperature, humidity, co2, lux, soil_temperature,
         battery_mv, battery_percent, firmware_build, profile, battery_critical,
         vpd_out_of_range, err_read_fail, err_reinit, err_tx_fail, rssi, snr,
         spreading_factor, raw_object
       )
       SELECT
         sample_time,
         sample_time + interval '2 seconds',
         $1,
         ($2::double precision
           + 1.25 * sin(extract(epoch from sample_time) / 86400 * 2 * pi())
           + 0.18 * sin(extract(epoch from sample_time) / 4100 + $3))::real,
         greatest(25, least(95,
           $4::double precision
           - 4.2 * sin(extract(epoch from sample_time) / 86400 * 2 * pi())
           + 0.7 * cos(extract(epoch from sample_time) / 5300 + $3)))::real,
         CASE WHEN $5::boolean THEN round((680 + 85 * sin(extract(epoch from sample_time) / 21600 + $3))::numeric)::integer END,
         CASE WHEN $6::boolean THEN round(greatest(0,
           39000 * sin(pi() * greatest(0, least(1, (extract(hour from sample_time AT TIME ZONE 'Europe/Vilnius') - 5.5) / 15))))::numeric)::integer END,
         CASE WHEN $7::boolean THEN ($8::double precision + 0.65 * sin(extract(epoch from sample_time) / 86400 * 2 * pi() - 0.8))::real END,
         $9, $10, 214, 'normal', false, false, 0, 0, 0, $11, $12, 9,
         jsonb_build_object(
           'payload_format', 'neurosense_demo_v1',
           'firmware_version', '2.1.4',
           'demo', true,
           'sensors', jsonb_build_object(
             'sht45', jsonb_build_object('present', true, 'fresh', true),
             'scd41', jsonb_build_object('present', $5::boolean, 'fresh', $5::boolean),
             'bh1750', jsonb_build_object('present', $6::boolean, 'fresh', $6::boolean),
             'ds18b20', jsonb_build_object('present', $7::boolean, 'fresh', $7::boolean)
           )
         )
       FROM generate_series(now() - interval '30 days', now(), interval '10 minutes') AS sample_time`,
      [devEui, baseTemp, index, baseHumidity, hasCo2, hasLight, hasProbe, baseSoilTemp,
       3950 + battery, battery, -57 - index * 3, 9 - index * 0.7]
    );
  }

  await client.query('COMMIT');
  console.log(JSON.stringify({
    organizationId,
    email: demoEmail,
    role: 'viewer',
    areas: areas.length,
    sections: sections.length,
    nodes: nodes.length,
    historyDays: 30
  }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
