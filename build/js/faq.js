/* G2G — FAQ: плавное раскрытие ответа (29.09, просьба клиента).
   <details> остаётся нативным: без JS и при prefers-reduced-motion открывается мгновенно, как раньше.
   С JS клик по вопросу перехватывается:
   - открытие: высота ответа растёт от 0 (420 мс, мягкое торможение), текст проявляется
     с подъёмом на 10px чуть позже высоты — «вырастает» из строки вопроса;
   - закрытие короче (300 мс): уходящее не должно задерживать; текст гаснет в первой трети;
   - иконка: «+» поворачивается на 45° в «×» (у тёмных карточек шеврон — на 180°). Поворот
     идёт по классу is-open, который ставится сразу по клику, а не по [open] — тот при закрытии
     снимается только в конце анимации;
   - клик посреди анимации разворачивает её с текущего места, без рывка.
   Elementor: виджет Accordion/FAQ со своей анимацией или CUSTOM-JS (SECTIONS.md, «FAQ»). */
(function () {
  var items = document.querySelectorAll('details.faq-item');
  if (!items.length || !('animate' in Element.prototype)) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE_OPEN = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var EASE_CLOSE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  items.forEach(function (item) {
    var summary = item.querySelector('summary');
    var answer = item.querySelector('.faq-item__answer');
    if (!summary || !answer) return;

    item.classList.add('faq-item--js');
    item.classList.toggle('is-open', item.open);
    var state = item.open ? 'open' : 'closed'; // open | closed | opening | closing
    var box = null;
    var text = null;

    function settle() {
      if (state === 'closing') item.open = false; // в том же кадре, что и снятие анимации — без вспышки
      state = item.open ? 'open' : 'closed';
      box.cancel();
      text.cancel();
      box = text = null;
      answer.style.overflow = '';
    }

    function run(opening) {
      // отступ ответа от вопроса тоже растёт с 0, иначе строка прыгнет на 14px в начале
      var margin = getComputedStyle(answer).marginTop;
      if (opening) item.open = true;
      var height = answer.getBoundingClientRect().height + 'px';
      var shut = { height: '0px', marginTop: '0px' };
      var full = { height: height, marginTop: margin };

      answer.style.overflow = 'hidden';
      state = opening ? 'opening' : 'closing';
      box = answer.animate(opening ? [shut, full] : [full, shut], {
        duration: opening ? 420 : 300,
        easing: opening ? EASE_OPEN : EASE_CLOSE,
        fill: 'forwards',
      });
      text = answer.animate(opening
        ? [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 1 }, { opacity: 0 }], {
        duration: opening ? 350 : 120,
        delay: opening ? 70 : 0,
        easing: opening ? EASE_OPEN : 'ease-in',
        fill: 'both',
      });
      box.onfinish = settle;
    }

    summary.addEventListener('click', function (e) {
      if (reduce.matches) return; // нативно; класс поправит событие toggle
      e.preventDefault();
      if (state === 'opening' || state === 'closing') {
        state = state === 'opening' ? 'closing' : 'opening';
        item.classList.toggle('is-open', state === 'opening');
        box.reverse();
        text.reverse();
        return;
      }
      var opening = state === 'closed';
      item.classList.toggle('is-open', opening);
      run(opening);
    });

    // Открытие не кликом (поиск по странице раскрывает <details>, reduced-motion) — сверить состояние
    item.addEventListener('toggle', function () {
      if (state === 'opening' || state === 'closing') return;
      state = item.open ? 'open' : 'closed';
      item.classList.toggle('is-open', item.open);
    });
  });
})();
