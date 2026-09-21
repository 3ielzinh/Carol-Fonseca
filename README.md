# Carol Fonseca — Nasce um Novo Líder

Reformulação visual da página de vendas da formação **Nasce um Novo Líder**, de Carol Fonseca.

## Página

Os arquivos da página estão na raiz do repositório para permitir publicação direta na Vercel.

Rotas publicadas:

- `/` — landing page da formação Nasce um Novo Líder
- `/links` — página de links para a bio do Instagram

Execute `npm run dev` e abra `http://127.0.0.1:8765` para visualizar a versão local com o pré-checkout funcional. Durante o desenvolvimento, os cadastros são gravados em `work/leads-dev.ndjson`.

## Pré-checkout e leads

Os botões “Quero entrar” abrem um pré-checkout rápido com nome, WhatsApp, e-mail e cargo. O fluxo registra UTMs e consentimento e, depois da gravação, cria uma preferência de pagamento no Mercado Pago e encaminha a pessoa para o checkout (Checkout Pro).

Os dados são persistidos por `api/leads.js` no Upstash Redis. No projeto da Vercel, adicione a integração **Upstash Redis** pelo Marketplace; as variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` serão disponibilizadas automaticamente.

Para também enviar cada cadastro a um CRM, automação ou planilha, configure `LEAD_WEBHOOK_URL` e, se necessário, `LEAD_WEBHOOK_SECRET`. Consulte `.env.example`.

## Pagamento (Mercado Pago)

`api/payments/create-preference.js` cria a preferência de pagamento (Checkout Pro) para o lead recém-cadastrado e devolve o link de checkout. Requer `MP_ACCESS_TOKEN` (Access Token da conta Mercado Pago da cliente).

`api/payments/webhook.js` recebe a notificação de pagamento do Mercado Pago, consulta o pagamento pela API e atualiza automaticamente o `paymentStatus` do lead (Redis ou, em dev, o arquivo local `-payments.json`) para `paid` quando aprovado. Configure a URL `https://SEU-DOMINIO/api/payments/webhook` no painel do Mercado Pago (Suas integrações → a aplicação → Webhooks) e, se possível, `MP_WEBHOOK_SECRET` com a chave secreta gerada lá para validar a assinatura das notificações.

Depois do pagamento, a pessoa é redirecionada para `/obrigado`, que mostra uma mensagem diferente conforme o status (aprovado, pendente ou recusado). O painel administrativo (`/admin`) continua disponível para conferir e corrigir manualmente o status de qualquer lead, se necessário.

## Identidade visual

- Verde: `#C7E53B`
- Terracota: `#AF4C0F`
- Cinza: `#EAEAEA`
- Preto e branco
