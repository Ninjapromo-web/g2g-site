/* Лента карточек со стрелками (09 Platform, Markets 6110:3730).
   Контейнер [data-widget="carousel"]: лента [data-carousel-track] (нативная прокрутка + scroll-snap),
   кнопки [data-carousel-prev] / [data-carousel-next] листают на карточку; у края ленты кнопка disabled.
   Нет контейнера на странице — скрипт ничего не делает. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-widget="carousel"]').forEach(function (root) {
    var track = root.querySelector('[data-carousel-track]');
    var prev = root.querySelector('[data-carousel-prev]');
    var next = root.querySelector('[data-carousel-next]');
    if (!track || !prev || !next) return;

    function step() {
      var card = track.firstElementChild;
      if (!card) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    }
    function update() {
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
    }
    function go(dir) {
      track.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' });
    }

    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
})();
