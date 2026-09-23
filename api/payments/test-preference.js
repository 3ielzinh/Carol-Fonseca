// TEMPORÁRIO — usado só para validar o webhook do Mercado Pago com um pagamento
// real de R$0,01, sem alterar o preço público do curso. Remover após o teste.
import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

function resolveSiteOrigin(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${proto}://${host}`;
}

function authorized(request) {
  const secret = process.env.TEST_PAYMENT_SECRET;
  return Boolean(secret) && request.headers['x-test-secret'] === secret;
}

function redisClient() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return new Redis({ url: redisUrl, token: redisToken });
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(404).json({ error: 'Não encontrado.' });

  if (request.method === 'GET') {
    const url = new URL(request.url || '/', 'http://localhost');
    const leadId = url.searchParams.get('leadId');
    const preferenceId = url.searchParams.get('preferenceId');
    const accessToken = process.env.MP_ACCESS_TOKEN;

    const meResponse = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const me = await meResponse.json().catch(() => ({}));
    const credentialInfo = {
      collectorId: me.id || null,
      isTestAccount: typeof me.email === 'string' && me.email.includes('@testuser.com'),
      siteId: me.site_id || null
    };

    let redisState = null;
    if (leadId) {
      const lead = await redisClient().hgetall(`lead:${leadId}`);
      redisState = {
        redisPaymentStatus: lead?.paymentStatus || 'pending',
        redisMpStatus: lead?.mpStatus || null,
        redisMpPaymentId: lead?.mpPaymentId || null
      };
    }

    let mercadoPagoSide = null;
    if (leadId) {
      const searchResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(leadId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const search = await searchResponse.json().catch(() => ({}));
      mercadoPagoSide = (search.results || []).map((p) => ({ id: p.id, status: p.status, status_detail: p.status_detail }));
    }

    let merchantOrder = null;
    if (preferenceId) {
      const orderResponse = await fetch(
        `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(preferenceId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const orderSearch = await orderResponse.json().catch(() => ({}));
      merchantOrder = (orderSearch.elements || []).map((order) => ({
        id: order.id,
        external_reference: order.external_reference,
        status: order.status,
        payments: (order.payments || []).map((p) => ({ id: p.id, status: p.status, transaction_amount: p.transaction_amount }))
      }));
    }

    let paymentsOnDate = null;
    const dateParam = url.searchParams.get('date');
    if (dateParam) {
      const beginDate = `${dateParam}T00:00:00.000-03:00`;
      const endDate = `${dateParam}T23:59:59.999-03:00`;
      const dateResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/search?range=date_created&begin_date=${encodeURIComponent(beginDate)}&end_date=${encodeURIComponent(endDate)}&sort=date_created&criteria=desc&limit=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const dateSearch = await dateResponse.json().catch(() => ({}));
      paymentsOnDate = (dateSearch.results || []).map((p) => ({
        id: p.id,
        status: p.status,
        external_reference: p.external_reference,
        date_created: p.date_created
      }));
    }

    return response.status(200).json({ credentialInfo, ...redisState, mercadoPagoSide, merchantOrder, paymentsOnDate });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  let body = {};
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    body = {};
  }

  let leadId = String(body.leadId || '').trim();
  const redis = redisClient();

  if (leadId) {
    const existingLead = await redis.hgetall(`lead:${leadId}`);
    if (!existingLead || !existingLead.id) return response.status(404).json({ error: 'Lead não encontrado.' });
  } else {
    leadId = `test-onecent-${randomUUID()}`;
    const now = new Date().toISOString();
    await redis.hset(`lead:${leadId}`, {
      id: leadId,
      name: 'Teste webhook (1 centavo)',
      phone: '',
      email: 'teste-1-centavo@example.com',
      jobTitle: 'Teste',
      status: 'precheckout',
      createdAt: now,
      updatedAt: now,
      resubmitCount: 0
    });
  }

  const origin = resolveSiteOrigin(request);
  const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      items: [{
        title: '[TESTE] Verificação de webhook — Carol Fonseca',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: 0.01
      }],
      external_reference: leadId,
      back_urls: {
        success: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`,
        pending: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`,
        failure: `${origin}/obrigado?lead=${encodeURIComponent(leadId)}`
      },
      auto_return: 'approved',
      notification_url: `${origin}/api/payments/webhook`
    }),
    signal: AbortSignal.timeout(8000)
  });
  const preference = await mpResponse.json();
  if (!mpResponse.ok) {
    return response.status(502).json({ error: preference?.message || 'Falha ao criar preferência de teste.' });
  }

  return response.status(201).json({ leadId, initPoint: preference.init_point });
}
