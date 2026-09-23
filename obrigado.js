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
  }
};

const selected = copy[status] || copy.approved;
document.querySelector('#thankyou-title').textContent = selected.title;
document.querySelector('#thankyou-text').textContent = selected.text;

const isApproved = !status || status === 'approved';
document.querySelector('#thankyou-whatsapp').hidden = !isApproved;

if (status === 'rejected') {
  const backButton = document.querySelector('.thankyou-actions .button-dark');
  backButton.href = '/#precheckout';
  backButton.innerHTML = 'Tentar novamente <span>→</span>';
}
