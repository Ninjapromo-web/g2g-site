/* G2G — оглавление длинного текста («Table of contents»): страницы политик 19–24 и записи блога (17 Article).
   Десктоп: список раскрыт и прилипает под шапкой (CSS), заголовок не сворачивает.
   ≤1024: оглавление свёрнуто в строку, закреплённую под шапкой (CSS) — у AML 17 разделов, у записей блога до 53,
   раскрытым оно занимало бы больше экрана. Тап по строке раскрывает список поверх текста из любого места документа;
   переход по пункту, тап мимо и Escape сворачивают обратно.
   Без JS <details open> остаётся раскрытым — ссылки работают.
   Тема WP: блок оглавления + этот скрипт; Elementor — Table of Contents (своя логика сворачивания). */
(function () {
  var box = document.querySelector('[data-widget="doc-toc"]');
  if (!box) return;
  var summary = box.querySelector('summary');
  var narrow = window.matchMedia('(max-width: 1024px)');

  function sync() { box.classList.toggle('doc-toc__box--open', box.open); }
  function apply() {
    box.open = !narrow.matches;
    if (summary) summary.tabIndex = narrow.matches ? 0 : -1;
    sync();
  }

  box.addEventListener('toggle', sync);
  box.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a') : null;
    if (link && narrow.matches) box.open = false;
  });
  if (summary) {
    summary.addEventListener('click', function (e) {
      if (!narrow.matches) e.preventDefault();
    });
  }
  document.addEventListener('click', function (e) {
    if (narrow.matches && box.open && !box.contains(e.target)) box.open = false;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !narrow.matches || !box.open) return;
    box.open = false;
    if (summary && box.contains(document.activeElement)) summary.focus();
  });
  if (narrow.addEventListener) narrow.addEventListener('change', apply);
  else narrow.addListener(apply);
  apply();
})();
