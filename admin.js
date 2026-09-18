const loginView = document.querySelector('#login-view');
const panelView = document.querySelector('#panel-view');
const logoutButton = document.querySelector('#logout-button');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const panelError = document.querySelector('#panel-error');
const panelStatus = document.querySelector('#panel-status');
const leadsBody = document.querySelector('#leads-body');
const emptyState = document.querySelector('#empty-state');
const prevPageButton = document.querySelector('#prev-page');
const nextPageButton = document.querySelector('#next-page');
const pageInfo = document.querySelector('#page-info');

let currentPage = 0;
let pageSize = 25;
let total = 0;

const formatDate = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatPhone = (digits) => {
  const value = String(digits || '').replace(/\D/g, '');
  if (value.length < 10) return digits || '—';
  const ddd = value.slice(0, 2);
  const rest = value.slice(2);
  return rest.length > 8
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
};

function showLogin(message) {
  panelView.hidden = true;
  logoutButton.hidden = true;
  loginView.hidden = false;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
}

function showPanel() {
  loginView.hidden = true;
  logoutButton.hidden = false;
  panelView.hidden = false;
}

function renderLeads(leads) {
  leadsBody.innerHTML = '';
  emptyState.hidden = leads.length > 0;

  leads.forEach((lead) => {
    const row = document.createElement('tr');
    const isPaid = lead.paymentStatus === 'paid';

    row.innerHTML = `
      <td>${lead.name || '—'}</td>
      <td>${formatPhone(lead.phone)}</td>
      <td>${lead.email || '—'}</td>
      <td>${lead.jobTitle || '—'}</td>
      <td>${formatDate(lead.createdAt)}</td>
      <td>
        <span class="status-badge ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Pago' : 'Aguardando'}</span>
        <button class="toggle-payment" data-id="${lead.id}" data-next="${isPaid ? 'pending' : 'paid'}">
          ${isPaid ? 'Reverter' : 'Marcar pago'}
        </button>
      </td>
    `;
    leadsBody.appendChild(row);
  });
}

function updatePagination() {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  pageInfo.textContent = `Página ${currentPage + 1} de ${totalPages}`;
  prevPageButton.disabled = currentPage <= 0;
  nextPageButton.disabled = currentPage >= totalPages - 1;
}

async function loadLeads(page = 0) {
  panelError.hidden = true;
  panelStatus.textContent = 'Carregando…';

  const response = await fetch(`/api/admin/leads?page=${page}`);
  if (response.status === 401) {
    showLogin();
    return;
  }
  if (!response.ok) {
    panelStatus.textContent = '';
    panelError.textContent = 'Não foi possível carregar os leads agora.';
    panelError.hidden = false;
    return;
  }

  const data = await response.json();
  currentPage = data.page ?? page;
  pageSize = data.pageSize ?? pageSize;
  total = data.total ?? data.leads.length;

  showPanel();
  panelStatus.textContent = `${total} pré-checkout${total === 1 ? '' : 's'} no total`;
  renderLeads(data.leads);
  updatePagination();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  const password = loginForm.elements.password.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      loginError.textContent = result.error || 'Não foi possível entrar agora.';
      loginError.hidden = false;
      return;
    }

    loginForm.reset();
    await loadLeads(0);
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

leadsBody.addEventListener('click', async (event) => {
  const button = event.target.closest('.toggle-payment');
  if (!button) return;

  button.disabled = true;
  try {
    const response = await fetch('/api/admin/leads/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: button.dataset.id, status: button.dataset.next })
    });
    if (response.status === 401) {
      showLogin();
      return;
    }
    if (!response.ok) throw new Error('Falha ao atualizar o status.');
    await loadLeads(currentPage);
  } catch {
    panelError.textContent = 'Não foi possível atualizar o pagamento agora.';
    panelError.hidden = false;
    button.disabled = false;
  }
});

prevPageButton.addEventListener('click', () => {
  if (currentPage > 0) loadLeads(currentPage - 1);
});
nextPageButton.addEventListener('click', () => {
  loadLeads(currentPage + 1);
});

loadLeads(0);
