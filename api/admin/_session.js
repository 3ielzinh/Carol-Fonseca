import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const signature = sign(payload);
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return `${COOKIE_NAME}=${payload}.${signature}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${isProd ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

function parseCookies(header) {
  const cookies = {};
  (header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return cookies;
}

export function verifySession(request) {
  const cookies = parseCookies(request.headers?.cookie);
  const value = cookies[COOKIE_NAME];
  if (!value) return false;

  const separatorIndex = value.lastIndexOf('.');
  if (separatorIndex === -1) return false;
  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);

  let expected;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (!safeEqual(signature, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export function requireSession(request, response) {
  if (!verifySession(request)) {
    response.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return false;
  }
  return true;
}
