import { readFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';

const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/DotrGXaxHh98PjPe7zlgbc?s=cl&p=i&mlu=4&ilr=4';

async function findLocalLead(id) {
  const ndjsonPath = process.env.LOCAL_LEAD_STORE;
  let lines = [];
  try {
    const raw = await readFile(ndjsonPath, 'utf8');
    lines = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    lines = [];
  }
  const lead = lines.filter((entry) => entry.id === id).pop();
  if (!lead) return null;

  let paymentsPath;
  try {
    paymentsPath = ndjsonPath.replace(/\.ndjson$/, '-payments.json');
    const payments = JSON.parse(await readFile(paymentsPath, 'utf8'));
    lead.paymentStatus = payments[id] || 'pending';
  } catch {
    lead.paymentStatus = 'pending';
  }
  return lead;
}

async function findRedisLead(id) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url: redisUrl, token: redisToken });
  const lead = await redis.hgetall(`lead:${id}`);
  return lead && lead.id ? lead : null;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const url = new URL(request.url || '/', 'http://localhost');
  const leadId = String(url.searchParams.get('lead') || '').trim();
  if (!leadId) return response.status(400).json({ error: 'Informe o lead.' });

  let lead;
  try {
    lead = process.env.LOCAL_LEAD_STORE ? await findLocalLead(leadId) : await findRedisLead(leadId);
  } catch (error) {
    console.error('Group link lookup failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível verificar o pagamento agora.' });
  }

  if (!lead || lead.paymentStatus !== 'paid') {
    return response.status(403).json({ error: 'Pagamento não confirmado.' });
  }

  return response.status(200).json({ groupLink: WHATSAPP_GROUP_LINK });
}
