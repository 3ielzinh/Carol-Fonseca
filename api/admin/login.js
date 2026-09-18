import { createHash, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { createSessionCookie } from './_session.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const memoryAttempts = new Map();

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function checkRateLimit(rateKey) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken) {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, RATE_LIMIT_WINDOW_MS / 1000);
    return attempts;
  }

  const now = Date.now();
  const entry = memoryAttempts.get(rateKey);
  if (!entry || entry.resetAt < now) {
    memoryAttempts.set(rateKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const adminPassword = process.env.ADMIN_PANEL_PASSWORD;
  if (!adminPassword || !process.env.ADMIN_SESSION_SECRET) {
    console.error('ADMIN_PANEL_PASSWORD or ADMIN_SESSION_SECRET is not configured.');
    return response.status(503).json({ error: 'Painel indisponível.' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    return response.status(400).json({ error: 'Dados inválidos.' });
  }

  const forwardedIp = String(request.headers['x-forwarded-for']?.split(',')[0] || 'unknown').trim();
  const rateKey = `admin-login-rate:${createHash('sha256').update(forwardedIp).digest('hex').slice(0, 24)}`;

  let attempts;
  try {
    attempts = await checkRateLimit(rateKey);
  } catch (error) {
    console.error('Admin login rate-limit check failed:', error.message);
    return response.status(503).json({ error: 'Painel indisponível.' });
  }
  if (attempts > RATE_LIMIT_MAX_ATTEMPTS) {
    return response.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const suppliedPassword = String(body.password || '');
  if (!safeEqual(suppliedPassword, adminPassword)) {
    return response.status(401).json({ error: 'Senha incorreta.' });
  }

  response.setHeader('Set-Cookie', createSessionCookie());
  return response.status(200).json({ ok: true });
}
