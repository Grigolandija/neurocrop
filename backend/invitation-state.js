export function invitationState(row, now = new Date()) {
  if (!row) return 'invalid';
  if (row.revoked_at) return 'revoked';
  if (row.accepted_at) return 'accepted';
  if (row.organization_status && row.organization_status !== 'active') return 'unavailable';
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= new Date(now).getTime()) return 'expired';
  return 'pending';
}
