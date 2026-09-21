import { createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { setLocalPaymentStatus } from '../admin/leads/payment.js';

// https://www.mercadopago.com.br/developers/en/docs/checkout-api/additional-content/your-integrations/notifications/webhooks#editor_5
function verifySignature(request, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const signatureHeader = request.headers['x-signature'];
  const requestId = request.headers['x-request-id'];
  if (!signatureHeader || !requestId) return false;

  const parts = {};
  for (const part of String(signatureHeader).split(',')) {
    const [key, value] = part.split('=').map((piece) => piece.trim());
    if (key) parts[key] = value;
  }
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const bufExpected = Buffer.from(expected);
  const bufReceived = Buffer.from(parts.v1);
  if (bufExpected.length !== bufReceived.length) return false;
  return timingSafeEqual(bufExpected, bufReceived);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('MP_ACCESS_TOKEN is not configured.');
    return response.status(503).json({ error: 'Webhook indisponível.' });
  }

  let body = {};
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    body = {};
  }

  const url = new URL(request.url || '/', 'http://localhost');
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic;
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || body.data?.id;

  if (type !== 'payment' || !dataId) return response.status(200).json({ ok: true });

  if (!verifySignature(request, dataId)) {
    console.error('Mercado Pago webhook signature mismatch.');
    return response.status(401).json({ error: 'Assinatura inválida.' });
  }

  let payment;
  try {
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000)
    });
    payment = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(payment?.message || `Mercado Pago respondeu ${paymentResponse.status}`);
  } catch (error) {
    console.error('Mercado Pago payment lookup failed:', error.message);
    return response.status(502).json({ error: 'Falha ao consultar o pagamento.' });
  }

  const leadId = payment.external_reference;
  if (!leadId) return response.status(200).json({ ok: true });

  const paymentStatus = payment.status === 'approved' ? 'paid' : 'pending';

  try {
    if (process.env.LOCAL_LEAD_STORE) {
      await setLocalPaymentStatus(leadId, paymentStatus);
    } else {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      const redis = new Redis({ url: redisUrl, token: redisToken });
      const lead = await redis.hgetall(`lead:${leadId}`);
      if (!lead || !lead.id) {
        console.error('Mercado Pago webhook: lead not found for external_reference', leadId);
        return response.status(200).json({ ok: true });
      }
      await redis.hset(`lead:${leadId}`, {
        paymentStatus,
        mpPaymentId: String(dataId),
        mpStatus: payment.status,
        paymentUpdatedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Mercado Pago webhook lead update failed:', error.message);
    return response.status(503).json({ error: 'Não foi possível atualizar o pagamento agora.' });
  }

  return response.status(200).json({ ok: true });
}
