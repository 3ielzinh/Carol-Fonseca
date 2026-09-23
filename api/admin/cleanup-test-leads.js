// TEMPORÁRIO — remove leads de teste gerados durante a integração do
// checkout (Mercado Pago). Remover este arquivo após o uso.
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

function authorized(request) {
  const secret = process.env.CLEANUP_SECRET;
  return Boolean(secret) && request.headers['x-cleanup-secret'] === secret;
}

function redisClient() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url: redisUrl, token: redisToken });
}

function isTestLead(lead) {
  return Boolean(lead?.id?.startsWith('test-onecent-') || lead?.name?.startsWith('Teste'));
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(404).json({ error: 'Não encontrado.' });
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const redis = redisClient();
  const ids = await redis.zrange('leads:created', 0, -1);
  const leads = await Promise.all(ids.map((id) => redis.hgetall(`lead:${id}`)));
  const testLeads = leads.filter(isTestLead);

  if (request.method === 'GET') {
    return response.status(200).json({ matched: testLeads.length, ids: testLeads.map((l) => l.id) });
  }

  for (const lead of testLeads) {
    await redis.del(`lead:${lead.id}`);
    await redis.zrem('leads:created', lead.id);
    if (lead.email) {
      const emailKey = `leads:email:${createHash('sha256').update(lead.email).digest('hex')}`;
      await redis.srem(emailKey, lead.id);
    }
  }

  return response.status(200).json({ deleted: testLeads.length, ids: testLeads.map((l) => l.id) });
}
