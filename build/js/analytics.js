/* G2G — разметка CTA для GTM/GA4 (ТЗ §4, markup-rules.md п. 18).
   1) Клик по элементу с data-event → dataLayer.push({event, placement}).
   2) UTM-метки из адреса страницы дописываются к ссылкам на портал,
      чтобы они доходили до регистрации. */
document.addEventListener('DOMContentLoaded', () => {
  window.dataLayer = window.dataLayer || [];

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-event]');
    if (!el) return;
    window.dataLayer.push({
      event: el.dataset.event,
      placement: el.dataset.placement || '',
      link_url: el.getAttribute('href') || '',
    });
  });

  const PORTAL = 'portal.g2ggroup.com';
  const params = new URLSearchParams(window.location.search);
  const utm = [...params].filter(([key]) => key.startsWith('utm_') || key === 'gclid' || key === 'fbclid');
  if (!utm.length) return;

  document.querySelectorAll(`a[href*="${PORTAL}"]`).forEach((link) => {
    const url = new URL(link.href);
    utm.forEach(([key, value]) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    link.href = url.toString();
  });
});
