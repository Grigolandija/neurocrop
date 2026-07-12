import crypto from 'crypto';
import { hashUserPassword } from '../auth-users.js';
import { pool } from '../db.js';

const password = String(process.env.DEMO_PASSWORD || '');
if (password.length < 16) throw new Error('DEMO_PASSWORD must contain at least 16 characters');

const organizationId = 'org-neurocrop-demo';
const demoUserId = 'user-neurocrop-demo';
const demoEmail = 'demo@neurocrop.lt';
const employeeIds = ['user-demo-agronomist', 'user-demo-technician', 'user-demo-viewer'];

const metric = (label, unit, decimals, optimal) => ({ label, unit, decimals, optimal });
const profileMetrics = {
  airTemp: metric('Air temperature', 'degC', 1, [20, 24]),
  humidity: metric('Relative humidity', '%', 0, [55, 75]),
  co2: metric('CO2', 'ppm', 0, [500, 900]),
  lux: metric('Light', 'lx', 0, [10000, 35000]),
  soilTemp: metric('Substrate temperature', 'degC', 1, [18, 24]),
  vpd: metric('VPD', 'kPa', 2, [0.8, 1.4]),
  soilMoisture: metric('Soil moisture', '%', 0, [45, 65]),
  ec: metric('Nutrient solution EC', 'mS/cm', 2, [1.8, 2.8]),
  ph: metric('Nutrient solution pH', 'pH', 1, [5.8, 6.4]),
  leafTemp: metric('Leaf temperature', 'degC', 1, [19, 25]),
  soilEc: metric('Substrate EC', 'mS/cm', 2, [1.5, 2.5]),
  waterTemp: metric('Water temperature', 'degC', 1, [18, 22]),
  airPressure: metric('Air pressure', 'hPa', 0, [995, 1025]),
  batteryLevel: metric('Battery level', '%', 0, [55, 100])
};

const areas = [
  ['area-demo-greenhouse', 'Greenhouse Complex'],
  ['area-demo-vertical', 'Vertical Farm'],
  ['area-demo-field', 'Open Field Research'],
  ['area-demo-laboratory', 'Plant Research Laboratory']
];

const sections = [
  ['section-demo-tomato-east', 'area-demo-greenhouse', 'Tomato Zone East', 23.2, 65, 1],
  ['section-demo-tomato-west', 'area-demo-greenhouse', 'Tomato Zone West', 24.8, 58, 2],
  ['section-demo-lettuce', 'area-demo-greenhouse', 'Lettuce Bench A', 21.4, 70, 3],
  ['section-demo-strawberry', 'area-demo-greenhouse', 'Strawberry Fruiting Row', 22.6, 67, 4],
  ['section-demo-rack-one', 'area-demo-vertical', 'Vertical Rack 1', 21.8, 62, 5],
  ['section-demo-rack-two', 'area-demo-vertical', 'Vertical Rack 2', 22.2, 64, 6],
  ['section-demo-field-north', 'area-demo-field', 'Field Plot North', 19.5, 72, 7],
  ['section-demo-field-south', 'area-demo-field', 'Field Plot South', 20.8, 68, 8],
  ['section-demo-chamber', 'area-demo-laboratory', 'Climate Trial Chamber', 23.0, 66, 9],
  ['section-demo-fertigation', 'area-demo-laboratory', 'Fertigation & Irrigation Lab', 21.5, 61, 10]
];

