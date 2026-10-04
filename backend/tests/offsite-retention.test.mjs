import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('offsite cleanup preserves recent backups, baselines and unrelated files and refuses unsafe inventory', () => {
  const result = spawnSync('python3', ['-c', `
import importlib.util, datetime as dt
spec=importlib.util.spec_from_file_location('cleanup','scripts/cleanup-offsite-backups.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
now=dt.datetime(2026,10,4,tzinfo=dt.timezone.utc)
def pair(day,db='neurocrop'):
 name=db+'-'+day+'T000000Z.dump'
 return [{'Path':name,'Size':100},{'Path':name+'.sha256','Size':80}]
entries=sum([pair(d) for d in ['20261004','20261003','20261002','20260701','20260601']],[])
entries += [{'Path':'unrelated.dump','Size':100},{'Path':'nested/neurocrop-20250101T000000Z.dump','Size':100}]
entries += [{'Path':'neurocrop-20250101T000000Z.dump','Size':100}]
plan=m.cleanup_plan(entries,['neurocrop'],90,now)
assert len(plan)==4 and all('20260701' in p or '20260601' in p for p in plan),plan
assert m.cleanup_plan(pair('20261004')+pair('20260101')+pair('20260102'),['neurocrop'],30,now)==[]
for inventory,dbs,days in [(pair('20260701'),['neurocrop'],90),(entries,['neurocrop','chirpstack'],90),(entries,['neurocrop'],0),(entries,['../neurocrop'],90)]:
 try: m.cleanup_plan(inventory,dbs,days,now)
 except ValueError: pass
 else: raise AssertionError('unsafe cleanup accepted')
`], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
