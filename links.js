document.querySelectorAll('[data-link-name]').forEach((link) => {
  link.addEventListener('click', () => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'link_in_bio_click',
      link_name: link.dataset.linkName,
      link_url: link.href
    });
  });
});
