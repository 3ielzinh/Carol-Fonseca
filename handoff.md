# Handoff — Integração Mercado Pago

Última atualização: 2026-09-23.

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

## Limpeza já feita

- `api/payments/test-preference.js` (endpoint temporário de diagnóstico) — **removido**.
- Desvio `?testpay=` no `script.js` — **removido**, formulário sempre usa `create-preference.js` normalmente.

## ⚠️ Pendência de limpeza

A env var `TEST_PAYMENT_SECRET` ainda existe no projeto na Vercel, mas não é mais referenciada em nenhum código — está inofensiva, porém solta. **Remover manualmente** em Vercel → projeto `carol-fonseca` → Settings → Environment Variables (não há endpoint de delete disponível via API neste momento).

Há também alguns leads de teste soltos no Redis de produção (`Teste Integracao`, `Teste webhook (1 centavo)`, alguns `test-onecent-*`, e o lead real de R$5 usado no teste final) — aparecem no painel admin, sem endpoint de exclusão hoje. Podem ser ignorados ou removidos manualmente via Redis se incomodar.

## Outras pendências / pontos em aberto

- **Parcelamento sem juros:** o site anuncia "5x de R$59,40 sem juros". Isso depende de configuração na própria conta Mercado Pago da cliente (não é algo que o código garanta sozinho) — nunca foi confirmado com ela se está configurado.
- **Domínio próprio:** o site está só em `carol-fonseca.vercel.app` (sem domínio customizado). Se um domínio próprio for adicionado depois, nada no código precisa mudar (a origem é detectada dinamicamente pelos headers da requisição), mas vale um teste rápido pós-troca.
- Não há acesso a logs de runtime da Vercel (`get_runtime_logs`/`get_runtime_errors`) com a conta/token atual — retornam 403. Se precisar depurar erro de servidor no futuro, considerar checar isso primeiro ou usar `console.log` + reprodução manual.
