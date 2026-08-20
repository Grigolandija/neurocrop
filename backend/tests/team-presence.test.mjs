import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../team-routes.js', import.meta.url), 'utf8');

test('team presence combines active local and Clerk sessions within the current organization', () => {
  assert.match(source, /FROM auth_sessions auth_session[\s\S]*auth_session\.organization_id=m\.organization_id/);
  assert.match(source, /FROM clerk_session_contexts context[\s\S]*context\.organization_id=m\.organization_id/);
  assert.match(source, /last_active_at >= now\(\) - interval '2 minutes'/);
  assert.match(source, /lastActiveAt: row\.last_active_at \|\| null/);
});

test('presence heartbeat touches only the authenticated session and organization', () => {
  assert.match(source, /app\.post\('\/presence', requireUserAuth/);
  assert.match(source, /WHERE session_id=\$1 AND user_id=\$2 AND organization_id=\$3/);
  assert.match(source, /WHERE token_hash=\$1 AND user_id=\$2 AND organization_id=\$3/);
  assert.match(source, /hashSessionToken\(token\)/);
});
