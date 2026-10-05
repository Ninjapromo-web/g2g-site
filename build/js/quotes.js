/* Котировки — демо-поставщик «Indicative prices» (HANDOFF §1: симуляцию за живые цены не выдавать).
   Один экземпляр на страницу: window.G2GQuotes. Потребители — глобус героя (js/globe.js), позже вкладка
   Multiple Markets и тосты MT5. Интерфейс не зависит от источника: реальный фид (MT5 G2G, платный API)
   подменяет loadSnapshot/fetchRemote, остальное остаётся (research/hero-globe-quotes.md §6).

   Откуда цены (решение пользователя 25.09, «гибрид»):
   1. Снимок assets/data/quotes-snapshot.json — делает assets/_src/hero/quotes_snapshot.py (CNBC, запасной Yahoo);
      не загрузился — опорные цены REF ниже (снимок 25.09.2026).
   2. Пока есть подписчики и вкладка видна — раз в POLL мс свежие цены с CNBC (неофициальный endpoint без ключа,
      только для демо; для продакшена источник выбирает клиент).
   3. Между запросами — тики раз в 1,4–3,4 с: блуждание с возвратом к последней реальной цене (Орнштейн — Уленбек),
      разброс — сотые доли процента, поэтому цена не уходит от реальной.
   % изменения — от закрытия прошлого дня. Рынок закрыт (время сервера G2G, GMT+3) — тиков нет, quote.closed = true.
   Часы — только опубликованные в копирайте (FX, US-индексы, DAX40); у остальных — только выходные: придуманное
   расписание не публикуем (ТЗ §7.13).

   API: start({snapshot}), subscribe(fn) → отписка, fn(ids) — список изменившихся;
        get(id) → {price, prevClose, changePct, dir, closed}; format(id, v); formatChange(pct);
        onStatus(fn) → отписка, status: 'loading' | 'indicative' | 'delayed';
        pause(reason) / resume(reason) — тики и запросы стоят, пока есть хоть одна причина
        (вкладка скрыта — 'hidden' ставит сам модуль; глобус — 'offscreen' и 'user'). */
