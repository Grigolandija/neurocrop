const PRODUCTION_ORIGINS = ['https://neurocrop.lt', 'https://www.neurocrop.lt'];

export function getAllowedOrigins(env = process.env) {
  const configured = String(env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured.length ? configured : [...PRODUCTION_ORIGINS];
  if (String(env.ALLOW_LOCAL_DEV_ORIGINS || '').toLowerCase() === 'true') {
    origins.push('http://127.0.0.1:4173', 'http://localhost:4173');
  }
  return [...new Set(origins)];
}

export function getTrustProxyHops(env = process.env) {
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }
  return hops;
}

export function getSessionCookieOptions(env = process.env) {
  const sameSite = String(env.SESSION_SAME_SITE || 'lax').toLowerCase();
  const validSameSite = new Set(['lax', 'strict', 'none']);
  if (!validSameSite.has(sameSite)) throw new Error('SESSION_SAME_SITE must be lax, strict, or none');
  if (sameSite === 'none' && env.SESSION_COOKIE_SECURE === 'false') {
    throw new Error('SameSite=None requires a secure session cookie');
  }
  return {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE !== 'false',
    sameSite
  };
}

export function publicError(error, fallbackCode = 'INTERNAL_ERROR') {
  const status = Number(error?.status) || 500;
  if (status < 500) {
    return { status, code: error?.code || 'VALIDATION_ERROR', message: error?.message || 'Request failed' };
  }
  return { status: 500, code: fallbackCode, message: 'Internal server error' };
}
