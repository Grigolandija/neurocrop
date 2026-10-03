import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const monitor = fileURLToPath(new URL('../scripts/monitor-platform.sh', import.meta.url));
test('monitor sends incident transitions, not new emails for changing image counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-test-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const mock = join(bin, 'mock');
    writeFileSync(mock, `#!/usr/bin/env python3
import os,sys,json,time,hashlib
from pathlib import Path
name=Path(sys.argv[0]).name
args=sys.argv[1:]
c=json.loads(Path(os.environ['MOCK_CONFIG']).read_text())
if name=='docker':
 if args[:2]==['image','ls']:
  for n in range(c['images']): print('neurocrop-backend:staging-'+str(n).zfill(40))
 elif args and args[0]=='inspect':
  if '{{.State.Running}}' in args: print('true')
  elif any('State.Health' in a for a in args): print('healthy')
 elif any('COALESCE' in a for a in args): print(0)
elif name=='curl':
 if 'https://api.resend.com/emails' in args:
  with open(os.environ['MOCK_EMAILS'],'a') as f: f.write(args[args.index('--data')+1]+'\\n')
 else: print('{}' if c.get('apiDown') else '{"status":"ok"}')
elif name=='df': print('Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/test 100 55 45 55% /')
elif name=='stat': print(int(time.time()))
elif name=='sha256sum': print(hashlib.sha256(Path(args[0]).read_bytes()).hexdigest()+'  '+args[0])
`, { mode: 0o700 });
    for (const command of ['docker', 'curl', 'df', 'stat', 'sha256sum']) symlinkSync(mock, join(bin, command));
    const config = join(dir, 'config.json'), emails = join(dir, 'emails');
    writeFileSync(emails, '');
    writeFileSync(join(dir, 'key'), 'test-only');
    for (const name of ['last-successful-backup', 'last-successful-restore-test']) writeFileSync(join(dir, name), 'ok');
    const run = (images, apiDown = false, dry = false) => {
      writeFileSync(config, JSON.stringify({ images, apiDown }));
      return spawnSync('bash', [monitor], { encoding: 'utf8', env: { ...process.env,
        PATH: `${bin}:${process.env.PATH}`, MOCK_CONFIG: config, MOCK_EMAILS: emails,
        MONITOR_STATE_DIR: join(dir, 'state'), BACKUP_DIR: dir, RESEND_API_KEY_FILE: join(dir, 'key'),
        EXPECTED_CONTAINERS: 'test-api', HEARTBEAT_URL: '', MONITOR_DRY_RUN: dry ? '1' : '0',
      }});
    };
    const count = () => readFileSync(emails, 'utf8').trim().split('\n').filter(Boolean).length;
    assert.equal(run(41).status, 1); assert.equal(count(), 1);
    assert.equal(run(42).status, 1); assert.equal(count(), 1);
    assert.equal(run(44).status, 1); assert.equal(count(), 1);
    assert.equal(run(44, true).status, 1); assert.equal(count(), 2);
    assert.equal(run(44, true, true).status, 1); assert.equal(count(), 2);
    assert.equal(run(8).status, 0); assert.equal(count(), 3);
    assert.equal(run(8).status, 0); assert.equal(count(), 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('image retention preserves used, rollback, recent, newest and unrelated images', () => {
  const script = fileURLToPath(new URL('../../deploy/cleanup-release-images.py', import.meta.url));
  const result = spawnSync('python3', ['-c', `
import importlib.util, datetime as dt
spec=importlib.util.spec_from_file_location('cleanup', ${JSON.stringify(script)})
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
now=dt.datetime.now(dt.timezone.utc)
images=[{'ref': 'neurocrop-backend:staging-'+str(n).zfill(40), 'id': str(n), 'created': now-dt.timedelta(days=n)} for n in range(9)]
images += [{'ref': 'postgres:15', 'id': 'postgres', 'created': now-dt.timedelta(days=100)}]
removed=m.select_removals(images, {'4','7'}, now)
assert removed == [images[n]['ref'] for n in [3,5,6,8]], removed
# Several images built in a day are all retained even outside the newest three.
for image in images[:9]: image['created']=now-dt.timedelta(hours=5)
assert m.select_removals(images, set(), now)==[]
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
