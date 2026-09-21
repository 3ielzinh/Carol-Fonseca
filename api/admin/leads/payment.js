import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Redis } from '@upstash/redis';
import { requireSession } from '../_session.js';

const VALID_STATUSES = new Set(['pending', 'paid']);

export function paymentsPathFor(ndjsonPath) {
  return ndjsonPath.replace(/\.ndjson$/, '-payments.json');
}

export async function setLocalPaymentStatus(id, status) {
  const ndjsonPath = process.env.LOCAL_LEAD_STORE;
  const paymentsPath = paymentsPathFor(ndjsonPath);

  let payments = {};
  try {
    payments = JSON.parse(await readFile(paymentsPath, 'utf8'));
  } catch {
    payments = {};
  }

  if (status === 'pending') delete payments[id];
  else payments[id] = status;

  await mkdir(dirname(paymentsPath), { recursive: true });
  await writeFile(paymentsPath, JSON.stringify(payments, null, 2), 'utf8');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }
  if (!requireSession(request, response)) return;

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    return response.status(400).json({ error: 'Dados inválidos.' });
  }

  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!id || !VALID_STATUSES.has(status)) {
    return response.status(400).json({ error: 'Informe um id e um status válido (pending ou paid).' });
  }

  try {
    if (process.env.LOCAL_LEAD_STORE) {
      await setLocalPaymentStatus(id, status);
    } else {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      const redis = new Redis({ url: redisUrl, token: redisToken });
      const lead = await redis.hgetall(`lead:${id}`);
      if (!lead) return response.status(404).json({ error: 'Lead não encontrado.' });
      await redis.hset(`lead:${id}`, { paymentStatus: status });
    }
    return response.status(200).json({ id, paymentStatus: status });
  } catch (error) {
    console.error('Admin payment update failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível atualizar o status agora.' });
  }
}
