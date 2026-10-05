/* G2G — шапка: Transparent → Solid после прокрутки, выпадающие меню, мобильное меню (≤1024).
   Молча ничего не делает, если шапки нет на странице. */
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const bar = header.querySelector('.site-header__bar');
  const burger = header.querySelector('.site-header__burger');
  const drawer = header.querySelector('.site-header__drawer');

  // ── Solid после прокрутки ───────────────────────────────────
  const SOLID_AT = 24;
  // Страницы без тёмного героя (17 Article): шапка Solid с самого верха — класс site-header--always-solid в разметке
  const always = header.classList.contains('site-header--always-solid');
  let solid = null;
  const syncSolid = () => {
    const next = always || window.scrollY > SOLID_AT || header.classList.contains('site-header--menu-open');
    if (next === solid) return;
    solid = next;
    header.classList.toggle('site-header--solid', next);
    if (bar) bar.classList.toggle('site-header__bar--solid', next);
  };
  syncSolid();
  window.addEventListener('scroll', syncSolid, { passive: true });

  // ── Выпадающие меню (Markets, Conditions) ───────────────────
  // Пункт остаётся ссылкой. Меню открывают наведение мыши (с короткой задержкой: не мигает, когда курсор
  // идёт мимо, и не закрывается на пути к нему) и кнопка-шеврон — клик, тап, клавиатура. Открытое кнопкой
  // держится, пока его не закроют: Escape, клик мимо, уход фокуса, другое меню.
  const OPEN_DELAY = 70;
  const CLOSE_DELAY = 180;
  const subs = [...header.querySelectorAll('.site-header__item--sub')]
    .map((item) => ({ item, toggle: item.querySelector('.site-header__sub-toggle'), pinned: false, timer: 0 }))
    .filter((sub) => sub.toggle);
  const isOpen = (sub) => sub.item.classList.contains('site-header__item--open');
  const setSub = (sub, open, pinned = false) => {
    clearTimeout(sub.timer);
    if (open) subs.forEach((other) => { if (other !== sub) setSub(other, false); });
    sub.pinned = open && pinned;
    sub.item.classList.toggle('site-header__item--open', open);
    sub.toggle.setAttribute('aria-expanded', String(open));
  };

  subs.forEach((sub) => {
    sub.item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(sub.timer);
      if (!isOpen(sub)) sub.timer = setTimeout(() => setSub(sub, true), OPEN_DELAY);
    });
    sub.item.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(sub.timer);
      if (isOpen(sub) && !sub.pinned) sub.timer = setTimeout(() => setSub(sub, false), CLOSE_DELAY);
    });
    sub.toggle.addEventListener('click', () => {
      // уже открыто наведением — клик закрепляет меню, а не закрывает его под курсором
      if (isOpen(sub) && !sub.pinned) sub.pinned = true;
      else setSub(sub, !isOpen(sub), true);
    });
    sub.item.addEventListener('focusout', (e) => {
      if (!sub.item.contains(e.relatedTarget)) setSub(sub, false);
    });
  });

  if (subs.length) {
    document.addEventListener('click', (e) => {
      subs.forEach((sub) => { if (isOpen(sub) && !sub.item.contains(e.target)) setSub(sub, false); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = subs.find(isOpen);
      if (!open) return;
      const focusInside = open.item.contains(document.activeElement);
      setSub(open, false);
      if (focusInside) open.toggle.focus();
    });
  }

  // ── Мобильное меню ──────────────────────────────────────────
  if (!burger || !drawer) return;

  // Очередь появления пунктов (CSS: transition-delay от --i); кнопки — последним шагом
  const steps = drawer.querySelectorAll('.site-header__drawer-item, .site-header__drawer-actions');
  steps.forEach((el, i) => el.style.setProperty('--i', i));

  // Подразделы Markets и Conditions: кнопка-шеврон раскрывает список; раздел текущей страницы раскрыт сразу
  drawer.querySelectorAll('.site-header__drawer-toggle').forEach((btn) => {
    const list = document.getElementById(btn.getAttribute('aria-controls'));
    if (!list) return;
    const setList = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('site-header__drawer-toggle--open', open);
      list.classList.toggle('site-header__drawer-sub--open', open);
    };
    if (list.querySelector('[aria-current="page"]')) setList(true);
    btn.addEventListener('click', () => setList(btn.getAttribute('aria-expanded') !== 'true'));
  });

  // Открытие и закрытие анимированы (components.css): hidden снимается до класса is-open,
  // чтобы переход стартовал с opacity 0, и ставится обратно, когда панель догасла.
  let hideTimer = 0;
  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    burger.classList.toggle('site-header__burger--open', open);
    header.classList.toggle('site-header--menu-open', open);
    document.body.classList.toggle('page--locked', open);
    clearTimeout(hideTimer);
    if (open) {
      drawer.hidden = false;
      drawer.getBoundingClientRect(); // зафиксировать стартовый кадр
      drawer.classList.add('is-open');
    } else {
      drawer.classList.remove('is-open');
      hideTimer = setTimeout(() => { drawer.hidden = true; }, 200);
    }
    syncSolid();
    if (open) {
      const first = drawer.querySelector('a');
      if (first) first.focus();
    }
  };

  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      burger.focus();
    }
  });

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  // Меню закрывается, если окно расширили до десктопа
  window.matchMedia('(min-width: 1025px)').addEventListener('change', (mq) => {
    if (mq.matches) setOpen(false);
  });
});
