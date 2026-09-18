import { clearSessionCookie } from './_session.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  response.setHeader('Set-Cookie', clearSessionCookie());
  return response.status(200).json({ ok: true });
}
