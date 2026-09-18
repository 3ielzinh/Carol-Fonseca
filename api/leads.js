import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Redis } from '@upstash/redis';

const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function alertOps(message) {
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OPS_ALERT_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.OPS_ALERT_WEBHOOK_SECRET}` } : {})
      },
      body: JSON.stringify({ source: 'api/leads', message, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    console.error('Ops alert webhook failed:', error.message);
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const localLeadStore = process.env.LOCAL_LEAD_STORE;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!localLeadStore && (!redisUrl || !redisToken)) {
    console.error('Upstash Redis environment variables are not configured.');
    await alertOps('Upstash Redis environment variables are not configured.');
    return response.status(503).json({ error: 'O cadastro está temporariamente indisponível.' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    return response.status(400).json({ error: 'Dados inválidos.' });
  }
  if (body.website) return response.status(201).json({ id: randomUUID() });

  const lead = {
    id: randomUUID(),
    name: clean(body.name, 100),
    phone: clean(body.phone, 15).replace(/\D/g, ''),
    email: clean(body.email, 160).toLowerCase(),
    jobTitle: clean(body.jobTitle, 100),
    consent: body.consent === true,
    consentTextVersion: '2026-09-06',
    sourceCta: clean(body.sourceCta, 120),
    pageUrl: clean(body.pageUrl, 500),
    referrer: clean(body.referrer, 500),
    utmSource: clean(body.utmSource, 100),
    utmMedium: clean(body.utmMedium, 100),
    utmCampaign: clean(body.utmCampaign, 150),
    utmContent: clean(body.utmContent, 150),
    utmTerm: clean(body.utmTerm, 150),
    status: 'precheckout',
    createdAt: new Date().toISOString()
  };

  if (
    lead.name.length < 2 ||
    lead.phone.length < 10 ||
    !isEmail(lead.email) ||
    lead.jobTitle.length < 2 ||
    !lead.consent
  ) {
    return response.status(400).json({ error: 'Revise os campos obrigatórios e tente novamente.' });
  }

  if (localLeadStore) {
    await mkdir(dirname(localLeadStore), { recursive: true });
    await appendFile(localLeadStore, `${JSON.stringify(lead)}\n`, 'utf8');
    console.log('[api/leads] lead saved locally', { id: lead.id });
    return response.status(201).json({ id: lead.id, webhookSynced: false, local: true });
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });
  const forwardedIp = clean(request.headers['x-forwarded-for']?.split(',')[0], 64);
  const rateKey = `lead-rate:${createHash('sha256').update(forwardedIp || 'unknown').digest('hex').slice(0, 24)}`;

  let attempts;
  try {
    attempts = await redis.incr(rateKey);
    if (attempts === 1) await redis.expire(rateKey, 3600);
  } catch (error) {
    console.error('Redis rate-limit check failed:', error.message);
    await alertOps(`Redis rate-limit check failed: ${error.message}`);
    return response.status(503).json({ error: 'O cadastro está temporariamente indisponível.' });
  }
  if (attempts > 8) return response.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.' });

  const emailRateKey = `lead-rate-email:${createHash('sha256').update(lead.email).digest('hex').slice(0, 24)}`;
  let emailAttempts;
  try {
    emailAttempts = await redis.incr(emailRateKey);
    if (emailAttempts === 1) await redis.expire(emailRateKey, 3600);
  } catch (error) {
    console.error('Redis email rate-limit check failed:', error.message);
    await alertOps(`Redis email rate-limit check failed: ${error.message}`);
    return response.status(503).json({ error: 'O cadastro está temporariamente indisponível.' });
  }
  if (emailAttempts > 8) return response.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.' });

  const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const emailKey = `leads:email:${createHash('sha256').update(lead.email).digest('hex')}`;

  try {
    const existingIds = await redis.smembers(emailKey);
    let recentLead = null;
    if (existingIds.length) {
      const existingLeads = await Promise.all(existingIds.map((id) => redis.hgetall(`lead:${id}`)));
      recentLead = existingLeads
        .filter((existing) => existing?.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
      if (recentLead && Date.now() - new Date(recentLead.createdAt).getTime() > DEDUPE_WINDOW_MS) {
        recentLead = null;
      }
    }

    if (recentLead) {
      lead.id = recentLead.id;
      lead.createdAt = recentLead.createdAt;
      lead.resubmitCount = Number(recentLead.resubmitCount || 0) + 1;
      lead.updatedAt = new Date().toISOString();
      await redis.hset(`lead:${lead.id}`, lead);
    } else {
      lead.resubmitCount = 0;
      lead.updatedAt = lead.createdAt;
      await redis.hset(`lead:${lead.id}`, lead);
      await redis.zadd('leads:created', { score: Date.now(), member: lead.id });
      await redis.sadd(emailKey, lead.id);
    }
  } catch (error) {
    console.error('Redis lead write failed:', error.message);
    await alertOps(`Redis lead write failed: ${error.message}`);
    return response.status(503).json({ error: 'O cadastro está temporariamente indisponível.' });
  }

  let webhookSynced = false;
  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      const webhookResponse = await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.LEAD_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.LEAD_WEBHOOK_SECRET}` } : {})
        },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(5000)
      });
      webhookSynced = webhookResponse.ok;
    } catch (error) {
      console.error('Lead webhook failed:', error.message);
    }
  }

  return response.status(201).json({ id: lead.id, webhookSynced });
}