const sensorGroups = [
  { suffix: 'climate', name: 'Climate and pressure', sensors: ['pressure_sensor'] },
  { suffix: 'canopy', name: 'Canopy light and gas', sensors: ['scd41', 'bh1750', 'leaf_temperature_probe'] },
  { suffix: 'root', name: 'Root-zone probe', sensors: ['ds18b20', 'soil_moisture_probe', 'soil_ec_probe'] },
  { suffix: 'nutrient', name: 'Nutrient and water line', sensors: ['ec_probe', 'ph_probe', 'water_temperature_probe'] }
];

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [demoUserId]);
  await client.query(`DELETE FROM measurements WHERE dev_eui IN (SELECT dev_eui FROM nodes WHERE organization_id=$1)`, [organizationId]);
  await client.query('DELETE FROM nodes WHERE organization_id=$1', [organizationId]);
  await client.query('DELETE FROM sections WHERE organization_id=$1', [organizationId]);
  await client.query('DELETE FROM areas WHERE organization_id=$1', [organizationId]);
  await client.query('DELETE FROM crop_profiles WHERE organization_id=$1', [organizationId]);
  await client.query('DELETE FROM organization_memberships WHERE organization_id=$1', [organizationId]);
  await client.query('DELETE FROM users WHERE id = ANY($1::text[])', [employeeIds]);

  await client.query(
    `INSERT INTO organizations (id,name,status) VALUES ($1,'NeuroCrop Demonstration Farm','active')
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,status='active',archived_at=NULL,archived_by=NULL`,
    [organizationId]
  );
  await client.query(
    `INSERT INTO users (id,email,display_name,password_hash,is_active,is_platform_admin,is_super_admin,updated_at)
     VALUES ($1,$2,'NeuroCrop Demo',$3,true,false,false,now())
     ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
       password_hash=EXCLUDED.password_hash,is_active=true,is_platform_admin=false,is_super_admin=false,updated_at=now()`,
    [demoUserId, demoEmail, hashUserPassword(password)]
  );
  await client.query(`INSERT INTO organization_memberships (organization_id,user_id,role) VALUES ($1,$2,'viewer')`, [organizationId, demoUserId]);

  const employees = [
    ['user-demo-agronomist', 'elena.agronomist@demo.neurocrop.lt', 'Elena Petrauskaitė', 'grower'],
    ['user-demo-technician', 'jonas.technician@demo.neurocrop.lt', 'Jonas Vaitkus', 'technician'],
    ['user-demo-viewer', 'researcher@demo.neurocrop.lt', 'Dr. Milda Kazlauskaitė', 'viewer']
  ];
  for (const [id, email, name, role] of employees) {
    await client.query(`INSERT INTO users (id,email,display_name,password_hash,is_active) VALUES ($1,$2,$3,$4,false)`,
      [id, email, name, hashUserPassword(crypto.randomBytes(24).toString('base64url'))]);
    await client.query(`INSERT INTO organization_memberships (organization_id,user_id,role) VALUES ($1,$2,$3)`, [organizationId, id, role]);
  }

  await client.query(
    `INSERT INTO crop_profiles (organization_id,id,name,hero_name,stage,hint,requires_review,metrics)
     VALUES ($1,'demo-production','Demo production targets','Mixed crops','Production',
       'Synthetic presentation data covering every supported growth parameter.',false,$2::jsonb)`,
    [organizationId, JSON.stringify(profileMetrics)]
  );
  for (const [id, name] of areas) await client.query(`INSERT INTO areas (id,organization_id,name) VALUES ($1,$2,$3)`, [id, organizationId, name]);
  for (const [id, areaId, name] of sections) {
    await client.query(`INSERT INTO sections (id,organization_id,area_id,name,crop_profile) VALUES ($1,$2,$3,$4,'demo-production')`,
      [id, organizationId, areaId, name]);
  }

  let nodeCount = 0;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const [sectionId, areaId, sectionName, baseTemp, baseHumidity, phase] = sections[sectionIndex];
    for (let groupIndex = 0; groupIndex < sensorGroups.length; groupIndex += 1) {
      const group = sensorGroups[groupIndex];
      const devEui = `de${String(sectionIndex + 1).padStart(2, '0')}${String(groupIndex + 1).padStart(2, '0')}0000000000`;
      const sensors = Object.fromEntries(['sht45', ...group.sensors].map((key) => [key, true]));
      const battery = 98 - ((sectionIndex * 3 + groupIndex * 5) % 27);
      const nodeName = `${sectionName} · ${group.name}`;
      await client.query(
        `INSERT INTO nodes (dev_eui,organization_id,area_id,section_id,name,node_type,firmware_build,
          last_seen,last_received_at,last_battery_mv,last_battery_percent,last_firmware_version,last_profile,
          last_rssi,last_snr,last_spreading_factor,last_sensor_presence,last_error_flags,last_error_counters)
         VALUES ($1,$2,$3,$4,$5,'air',214,now(),now(),$6,$7,'2.1.4','normal',$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)`,
        [devEui, organizationId, areaId, sectionId, nodeName, 3650 + battery * 5, battery,
          -52 - ((sectionIndex + groupIndex) % 18), 6.5 + ((sectionIndex + groupIndex) % 6) * 0.7,
          7 + ((sectionIndex + groupIndex) % 4), JSON.stringify(sensors),
          JSON.stringify({ raw: 0, tx_timeout: false, sensor_missing: false }),
          JSON.stringify({ read_fail: 0, reinit: sectionIndex % 4 === 0 ? 1 : 0, tx_fail: 0 })]
      );

      const has = (key) => group.sensors.includes(key);
      await client.query(
        `INSERT INTO measurements (
          time,received_at,dev_eui,temperature,humidity,co2,lux,soil_temperature,soil_moisture,
          ec,ph,soil_ec,leaf_temperature,water_temperature,air_pressure,battery_mv,battery_percent,
          firmware_build,profile,battery_critical,vpd_out_of_range,err_read_fail,err_reinit,err_tx_fail,
          rssi,snr,spreading_factor,raw_object)
         SELECT sample_time,sample_time+interval '2 seconds',$1,
          ($2 + 2.1*sin(day_angle-$3*0.08) + 0.28*sin(extract(epoch from sample_time)/7200+$3))::real,
          greatest(30,least(94,$4 - 8.5*sin(day_angle-$3*0.08) + 1.1*cos(extract(epoch from sample_time)/9800+$3)))::real,
          CASE WHEN $5 THEN round((610 + 150*daylight + 75*sin(extract(epoch from sample_time)/15400+$3))::numeric)::integer END,
          CASE WHEN $6 THEN round(greatest(0,42000*daylight*cloud_factor)::numeric)::integer END,
          CASE WHEN $7 THEN ($2-1.4 + 0.75*sin(day_angle-0.9))::real END,
          CASE WHEN $8 THEN greatest(30,least(82,61 - 18*mod(extract(epoch from sample_time)::bigint,129600)/129600.0 + 13*CASE WHEN mod(extract(epoch from sample_time)::bigint,129600)<1800 THEN 1 ELSE 0 END))::real END,
          CASE WHEN $9 THEN (2.25 + 0.18*sin(extract(epoch from sample_time)/43200+$3))::real END,
          CASE WHEN $10 THEN (6.08 + 0.16*sin(extract(epoch from sample_time)/37800+$3))::real END,
          CASE WHEN $11 THEN (1.95 + 0.22*sin(extract(epoch from sample_time)/172800+$3))::real END,
          CASE WHEN $12 THEN ($2-0.4 + 2.7*daylight + 0.2*sin(extract(epoch from sample_time)/6400))::real END,
          CASE WHEN $13 THEN (20.1 + 0.85*sin(day_angle-1.1) + 0.12*cos(extract(epoch from sample_time)/11000))::real END,
          CASE WHEN $14 THEN (1009 + 7*sin(extract(epoch from sample_time)/604800*2*pi()+$3*0.2) + 1.4*cos(extract(epoch from sample_time)/86400))::real END,
          $15,$16,214,'normal',false,false,0,0,0,$17,$18,$19,
          jsonb_build_object('payload_format','neurosense_demo_v2','firmware_version','2.1.4','demo',true,
            'expected_uplink_interval_s',600,'sensors',$20::jsonb)
         FROM (
           SELECT sample_time,
             extract(epoch from sample_time)/86400*2*pi() AS day_angle,
             greatest(0,sin(pi()*greatest(0,least(1,(extract(hour from sample_time AT TIME ZONE 'Europe/Vilnius')-5.5)/15)))) AS daylight,
             greatest(0.42,least(1,0.82+0.18*sin(extract(epoch from sample_time)/51000+$3))) AS cloud_factor
           FROM generate_series(now()-interval '30 days',now(),interval '10 minutes') sample_time
         ) samples`,
        [devEui, baseTemp + groupIndex * 0.12, phase + groupIndex, baseHumidity,
          has('scd41'), has('bh1750'), has('ds18b20'), has('soil_moisture_probe'),
          has('ec_probe'), has('ph_probe'), has('soil_ec_probe'), has('leaf_temperature_probe'),
          has('water_temperature_probe'), has('pressure_sensor'), 3650 + battery * 5, battery,
          -52 - ((sectionIndex + groupIndex) % 18), 6.5 + ((sectionIndex + groupIndex) % 6) * 0.7,
          7 + ((sectionIndex + groupIndex) % 4),
          JSON.stringify(Object.fromEntries(Object.keys(sensors).map((key) => [key, { present: true, fresh: true }]))) ]
      );
      nodeCount += 1;
    }
  }

  await client.query('COMMIT');
  console.log(JSON.stringify({ organizationId, email: demoEmail, role: 'viewer', areas: areas.length,
    sections: sections.length, nodes: nodeCount, growthMetrics: 13, historyDays: 30 }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
