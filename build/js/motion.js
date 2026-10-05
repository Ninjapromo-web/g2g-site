/* Анимации при входе в экран. [data-inview]: до входа — класс is-waiting (CSS держит анимации
   внутри на паузе, на первом кадре), при появлении на 25% — is-inview, один раз.
   Без IntersectionObserver или без этого скрипта классы не ставятся — анимации идут сразу,
   контент не прячется. Первый потребитель — визуалы Why G2G (главная). */
(function () {
  var els = document.querySelectorAll('[data-inview]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('is-waiting');
      entry.target.classList.add('is-inview');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.25 });
  els.forEach(function (el) {
    el.classList.add('is-waiting');
    io.observe(el);
  });
})();
