/* G2G — наезд секций со скруглённым верхом (29.09, просьба клиента: сдержанная анимация).
   Секция со скруглённым верхом не уезжает при прокрутке вместе с предыдущей, а наезжает на неё:
   предыдущая проезжает чуть выше низа экрана и останавливается (position: sticky), следующая
   поднимается поверх, остановившаяся уходит в тень по мере того, как её закрывают.

   Как устроено:
   - пара «нижняя + верхняя» оборачивается в div.stack. Обёртка ограничивает липкость: когда
     верхняя секция кончилась, нижняя уезжает вместе с ней, а не висит под всей страницей;
   - нижняя получает sticky и top = min(0, 100svh − её высота − запас) (--stack-h, держит ResizeObserver):
     высокая останавливается не у низа экрана, а выше на «запас», короткая — верхом у верха. Ни одна
     строка не уходит под верхнюю непрочитанной, длина страницы не меняется;
   - запас (правка пользователя 29.09: «выезжают раньше, чем нужно, — закрывают CTA у стыка»):
     не меньше четверти экрана, а если у низа нижней секции есть кнопка или ссылка-стрелка —
     столько, чтобы к остановке она доехала до середины экрана (--stack-cta — от низа секции
     до низа последней кнопки; формула в base.css, «Наезд секций»);
   - тень — div.stack__shade внутри нижней: непрозрачность = доля её видимой части, которую уже
     закрыла верхняя (t^1.6 × SHADE_MAX); пересчёт — раз в кадр прокрутки;
   - подвал наезжает на всю <main> (обёртка не нужна — липкость main ограничивает body).
     Где на подвал заходит стеклянная CTA (.site-footer--cta), подвал не наезжает: закрыл бы её низ.
   Без JS, без ResizeObserver и при prefers-reduced-motion — обычная прокрутка.
   Elementor: CUSTOM — контейнер-обёртка пары + CSS sticky + этот скрипт (SECTIONS.md, «Наезд секций»). */
(function () {
  if (!('ResizeObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var COVERS = 'main > .edge-round-top, main > .faq--dark, main > .page-cta--dark,' +
    ' body > .site-footer.edge-round-top:not(.site-footer--cta)';
  var SHADE_MAX = 0.45;

  var pairs = [];
  document.querySelectorAll(COVERS).forEach(function (cover) {
    var under = cover.previousElementSibling;
    if (!under || under.classList.contains('stack-cover')) return; // две верхние подряд — не бывает, не вкладываем

    if (under.tagName !== 'MAIN') {
      var wrap = document.createElement('div');
      wrap.className = 'stack';
      under.parentNode.insertBefore(wrap, under);
      wrap.appendChild(under);
      wrap.appendChild(cover);
    }
    var shade = document.createElement('div');
    shade.className = 'stack__shade';
    shade.setAttribute('aria-hidden', 'true');
    under.appendChild(shade);
    cover.classList.add('stack-cover');
    pairs.push({ under: under, cover: cover, shade: shade, opacity: '0' });
  });
  if (!pairs.length) return;

  // Высота нижней и место её последней кнопки → top. Класс ставится после первого замера:
  // без --stack-h top был бы 0, и высокая секция остановилась бы верхом, пряча свой низ.
  var CTA = '.btn, .link-arrow';
  function measure(el) {
    var box = el.getBoundingClientRect();
    var lowest = -Infinity;
    el.querySelectorAll(CTA).forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (r.height && r.bottom > lowest) lowest = r.bottom; // скрытые на этой ширине (height 0) — мимо
    });
    el.style.setProperty('--stack-h', el.offsetHeight + 'px');
    if (lowest > -Infinity) el.style.setProperty('--stack-cta', Math.round(box.bottom - lowest) + 'px');
    else el.style.removeProperty('--stack-cta');
    el.classList.add('stack-under');
  }
  var ro = new ResizeObserver(function (entries) {
    entries.forEach(function (entry) { measure(entry.target); });
    schedule();
  });
  pairs.forEach(function (p) { ro.observe(p.under); });

  // Тень пересчитывается каждый кадр прокрутки для всех пар, а не только для видимых: пар на
  // странице 1–3, это до 6 замеров. Отслеживать «пара в экране» через IntersectionObserver
  // нельзя — прыжок прокрутки (Home, якорь наверх) переносит верхнюю секцию из-над экрана
  // под экран без пересечения, событие не приходит, и тень оставалась лежать на секции.
  function paint(pair, t) {
    // нарастает нелинейно: пока верхняя только показалась, тени почти нет, к концу — густеет
    // (линейная на белой секции уже на трети пути давала серую вуаль)
    var o = (Math.pow(t, 1.6) * SHADE_MAX).toFixed(3);
    if (o === pair.opacity) return;
    pair.opacity = o;
    pair.shade.style.opacity = o;
  }

  var ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    ticking = false;
    // сначала все замеры, потом все записи — без принудительных перерасчётов раскладки
    var t = pairs.map(function (p) {
      var under = p.under.getBoundingClientRect();
      var covered = under.bottom - p.cover.getBoundingClientRect().top; // сколько нижней уже под верхней
      var visible = under.bottom - Math.max(under.top, 0); // видимая часть остановившейся (над запасом)
      return visible > 0 ? Math.min(Math.max(covered / visible, 0), 1) : 1;
    });
    pairs.forEach(function (p, i) { paint(p, t[i]); });
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () {
    pairs.forEach(function (p) { measure(p.under); }); // кнопка могла переехать без смены высоты секции
    schedule();
  });
})();
