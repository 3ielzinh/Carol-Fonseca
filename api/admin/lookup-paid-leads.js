// TEMPORÁRIO — localizar leads pagos recentes pra dar suporte a um caso
// pontual relatado pela cliente. Remover este arquivo após o uso.
import { Redis } from '@upstash/redis';

function authorized(request) {
  const secret = process.env.LOOKUP_SECRET;
  return Boolean(secret) && request.headers['x-lookup-secret'] === secret;
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(404).json({ error: 'Não encontrado.' });
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url: redisUrl, token: redisToken });

  const ids = await redis.zrange('leads:created', 0, -1, { rev: true });
  const leads = await Promise.all(ids.map((id) => redis.hgetall(`lead:${id}`)));

  const paid = leads
    .filter((lead) => lead?.paymentStatus === 'paid')
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      createdAt: lead.createdAt,
      paymentUpdatedAt: lead.paymentUpdatedAt || null
    }));

  return response.status(200).json({ count: paid.length, leads: paid });
}
