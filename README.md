# Carol Fonseca — Nasce um Novo Líder

Reformulação visual da página de vendas da formação **Nasce um Novo Líder**, de Carol Fonseca.

## Página

Os arquivos da página estão na raiz do repositório para permitir publicação direta na Vercel.

Rotas publicadas:

- `/` — landing page da formação Nasce um Novo Líder
- `/links` — página de links para a bio do Instagram

Execute `npm run dev` e abra `http://127.0.0.1:8765` para visualizar a versão local com o pré-checkout funcional. Durante o desenvolvimento, os cadastros são gravados em `work/leads-dev.ndjson`.

## Pré-checkout e leads

Os botões “Quero entrar” abrem um pré-checkout rápido com nome, WhatsApp, e-mail e cargo. O fluxo registra UTMs e consentimento e, depois da gravação, encaminha a pessoa ao checkout Nubank.

Os dados são persistidos por `api/leads.js` no Upstash Redis. No projeto da Vercel, adicione a integração **Upstash Redis** pelo Marketplace; as variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` serão disponibilizadas automaticamente.

Para também enviar cada cadastro a um CRM, automação ou planilha, configure `LEAD_WEBHOOK_URL` e, se necessário, `LEAD_WEBHOOK_SECRET`. Consulte `.env.example`.

## Identidade visual

- Verde: `#C7E53B`
- Terracota: `#AF4C0F`
- Cinza: `#EAEAEA`
- Preto e branco
