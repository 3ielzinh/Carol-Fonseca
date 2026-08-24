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
