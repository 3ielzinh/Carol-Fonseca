import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import leadHandler from '../api/leads.js';
import adminLoginHandler from '../api/admin/login.js';
import adminLogoutHandler from '../api/admin/logout.js';
import adminLeadsHandler from '../api/admin/leads.js';
import adminPaymentHandler from '../api/admin/leads/payment.js';
import createPreferenceHandler from '../api/payments/create-preference.js';
import paymentsWebhookHandler from '../api/payments/webhook.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8765);
process.env.LOCAL_LEAD_STORE = process.env.LOCAL_LEAD_STORE || path.join(root, 'work', 'leads-dev.ndjson');
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'dev-only-session-secret';
if (!process.env.ADMIN_PANEL_PASSWORD) process.env.ADMIN_PANEL_PASSWORD = 'dev123';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const readBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_000) throw new Error('Payload muito grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const apiRoutes = {
  '/api/leads': leadHandler,
  '/api/admin/login': adminLoginHandler,
  '/api/admin/logout': adminLogoutHandler,
  '/api/admin/leads': adminLeadsHandler,
  '/api/admin/leads/payment': adminPaymentHandler,
  '/api/payments/create-preference': createPreferenceHandler,
  '/api/payments/webhook': paymentsWebhookHandler
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const apiHandler = apiRoutes[url.pathname];

  if (apiHandler) {
    try {
      const body = request.method === 'POST' ? await readBody(request) : '';
      const apiResponse = {
        setHeader: (name, value) => response.setHeader(name, value),
        status(statusCode) {
          response.statusCode = statusCode;
          return this;
        },
        json(payload) {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
          return this;
        }
      };
      await apiHandler({ method: request.method, headers: request.headers, url: request.url, body }, apiResponse);
    } catch (error) {
      console.error('[dev-server] api request failed', error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Não foi possível processar a solicitação agora.' });
      else response.end();
    }
    return;
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    sendJson(response, 405, { error: 'Método não permitido.' });
    return;
  }

  try {
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(root, `.${requestedPath}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('Caminho inválido.');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error('Arquivo não encontrado.');
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(data);
  } catch {
    sendJson(response, 404, { error: 'Arquivo não encontrado.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dev-server] aplicação: http://127.0.0.1:${port}`);
  console.log(`[dev-server] leads locais: ${process.env.LOCAL_LEAD_STORE}`);
  console.log(`[dev-server] painel admin: http://127.0.0.1:${port}/admin.html (senha: ${process.env.ADMIN_PANEL_PASSWORD})`);
});
