import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import leadHandler from '../api/leads.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8765);
process.env.LOCAL_LEAD_STORE = process.env.LOCAL_LEAD_STORE || path.join(root, 'work', 'leads-dev.ndjson');

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

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/leads') {
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
      await leadHandler({ method: request.method, headers: request.headers, body }, apiResponse);
    } catch (error) {
      console.error('[dev-server] lead request failed', error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Não foi possível salvar seus dados agora.' });
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
});
