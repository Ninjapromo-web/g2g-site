/* Вкладки (09 Platform — переключатель MT5 6798:9926; главная — Why G2G 6608:16833 и How it works 6483:15771).
   Контейнер [data-widget="tabs"]: вкладки role="tab" с aria-controls, панели role="tabpanel" (где угодно на странице).
   Класс активной вкладки — из data-active-class контейнера (БЭМ-модификатор, markup-rules п. 17).
   Клавиатура: стрелки, Home/End. Нет контейнера на странице — скрипт ничего не делает.
   Режимы (атрибуты контейнера):
   - data-tabs-hover — на устройствах с мышью вкладка выбирается наведением; тап и клик работают всегда.
     Выбранная остаётся выбранной, когда курсор ушёл;
   - data-tabs-scroll="<медиазапрос>" + data-tabs-pin="<селектор>" — пока медиазапрос выполняется (мобильный),
     вкладку выбирает прокрутка: закреплённый (sticky) блок панелей «доезжает» до карточек, и активна первая,
     что видна под ним больше чем наполовину — предыдущая уже ушла под блок. Тап и клавиатура докручивают
     карточку вплотную под блок (фидбек 25.09);
   - data-panels="fade" — панели не прячутся атрибутом hidden, а получают класс из data-panel-active-class:
     смену (наплыв, «сборку» визуала) рисует CSS. Неактивные панели CSS скрывает visibility —
     они недоступны и скринридеру;
   - data-tabs-accordion="<медиазапрос>" — пока медиазапрос выполняется (вкладки столбиком, 09 Platform ≤767),
     панель стоит сразу под своей вкладкой (раскладку делает CSS) и раскрывается из неё: высота растёт от 0,
     содержимое проявляется — как ответ FAQ (js/faq.js). Прежняя панель закрывается сразу, а выбранная
     вкладка остаётся на том же месте экрана: без этого панель, закрывшаяся выше, утянула бы её из-под пальца.
     Наведение в этом режиме вкладку не выбирает (правка пользователя 02.10). */
