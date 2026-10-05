/* G2G India landing — поведение. В Elementor — Custom Code (body end) этой страницы.
   Перенос скриптов Webflow-лендинга: шапка после прокрутки, Lottie-бургер, три переключателя.
   Контент состояний (кадры шагов, описания рынков) лежит в разметке отдельными виджетами —
   маркетологи правят их в панели, скрипт только переключает класс is-active. */
(function () {
  'use strict';

  var doc = document;
  var header = doc.querySelector('.site-header');

  // 1. Solid header once the page is scrolled: over white sections the near-transparent
  //    default made the white logo and links vanish.
  if (header) {
    var syncScrolled = function () { header.classList.toggle('is-scrolled', window.scrollY > 40); };
    syncScrolled();
    window.addEventListener('scroll', syncScrolled, { passive: true });
  }

  // 2. Mobile menu (≤1024) with the Lottie burger. The file is a full loop —
  //    burger (0-7) → cross (7-14) → burger (14-28) — so the cross sits at frame 14:
  //    open plays 0→14, close plays 14→0.
  var burger = doc.querySelector('.site-header__burger');
  var nav = doc.getElementById('site-nav');
  if (header && burger && nav) {
    var OPEN_FRAME = 14;
    var anim = null;
    var iconBox = burger.querySelector('[data-lottie]');

    var setOpen = function (open) {
      header.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (anim) {
        anim.setDirection(open ? 1 : -1);
        anim.playSegments(open ? [0, OPEN_FRAME] : [OPEN_FRAME, 0], true);
      }
    };

    burger.addEventListener('click', function () {
      setOpen(!header.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    window.matchMedia('(min-width: 1025px)').addEventListener('change', function (mq) {
      if (mq.matches) setOpen(false);
    });

    // lottie_light loads with defer; the static icon stays if it is missing
    window.addEventListener('load', function () {
      if (!window.lottie || !iconBox) return;
      anim = window.lottie.loadAnimation({
        container: iconBox, renderer: 'svg', loop: false, autoplay: false,
        path: iconBox.getAttribute('data-lottie')
      });
      anim.addEventListener('DOMLoaded', function () {
        var fallback = iconBox.querySelector('.site-header__burger-fallback');
        if (fallback) fallback.remove();
      });
    });
  }

  // 3. Switchers: [data-tabs="name"] holds [data-tab] items, optional
  //    [data-tabs-panels="name"] holds [data-panel] items in the same order.
  //    Click (and hover, with data-tabs-hover) makes item N and panel N active.
  doc.querySelectorAll('[data-tabs]').forEach(function (group) {
    var name = group.getAttribute('data-tabs');
    var tabs = group.querySelectorAll('[data-tab]');
    var panelBox = doc.querySelector('[data-tabs-panels="' + name + '"]');
    var panels = panelBox ? panelBox.querySelectorAll('[data-panel]') : [];

    var select = function (index) {
      tabs.forEach(function (t, i) {
        var on = i === index;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-pressed', String(on));
      });
      panels.forEach(function (p, i) { p.classList.toggle('is-active', i === index); });
    };

    tabs.forEach(function (tab, index) {
      tab.setAttribute('tabindex', '0');
      tab.setAttribute('role', 'button');
      tab.setAttribute('aria-pressed', String(tab.classList.contains('is-active')));
      tab.addEventListener('click', function () { select(index); });   // touch never hovers
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(index); }
      });
      if (group.hasAttribute('data-tabs-hover')) {
        tab.addEventListener('mouseenter', function () { select(index); });
        tab.addEventListener('focus', function () { select(index); });
      }
    });
  });
})();
