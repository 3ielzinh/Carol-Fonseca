import { readFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';
import { requireSession } from './_session.js';

const PAGE_SIZE = 25;

function normalizeLead(lead) {
  return { ...lead, paymentStatus: lead.paymentStatus || 'pending' };
}

function paymentsPathFor(ndjsonPath) {
  return ndjsonPath.replace(/\.ndjson$/, '-payments.json');
}

async function listFromRedis(page) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url: redisUrl, token: redisToken });

  const start = page * PAGE_SIZE;
  const stop = start + PAGE_SIZE - 1;
  const ids = await redis.zrange('leads:created', start, stop, { rev: true });
  const total = await redis.zcard('leads:created');
  const leads = await Promise.all(ids.map((id) => redis.hgetall(`lead:${id}`)));
  return { leads: leads.filter(Boolean).map(normalizeLead), total };
}

async function listFromLocal(page) {
  const ndjsonPath = process.env.LOCAL_LEAD_STORE;

  let lines = [];
  try {
    const raw = await readFile(ndjsonPath, 'utf8');
    lines = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    lines = [];
  }

  let payments = {};
  try {
    payments = JSON.parse(await readFile(paymentsPathFor(ndjsonPath), 'utf8'));
  } catch {
    payments = {};
  }

  const byId = new Map();
  for (const lead of lines) byId.set(lead.id, lead);
  const all = Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((lead) => ({ ...lead, paymentStatus: payments[lead.id] || 'pending' }));

  const start = page * PAGE_SIZE;
  return { leads: all.slice(start, start + PAGE_SIZE), total: all.length };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Método não permitido.' });
  }
  if (!requireSession(request, response)) return;

  const url = new URL(request.url || '/', 'http://localhost');
  const page = Math.max(0, Number(url.searchParams.get('page')) || 0);

  try {
    const result = process.env.LOCAL_LEAD_STORE
      ? await listFromLocal(page)
      : await listFromRedis(page);
    return response.status(200).json({ ...result, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error('Admin leads listing failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível carregar os leads agora.' });
  }
}
