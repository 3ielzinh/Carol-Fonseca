const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
const progressBar = document.querySelector('.scroll-progress span');
const hero = document.querySelector('.hero');
const skillStrip = document.querySelector('.skill-strip');
const skillToggle = document.querySelector('.skill-toggle');

document.querySelectorAll('section').forEach((section) => {
  section.querySelectorAll(':scope > .reveal, :scope > div > .reveal').forEach((item, index) => {
    item.style.setProperty('--reveal-delay', `${Math.min(index * 90, 270)}ms`);
  });
});

if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });
  reveals.forEach((item) => observer.observe(item));
} else {
  reveals.forEach((item) => item.classList.add('is-visible'));
}

requestAnimationFrame(() => document.body.classList.add('is-loaded'));

let scrollTicking = false;
const updateScrollEffects = () => {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
  progressBar?.style.setProperty('transform', `scaleX(${progress})`);
  scrollTicking = false;
};

window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(updateScrollEffects);
}, { passive: true });
updateScrollEffects();

skillToggle?.addEventListener('click', () => {
  const paused = skillStrip.classList.toggle('is-paused');
  skillToggle.setAttribute('aria-pressed', String(paused));
  skillToggle.querySelector('.sr-only').textContent = paused ? 'Retomar carrossel' : 'Pausar carrossel';
  skillToggle.querySelector('b').textContent = paused ? '▶' : 'Ⅱ';
});

if (hero && !reducedMotion && window.matchMedia('(hover: hover)').matches) {
  hero.addEventListener('pointermove', (event) => {
    const box = hero.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    hero.style.setProperty('--hero-x', x.toFixed(3));
    hero.style.setProperty('--hero-y', y.toFixed(3));
  });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--hero-x', 0);
    hero.style.setProperty('--hero-y', 0);
  });
}

document.querySelectorAll('.modules details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('.modules details').forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const precheckout = document.querySelector('#precheckout');
const leadForm = document.querySelector('#lead-form');
const closePrecheckout = document.querySelector('.precheckout-close');
const formStatus = document.querySelector('.form-status');
const phoneInput = leadForm?.elements.phone;
let lastCta = null;
let ctaSource = '';

const openPrecheckout = (trigger) => {
  if (!precheckout || typeof precheckout.showModal !== 'function') return;
  lastCta = trigger || document.activeElement;
  ctaSource = trigger?.textContent?.replace(/\s+/g, ' ').trim() || 'Acesso direto';
  precheckout.showModal();
  document.body.classList.add('has-dialog');
  requestAnimationFrame(() => leadForm?.elements.name?.focus());
};

const dismissPrecheckout = () => {
  if (!precheckout?.open) return;
  precheckout.close();
};

document.querySelectorAll('.purchase-cta').forEach((cta) => {
  cta.addEventListener('click', (event) => {
    event.preventDefault();
    openPrecheckout(cta);
  });
});

closePrecheckout?.addEventListener('click', dismissPrecheckout);
precheckout?.addEventListener('click', (event) => {
  if (event.target === precheckout) dismissPrecheckout();
});
precheckout?.addEventListener('close', () => {
  document.body.classList.remove('has-dialog');
  lastCta?.focus();
});

if (window.location.hash === '#precheckout') openPrecheckout();

phoneInput?.addEventListener('input', () => {
  const digits = phoneInput.value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) phoneInput.value = digits;
  else if (digits.length <= 6) phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  else if (digits.length <= 10) phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  else phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
});

leadForm?.querySelectorAll('input, select').forEach((field) => {
  field.addEventListener('invalid', () => field.setAttribute('aria-invalid', 'true'));
  field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
  field.addEventListener('change', () => field.removeAttribute('aria-invalid'));
});

leadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  const phoneDigits = phoneInput.value.replace(/\D/g, '');
  phoneInput.setCustomValidity(phoneDigits.length < 10 ? 'Informe um WhatsApp válido com DDD.' : '');
  if (!leadForm.reportValidity()) return;

  const submitButton = leadForm.querySelector('.submit-lead');
  const originalLabel = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = 'Salvando seus dados…';

  const values = Object.fromEntries(new FormData(leadForm));
  const params = new URLSearchParams(window.location.search);
  const payload = {
    name: values.name.trim(),
    phone: phoneDigits,
    email: values.email.trim().toLowerCase(),
    jobTitle: values.jobTitle.trim(),
    consent: values.consent === 'on',
    website: values.website,
    sourceCta: ctaSource,
    pageUrl: window.location.href,
    referrer: document.referrer,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmContent: params.get('utm_content') || '',
    utmTerm: params.get('utm_term') || ''
  };

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar seus dados agora.');

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'generate_lead',
      lead_id: result.id,
      source_cta: payload.sourceCta
    });

    formStatus.textContent = 'Dados salvos. Abrindo o checkout seguro para concluir o pagamento…';
    formStatus.classList.add('is-success');
    sessionStorage.setItem('carol_lead_id', result.id);
    setTimeout(() => {
      window.location.href = 'https://checkout.nubank.com.br/23cglllPWO189n1l';
    }, 500);
  } catch (error) {
    formStatus.textContent = `${error.message} Tente novamente em instantes.`;
    formStatus.classList.add('is-error');
    submitButton.disabled = false;
    submitButton.innerHTML = originalLabel;
  }
});
