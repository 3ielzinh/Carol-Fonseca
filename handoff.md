# Handoff — Integração Mercado Pago

Última atualização: 2026-09-22. Repositório sincronizado com `origin/main` no commit `4916818`.

## O que foi construído

Substituição do link fixo de pagamento da Nubank por checkout real via **Mercado Pago (Checkout Pro)**, com confirmação automática de pagamento.

- `api/payments/create-preference.js` — recebe `leadId`, busca o lead (Redis ou local), cria a preferência de pagamento no Mercado Pago (R$297, até 5x) e devolve o link de checkout.
- `api/payments/webhook.js` — recebe a notificação do Mercado Pago, consulta o pagamento pela API, valida a assinatura (`MP_WEBHOOK_SECRET`, se configurada) e atualiza `paymentStatus` do lead para `paid` automaticamente.
- `obrigado.html` + `obrigado.js` — tela de agradecimento pós-checkout, com mensagem diferente conforme `status` (aprovado/pendente/recusado).
- `script.js` — trocado o redirect fixo da Nubank pela chamada a `create-preference` + redirect para o `initPoint` retornado.
- `scripts/dev-server.js`, `.env.example`, `README.md` — atualizados para rodar/documentar o fluxo novo localmente.
- `api/admin/leads/payment.js` — `setLocalPaymentStatus`/`paymentsPathFor` exportados para reuso pelo webhook (modo dev local).

Painel admin (`/admin`) continua como fallback manual de correção de status, sem alterações de fluxo.

## Configuração em produção (Vercel — projeto `carol-fonseca`)

Já configurado e deployado:
- `MP_ACCESS_TOKEN` — Access Token de produção, compartilhado pela cliente via "Suas integrações" do Mercado Pago Developers.
- `MP_WEBHOOK_SECRET` — chave secreta do webhook registrado no painel do Mercado Pago (`https://carol-fonseca.vercel.app/api/payments/webhook`, evento "Pagamentos").

Confirmado por teste direto: o token é válido, é de **produção** (não sandbox), coletor `302684579`, `siteId: MLB`.

## ⚠️ Pendência ativa — teste de pagamento real ainda não validado

Objetivo: confirmar que o webhook realmente marca um lead como `paid` sozinho, sem gerar o R$0,01 de qualquer jeito relevante pro negócio.

**O que já se tentou e por que falhou (nenhum é bug de código):**
1. A própria cliente tentou pagar o link de teste → Mercado Pago bloqueia pagamento onde comprador e vendedor são a mesma conta ("Você não pode pagar para si mesmo").
2. O dev (Gabriel) tentou pagar → está logado como **colaborador** da conta dela no Mercado Pago → erro "Sua conta de colaborador ainda não pode fazer pagamentos".
3. Tentativa em aba anônima de verdade no celular → mesmo erro de colaborador persistiu, suspeita de que o app nativo do Mercado Pago (instalado no celular, já logado) intercepta o link via deep link do sistema operacional, ignorando o modo anônimo do navegador.

**Próximo passo sugerido:** testar o pagamento a partir de um **computador** (sem o app nativo do Mercado Pago instalado), em aba anônima, ou com alguém sem nenhuma relação com a conta da cliente (não ela, não colaborador).

## Endpoint temporário de diagnóstico — REMOVER depois do teste

`api/payments/test-preference.js` foi criado só para diagnosticar esse problema, protegido por header `x-test-secret` (variável `TEST_PAYMENT_SECRET` no Vercel, sensível). Ele:
- `POST` — cria uma preferência de R$0,01 e um lead de teste (`test-onecent-*`) no Redis de produção.
- `GET ?leadId=...` / `?preferenceId=...` / `?date=YYYY-MM-DD` — consulta status no Redis e direto na API do Mercado Pago (payments/search, merchant_orders/search, users/me).

**Quando o teste de pagamento for validado com sucesso:**
1. Apagar `api/payments/test-preference.js`.
2. Remover a env var `TEST_PAYMENT_SECRET` do projeto na Vercel.
3. Commitar e subir a limpeza.

Há também alguns leads de teste soltos no Redis de produção (`Teste Integracao`, `Teste webhook (1 centavo)`, alguns `test-onecent-*`) — aparecem como pendentes no painel admin, sem endpoint de exclusão hoje. Podem ser ignorados ou removidos manualmente via Redis se incomodar.

## Outras pendências / pontos em aberto

- **Parcelamento sem juros:** o site anuncia "5x de R$59,40 sem juros". Isso depende de configuração na própria conta Mercado Pago da cliente (não é algo que o código garanta sozinho) — nunca foi confirmado com ela se está configurado.
- **Domínio próprio:** o site está só em `carol-fonseca.vercel.app` (sem domínio customizado). Se um domínio próprio for adicionado depois, nada no código precisa mudar (a origem é detectada dinamicamente pelos headers da requisição), mas vale um teste rápido pós-troca.
- Acesso à Vercel e ao Mercado Pago Developers já validado nesta sessão (envs corretas, projeto `prj_JTxHrXJPBEwVWjCV4wXcszPmFeJj`, time `team_ELgLl421q1uJf9Lobe8OAvhA`).
- Não há acesso a logs de runtime da Vercel (`get_runtime_logs`/`get_runtime_errors`) com a conta/token atual — retornam 403. Se precisar depurar erro de servidor no futuro, considerar checar isso primeiro ou usar `console.log` + reprodução manual como foi feito aqui.