(function () {
  var mouse = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var EASE_OPEN = 'cubic-bezier(0.22, 1, 0.36, 1)'; // как у FAQ
  var HOVER_DELAY = 60;   // мс: курсор, проходящий через карточку по пути к соседней, её не выбирает
  var SCROLL_LOCK = 900;  // мс: пока докручиваем к вкладке, прокрутка не перевыбирает промежуточные
  var PIN_GAP = 12;       // px: зазор между закреплённым блоком и карточкой, докрученной тапом

  document.querySelectorAll('[data-widget="tabs"]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    var activeClass = root.getAttribute('data-active-class') || 'is-active';
    var fade = root.getAttribute('data-panels') === 'fade';
    var panelClass = root.getAttribute('data-panel-active-class') || 'is-active';
    var scrollQuery = root.getAttribute('data-tabs-scroll');
    var scrollMode = scrollQuery && window.matchMedia ? window.matchMedia(scrollQuery) : null;
    var pin = root.getAttribute('data-tabs-pin') ? root.querySelector(root.getAttribute('data-tabs-pin')) : null;
    var foldQuery = root.getAttribute('data-tabs-accordion');
    var foldMode = foldQuery && window.matchMedia ? window.matchMedia(foldQuery) : null;
    var current = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    var lockUntil = 0;
    var unfolding = [];

    function select(tab) {
      if (tab === current) return; // повторный выбор не перезапускает анимации панели
      current = tab;
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle(activeClass, on);
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        if (fade) panel.classList.toggle(panelClass, on);
        else panel.hidden = !on;
      });
    }

    function scrolling() { return scrollMode && scrollMode.matches; }
    function folding() { return foldMode && foldMode.matches; }

    // Раскрытие панели под вкладкой: высота и поля растут от 0, содержимое проявляется чуть позже
    function unfold(panel, height) {
      unfolding.forEach(function (a) { a.cancel(); });
      unfolding = [];
      if (!panel.animate || (calm && calm.matches)) return;
      var cs = getComputedStyle(panel);
      var box = panel.animate([
        { height: '0px', paddingTop: '0px', paddingBottom: '0px' },
        { height: height + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom }
      ], { duration: 420, easing: EASE_OPEN });
      panel.style.overflow = 'hidden';
      box.onfinish = box.oncancel = function () { panel.style.overflow = ''; };
      unfolding.push(box);
      Array.prototype.forEach.call(panel.children, function (child) {
        unfolding.push(child.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 350, delay: 70, easing: EASE_OPEN, fill: 'backwards' }
        ));
      });
    }

    // Выбор в режиме аккордеона: вкладка остаётся там же на экране, её панель раскрывается под ней.
    // Панель, которая не помещается до низа экрана, докручивается в него — но вкладка не уходит под шапку,
    // а вкладка, выбранная наполовину под шапкой, выезжает из-под неё.
    // Запас снизу (кнопка WhatsApp) — scroll-margin-bottom панели, сверху — scroll-padding-top страницы.
    function fold(tab) {
      if (tab === current) return;
      var top = tab.getBoundingClientRect().top;
      select(tab);
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      var y = window.scrollY + tab.getBoundingClientRect().top - top;
      window.scrollTo({ top: y, behavior: 'instant' });
      if (!panel) return;
      var box = panel.getBoundingClientRect();
      var over = box.bottom + (parseFloat(getComputedStyle(panel).scrollMarginBottom) || 0) - window.innerHeight;
      var room = top - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
      unfold(panel, box.height);
      var move = room < 0 ? room : over > 0 ? Math.min(over, room) : 0; // вкладка под шапкой — вывести из-под неё
      if (move) window.scrollTo({ top: y + move, behavior: calm && calm.matches ? 'auto' : 'smooth' });
    }

    // Низ закреплённого блока в координатах экрана, когда он прилип: его sticky top + высота
    function edge() {
      return pin ? (parseFloat(getComputedStyle(pin).top) || 0) + pin.offsetHeight : 0;
    }

    // Выбор пользователем (тап, клик, клавиатура). В режиме прокрутки — ещё и докрутка под блок
    function choose(tab, focus) {
      if (folding()) {
        fold(tab);
        if (focus) tab.focus();
        return;
      }
      select(tab);
      if (scrolling()) {
        lockUntil = Date.now() + SCROLL_LOCK;
        if (focus) tab.focus({ preventScroll: true });
        window.scrollTo({
          top: window.scrollY + tab.getBoundingClientRect().top - edge() - PIN_GAP,
          behavior: calm && calm.matches ? 'auto' : 'smooth'
        });
      } else if (focus) {
        tab.focus();
      }
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { choose(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var n = tabs.length, j = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j !== null) {
          e.preventDefault();
          choose(tabs[j], true);
        }
      });
    });

    if (root.hasAttribute('data-tabs-hover')) {
      var timer = null;
      tabs.forEach(function (tab) {
        tab.addEventListener('mouseenter', function () {
          if (!mouse || !mouse.matches || scrolling() || folding()) return;
          clearTimeout(timer);
          timer = setTimeout(function () { select(tab); }, HOVER_DELAY);
        });
        tab.addEventListener('mouseleave', function () { clearTimeout(timer); });
      });
    }

    if (scrollMode) {
      var ticking = false;
      var sync = function () {
        ticking = false;
        if (!scrolling() || Date.now() < lockUntil) return;
        var box = root.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return; // секция не на экране — не трогаем
        var y = edge(), pick = tabs[tabs.length - 1];
        for (var i = 0; i < tabs.length; i++) {
          var r = tabs[i].getBoundingClientRect();
          if ((r.top + r.bottom) / 2 > y) { pick = tabs[i]; break; } // больше половины видно под блоком
        }
        select(pick);
      };
      var request = function () {
        if (!ticking) { ticking = true; window.requestAnimationFrame(sync); }
      };
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request);
    }
  });
})();