(function () {
  var POLL = 90000;            // мс между запросами к источнику
  var FRESH = 5 * 60000;       // старше — статус «delayed»
  var REMOTE = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol' +
    '?requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&symbols=';

  // label — строка карточки «СИМВОЛ · НАЗВАНИЕ» (как в g2g-homepage2.html), digits — знаков после запятой,
  // group — разделитель тысяч, hours — расписание (ниже), vol — шаг тика в долях цены, remote — символ CNBC,
  // ref — опорная цена и закрытие (снимок 25.09.2026) на случай, если снимок не загрузился
  var I = {
    US30:    { label: 'US30 · DOW JONES',        digits: 1, group: true,  hours: 'us',   vol: 7e-5, remote: '.DJI',      ref: [51349.98, 51511.59] },
    US100:   { label: 'US100 · NASDAQ 100',      digits: 1, group: true,  hours: 'us',   vol: 8e-5, remote: '.NDX',      ref: [30478.86, 30470.29] },
    US500:   { label: 'US500 · S&P 500',         digits: 1, group: true,  hours: 'us',   vol: 7e-5, remote: '.SPX',      ref: [7704.13, 7706.03] },
    DXY:     { label: 'DXY · DOLLAR INDEX',      digits: 2, group: false, hours: 'week', vol: 4e-5, remote: '.DXY',      ref: [101.109, 101.285] },
    EURUSD:  { label: 'EUR/USD · EURO',          digits: 4, group: false, hours: 'fx',   vol: 5e-5, remote: 'EUR=',      ref: [1.1391, 1.1379] },
    DAX40:   { label: 'DAX40 · GERMANY 40',      digits: 1, group: true,  hours: 'dax',  vol: 7e-5, remote: '.GDAXI',    ref: [25490.91, 25266.53] },
    STOXX50: { label: 'STOXX50 · EURO STOXX 50', digits: 1, group: true,  hours: 'week', vol: 7e-5, remote: '.STOXX50E', ref: [6329.93, 6272.5] },
    USDJPY:  { label: 'USD/JPY · YEN',           digits: 3, group: false, hours: 'fx',   vol: 5e-5, remote: 'JPY=',      ref: [158.13, 158.83] },
    JP225:   { label: 'JP225 · NIKKEI 225',      digits: 1, group: true,  hours: 'week', vol: 8e-5, remote: '.N225',     ref: [66364.2, 65513.99] },
    AUDUSD:  { label: 'AUD/USD · AUSSIE',        digits: 4, group: false, hours: 'fx',   vol: 6e-5, remote: 'AUD=',      ref: [0.7029, 0.701] },
    XAUUSD:  { label: 'XAU/USD · GOLD',          digits: 2, group: true,  hours: 'week', vol: 9e-5, remote: 'XAU=',      ref: [4290.88, 4277.98] },
    AU200:   { label: 'AU200 · ASX 200',         digits: 1, group: true,  hours: 'week', vol: 7e-5, remote: '.AXJO',     ref: [8665, 8702] },
    USDCNH:  { label: 'USD/CNH · YUAN',          digits: 4, group: false, hours: 'fx',   vol: 3e-5, remote: 'CNH=',      ref: [6.7227, 6.7157] },
    CHINA50: { label: 'CHINA50 · CHINA A50',     digits: 1, group: true,  hours: 'week', vol: 8e-5, remote: '.FTXIN9',   ref: [14310.03, 14539.07] },
    USDCAD:  { label: 'USD/CAD · LOONIE',        digits: 4, group: false, hours: 'fx',   vol: 5e-5, remote: 'CAD=',      ref: [1.4147, 1.4134] },
    WTIUSD:  { label: 'WTI/USD · CRUDE OIL',     digits: 2, group: false, hours: 'week', vol: 1.2e-4, remote: '@CL.1',   ref: [93.33, 94.61] },
    USDCHF:  { label: 'USD/CHF · FRANC',         digits: 4, group: false, hours: 'fx',   vol: 5e-5, remote: 'CHF=',      ref: [0.8287, 0.8275] },
    SMI20:   { label: 'SMI20 · SWISS 20',        digits: 1, group: true,  hours: 'week', vol: 7e-5, remote: '.SSMI',     ref: [14000.82, 13905.82] },
    GBPUSD:  { label: 'GBP/USD · STERLING',      digits: 4, group: false, hours: 'fx',   vol: 5e-5, remote: 'GBP=',      ref: [1.3236, 1.3215] },
    UK100:   { label: 'UK100 · FTSE 100',        digits: 1, group: true,  hours: 'week', vol: 7e-5, remote: '.FTSE',     ref: [10736.97, 10679.99] },
    XAGUSD:  { label: 'XAG/USD · SILVER',        digits: 3, group: false, hours: 'week', vol: 1.1e-4, remote: 'XAG=',    ref: [64.51, 63.905] }
  };
  var IDS = Object.keys(I);

  // Время сервера G2G — GMT+3 (копирайт 14.09). Окна в минутах от полуночи по дням недели (0 — вс).
  var HOURS = {
    fx:   { 1: [5, 1438], 2: [0, 1438], 3: [0, 1438], 4: [0, 1438], 5: [0, 1429] },
    us:   { 1: [61, 1438], 2: [61, 1438], 3: [61, 1438], 4: [61, 1438], 5: [61, 1428] },
    dax:  { 1: [196, 1375], 2: [196, 1375], 3: [196, 1375], 4: [196, 1375], 5: [196, 1375] },
    week: { 1: [0, 1440], 2: [0, 1440], 3: [0, 1440], 4: [0, 1440], 5: [0, 1440] }
  };
  function isOpen(hours, now) {
    var t = new Date(now + 3 * 3600000);
    var win = HOURS[hours][t.getUTCDay()];
    var m = t.getUTCHours() * 60 + t.getUTCMinutes();
    return !!win && m >= win[0] && m < win[1];
  }

  var q = {};            // id → {price, anchor, prevClose, dir, closed, next}
  var listeners = [];
  var statusListeners = [];
  var status = 'loading';
  var lastRemote = 0;
  var started = false;
  var running = false;
  var holds = {};
  var starting = null;
  var tickTimer = 0;
  var pollTimer = 0;

  IDS.forEach(function (id) {
    q[id] = { price: I[id].ref[0], anchor: I[id].ref[0], prevClose: I[id].ref[1], dir: 0, closed: false, next: 0 };
  });

  function setStatus(s) {
    if (s === status) return;
    status = s;
    statusListeners.forEach(function (fn) { fn(s); });
  }
  function emit(ids) {
    if (ids.length) listeners.forEach(function (fn) { fn(ids); });
  }

  // Новая реальная цена становится якорем: тики плавно подтягивают к ней текущую
  function applyAnchor(id, price, prevClose, jump) {
    var s = q[id];
    s.anchor = price;
    if (prevClose) s.prevClose = prevClose;
    if (jump) s.price = price;
  }

  function loadSnapshot(url) {
    if (!url || !window.fetch) return Promise.resolve();
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.quotes) return;
      Object.keys(data.quotes).forEach(function (id) {
        if (q[id]) applyAnchor(id, data.quotes[id].price, data.quotes[id].prevClose, true);
      });
    }).catch(function () {});
  }

  function num(v) {
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }
  function fetchBatch(ids) {
    var bySym = {};
    ids.forEach(function (id) { bySym[I[id].remote] = id; });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(REMOTE + encodeURIComponent(Object.keys(bySym).join('|')), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        clearTimeout(timer);
        var got = 0;
        data.FormattedQuoteResult.FormattedQuote.forEach(function (x) {
          var id = bySym[x.symbol];
          var price = num(x.last);
          var change = num(x.change);
          if (!id || x.code !== 0 || price === null) return;
          applyAnchor(id, price, change !== null ? price - change : num(x.previous_day_closing), false);
          got++;
        });
        return got;
      });
  }
  function fetchRemote() {
    if (!window.fetch) return Promise.resolve(0);
    // двумя пачками: длинный список источник иногда отдаёт с ошибкой по отдельным символам
    return Promise.all([fetchBatch(IDS.slice(0, 11)), fetchBatch(IDS.slice(11))]).then(function (n) {
      return n[0] + n[1];
    });
  }
  function poll() {
    clearTimeout(pollTimer);
    if (!running) return;
    fetchRemote().then(function (got) {
      if (got) lastRemote = Date.now();
    }).catch(function () {}).then(function () {
      setStatus(Date.now() - lastRemote < FRESH ? 'indicative' : 'delayed');
      if (running) pollTimer = setTimeout(poll, POLL);
    });
  }

  // Гауссов шум (Бокс — Мюллер)
  function gauss() {
    var u = 1 - Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }
  function tick() {
    var now = Date.now();
    var changed = [];
    IDS.forEach(function (id) {
      var s = q[id];
      var open = isOpen(I[id].hours, now);
      if (s.closed === open) { s.closed = !open; changed.push(id); }
      if (!open) {
        if (s.price !== s.anchor) { s.price = s.anchor; s.dir = 0; changed.push(id); }
        return;
      }
      if (now < s.next) return;
      s.next = now + 1400 + Math.random() * 2000;
      var before = format(id, s.price);
      var p = s.price + 0.12 * (s.anchor - s.price) + I[id].vol * s.anchor * gauss();
      s.price = p;
      if (format(id, p) === before) return; // без видимой смены цифр — не мигаем
      s.dir = p > num(before) ? 1 : -1;
      changed.push(id);
    });
    emit(changed);
  }

  function format(id, v) {
    var cfg = I[id];
    var s = Math.abs(v).toFixed(cfg.digits);
    if (cfg.group) s = s.replace(/^(\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ','); });
    return (v < 0 ? '−' : '') + s;
  }
  function formatChange(pct) {
    var r = Math.round(pct * 100) / 100;
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(2) + '%';
  }

  function update() {
    var go = started && !Object.keys(holds).length;
    if (go === running) return;
    running = go;
    if (go) {
      tick();
      tickTimer = setInterval(tick, 400);
      // вернулись после паузы — сразу за свежими ценами, если прежние старше POLL
      if (Date.now() - lastRemote > POLL) poll(); else pollTimer = setTimeout(poll, POLL - (Date.now() - lastRemote));
    } else {
      clearInterval(tickTimer);
      clearTimeout(pollTimer);
    }
  }
  function pause(reason) { holds[reason || 'user'] = true; update(); }
  function resume(reason) { delete holds[reason || 'user']; update(); }

  if (document.hidden) holds.hidden = true;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause('hidden'); else resume('hidden');
  });

  window.G2GQuotes = {
    ids: IDS,
    instruments: I,
    start: function (opts) {
      if (starting) return starting;
      return starting = loadSnapshot(opts && opts.snapshot).then(function () {
        started = true;
        emit(IDS);
        update();
      });
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    onStatus: function (fn) {
      statusListeners.push(fn);
      fn(status);
      return function () { statusListeners = statusListeners.filter(function (f) { return f !== fn; }); };
    },
    get: function (id) {
      var s = q[id];
      return { price: s.price, prevClose: s.prevClose, changePct: (s.price - s.prevClose) / s.prevClose * 100,
               dir: s.dir, closed: s.closed };
    },
    format: format,
    formatChange: formatChange,
    pause: pause,
    resume: resume
  };
})();
