import { readFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';

const COURSE_TITLE = 'Nasce um Novo Líder — Formação com Carol Fonseca';
const COURSE_PRICE_BRL = 297;
const MAX_INSTALLMENTS = 5;

function resolveSiteOrigin(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${proto}://${host}`;
}

async function findLocalLead(id) {
  const ndjsonPath = process.env.LOCAL_LEAD_STORE;
  let lines = [];
  try {
    const raw = await readFile(ndjsonPath, 'utf8');
    lines = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    lines = [];
  }
  return lines.filter((lead) => lead.id === id).pop() || null;
}

async function findRedisLead(id) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url: redisUrl, token: redisToken });
  const lead = await redis.hgetall(`lead:${id}`);
  return lead && lead.id ? lead : null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('MP_ACCESS_TOKEN is not configured.');
    return response.status(503).json({ error: 'O checkout está temporariamente indisponível.' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    return response.status(400).json({ error: 'Dados inválidos.' });
  }

  const leadId = String(body.leadId || '').trim();
  if (!leadId) return response.status(400).json({ error: 'Informe o lead.' });

  let lead;
  try {
    lead = process.env.LOCAL_LEAD_STORE ? await findLocalLead(leadId) : await findRedisLead(leadId);
  } catch (error) {
    console.error('Payment preference lead lookup failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível iniciar o checkout agora.' });
  }
  if (!lead) return response.status(404).json({ error: 'Cadastro não encontrado.' });

  const origin = resolveSiteOrigin(request);
  const [firstName, ...rest] = String(lead.name || '').trim().split(/\s+/);

  const preferencePayload = {
    items: [{
      title: COURSE_TITLE,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: COURSE_PRICE_BRL
    }],
    payer: {
      name: firstName || undefined,
      surname: rest.join(' ') || undefined,
      email: lead.email || undefined
    },
    payment_methods: {
      installments: MAX_INSTALLMENTS
    },
    external_reference: leadId,
    back_urls: {
      success: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`,
      pending: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`,
      failure: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`
    },
    auto_return: 'approved',
    notification_url: `${origin}/api/payments/webhook`,
    statement_descriptor: 'CAROLFONSECA'
  };

  let preference;
  try {
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(preferencePayload),
      signal: AbortSignal.timeout(8000)
    });
    preference = await mpResponse.json();
    if (!mpResponse.ok) throw new Error(preference?.message || `Mercado Pago respondeu ${mpResponse.status}`);
  } catch (error) {
    console.error('Mercado Pago preference creation failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível abrir o checkout agora.' });
  }

  return response.status(201).json({ initPoint: preference.init_point, preferenceId: preference.id });
}
