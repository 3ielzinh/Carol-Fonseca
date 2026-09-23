# Handoff — Integração Mercado Pago

Última atualização: 2026-09-23. Repositório sincronizado com `origin/main`.

## Status: ✅ Validado e funcionando

A integração com **Mercado Pago (Checkout Pro)** substituiu o link fixo de pagamento da Nubank, com confirmação automática de pagamento via webhook.

**Teste real de ponta a ponta confirmado em produção** (pagamento de R$5,00, aprovado via saldo de uma conta de terceiro, sem relação com a conta da cliente):

```
redisPaymentStatus: "paid"
redisMpStatus: "approved"
mercadoPagoSide: [{ status: "approved", status_detail: "accredited" }]
merchantOrder: { status: "closed", transaction_amount: 5 }
```

O webhook recebeu a notificação, consultou o pagamento na API do Mercado Pago e atualizou o lead para `paid` no Redis automaticamente, sem qualquer intervenção manual.

## O que foi construído

- `api/payments/create-preference.js` — recebe `leadId`, busca o lead (Redis ou local), cria a preferência de pagamento no Mercado Pago (R$297, até 5x) e devolve o link de checkout.
- `api/payments/webhook.js` — recebe a notificação do Mercado Pago, consulta o pagamento pela API, valida a assinatura (`MP_WEBHOOK_SECRET`, se configurada) e atualiza `paymentStatus` do lead para `paid` automaticamente.
- `obrigado.html` + `obrigado.js` — tela de agradecimento pós-checkout, com mensagem diferente conforme `status` (aprovado/pendente/recusado/ausente) e um botão para entrar no grupo do WhatsApp, exibido só quando o pagamento é aprovado.
- `script.js` — trocado o redirect fixo da Nubank pela chamada a `create-preference` + redirect para o `initPoint` retornado.
- `scripts/dev-server.js`, `.env.example`, `README.md` — atualizados para rodar/documentar o fluxo novo localmente.
- `api/admin/leads/payment.js` — `setLocalPaymentStatus`/`paymentsPathFor` exportados para reuso pelo webhook (modo dev local).

Painel admin (`/admin`) continua como fallback manual de correção de status, sem alterações de fluxo.

## Configuração em produção (Vercel — projeto `carol-fonseca`)

- `MP_ACCESS_TOKEN` — Access Token de produção, compartilhado pela cliente via "Suas integrações" do Mercado Pago Developers. Confirmado válido, de produção (não sandbox), coletor `302684579`, `siteId: MLB`.
- `MP_WEBHOOK_SECRET` — chave secreta do webhook registrado no painel do Mercado Pago (`https://carol-fonseca.vercel.app/api/payments/webhook`, evento "Pagamentos"). Confirmado funcionando.

## Diagnóstico do processo de teste (para referência futura)

Três tentativas de pagamento de teste falharam antes de dar certo, nenhuma por bug de código:
1. A cliente tentou pagar o próprio link → Mercado Pago bloqueia comprador = vendedor ("Você não pode pagar para si mesmo").
2. O dev, logado como colaborador da conta dela → erro "conta de colaborador não pode fazer pagamentos".
3. Valor de R$0,01 estava **abaixo do mínimo do Mercado Pago para cartão/Pix** (R$5,00) — por isso o checkout só oferecia saldo em conta, mascarando o problema real por várias tentativas. Subir o valor de teste pra R$5,00 resolveu.

Também foi corrigido nesse processo: `obrigado.js` mostrava "Pagamento confirmado" por padrão quando a URL não tinha o parâmetro de status (ex.: alguém voltando manualmente do checkout sem pagar). Agora só confirma quando `status=approved` de fato.

## Preço corrigido

A conta Mercado Pago da cliente **não tem parcelamento sem juros configurado** — confirmado num checkout real, que cobrou R$339,50 (5x de R$67,90) em vez dos R$297 anunciados. Isso não se resolve por código, é uma configuração da conta dela (Configurações → Meios de recebimento/cobrança → Parcelamento).

Até isso ser configurado, a copy do site foi ajustada pra refletir o valor real: **R$297 à vista** em destaque, "ou 5x de R$67,90 (R$339,50)" como opção parcelada — sem prometer "sem juros".

## Limpeza já feita

- `api/payments/test-preference.js` (endpoint temporário de diagnóstico) — **removido**.
- Desvio `?testpay=` no `script.js` — **removido**, formulário sempre usa `create-preference.js` normalmente.
- `api/admin/cleanup-test-leads.js` (endpoint temporário) — usado para apagar 9 leads de teste do Redis de produção (2 indexados + 7 órfãos que nunca apareceram no painel) e depois **removido**.

As env vars temporárias `TEST_PAYMENT_SECRET` e `CLEANUP_SECRET` foram removidas manualmente na Vercel e o projeto foi redeployado (2026-09-23) — nenhuma env var solta restante.

O lead real usado no teste final de R$5 (pago de verdade, por alguém sem relação com a conta da cliente) foi mantido no painel admin como `paid` — não é lixo de teste, é um pagamento real que só não corresponde a uma aluna de verdade. Pode marcar como reembolsado/ignorar conforme preferir.

## Auditoria de segurança (2026-09-23)

Revisão completa pedida ao final do projeto, pra garantir que nada sensível ficou exposto depois de todos os testes:

- **Env vars na Vercel:** só restam as esperadas — `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `ADMIN_PANEL_PASSWORD`, `ADMIN_SESSION_SECRET`, `REDIS_URL`/`KV_*` (integração Redis). Nenhuma variável de teste/diagnóstico sobrando.
- **Segredos no código:** nenhum token/chave hardcoded encontrado (busca por padrões de API key direto nos arquivos). Nenhum `.env` foi commitado — `.gitignore` cobre `.env`, `.env.local` e `.env*`.
- **Endpoints da API:** `/api/admin/leads` e `/api/admin/leads/payment` exigem sessão autenticada; `/api/leads` é público com rate limit + honeypot; `/api/payments/webhook` é público mas valida assinatura via `MP_WEBHOOK_SECRET`; `/api/payments/create-preference` é público mas só aceita `leadId` (UUID não adivinhável). Todos os endpoints temporários de diagnóstico já foram removidos do código.
- **"Portas abertas":** não se aplica — o site roda na Vercel (serverless), sem portas de rede tradicionais expostas; a única superfície são as rotas HTTPS listadas acima.
- **Histórico do Git:** os commits antigos marcados `TEMP:` continuam no histórico (visíveis no GitHub), mas só referenciam nomes de variáveis (`process.env.X`), nunca o valor real de nenhum segredo. Não foi reescrito (decisão consciente — reescrever histórico exigiria force-push, uma operação destrutiva, e não havia necessidade real já que nada sensível está exposto ali).

## Outras pendências / pontos em aberto

- **Parcelamento sem juros:** decisão tomada — a cliente optou por manter com juros. Copy do site já reflete isso (R$297 à vista / 5x de R$67,90 com juros). Nada pendente aqui.
- **Domínio próprio:** o site está só em `carol-fonseca.vercel.app` (sem domínio customizado). Se um domínio próprio for adicionado depois, nada no código precisa mudar (a origem é detectada dinamicamente pelos headers da requisição), mas vale um teste rápido pós-troca.
- Não há acesso a logs de runtime da Vercel (`get_runtime_logs`/`get_runtime_errors`) com a conta/token atual — retornam 403. Se precisar depurar erro de servidor no futuro, considerar checar isso primeiro ou usar `console.log` + reprodução manual.
