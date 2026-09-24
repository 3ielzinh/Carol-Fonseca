const params = new URLSearchParams(window.location.search);
const status = params.get('status') || params.get('collection_status') || '';

const copy = {
  approved: {
    title: 'Pagamento confirmado.',
    text: 'Obrigado por entrar na formação Nasce um Novo Líder. Em breve você recebe os próximos passos por e-mail e WhatsApp.'
  },
  pending: {
    title: 'Estamos confirmando seu pagamento.',
    text: 'Assim que a confirmação chegar do meio de pagamento escolhido, você recebe os próximos passos por e-mail e WhatsApp.'
  },
  in_process: {
    title: 'Estamos confirmando seu pagamento.',
    text: 'Assim que a confirmação chegar do meio de pagamento escolhido, você recebe os próximos passos por e-mail e WhatsApp.'
  },
  rejected: {
    title: 'Não conseguimos confirmar o pagamento.',
    text: 'O pagamento não foi aprovado. Volte ao site e tente novamente com outro cartão ou forma de pagamento.'
  },
  '': {
    title: 'Ainda não recebemos a confirmação do pagamento.',
    text: 'Se você concluiu o pagamento, aguarde alguns instantes. Se saiu do checkout sem pagar, pode voltar ao site e tentar novamente.'
  }
};

const selected = copy[status] || copy[''];
document.querySelector('#thankyou-title').textContent = selected.title;
document.querySelector('#thankyou-text').textContent = selected.text;

const whatsappButton = document.querySelector('#thankyou-whatsapp');
const leadId = params.get('lead');

if (leadId) {
  fetch(`/api/payments/group-link?lead=${encodeURIComponent(leadId)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.groupLink) {
        whatsappButton.href = data.groupLink;
        whatsappButton.hidden = false;
      }
    })
    .catch(() => {});
}

if (status === 'rejected' || status === '') {
  const backButton = document.querySelector('.thankyou-actions .button-dark');
  backButton.href = '/#precheckout';
  backButton.innerHTML = 'Tentar novamente <span>→</span>';
}
