/* Глобус героя главной (7045:11426): точечная Земля, 8 ЦБ, карточки котировок (Watchlist Card 7046:9471, компакт).
   Основа — _client/g2g-homepage2.html (математика, данные ЦБ, логика карточек), переписано по
   research/hero-globe-quotes.md §2.6: точки считаются один раз, рисуются пачками (≤ 15 заливок на кадр вместо 2 920),
   свечение — готовый спрайт, пауза вне экрана, сглаживание по времени, а не по кадрам.

   Разметка: [data-widget="globe"] с data-dots (маска суши), data-snapshot (снимок цен), data-flags (папка флагов);
   внутри — .hero__globe-float с постером и подпись [data-globe-note] (кнопку паузы пользователь снял 28.09).
   Цены — js/quotes.js (window.G2GQuotes), без него карточек нет.

   Порядок: после load и простоя браузера (постер — кандидат LCP, его не трогаем) грузим маску и снимок,
   рисуем первый кадр, постер гаснет. Вне экрана и в фоновой вкладке — стоп (и котировки тоже).
   prefers-reduced-motion — статичный кадр: без вращения, пульса, инерции и «парения»; тянуть можно.
   Точки за горизонтом — мелкие и тусклые (фидбек 25.09): объём есть, наслоения нет. */
(function () {
  var root = document.querySelector('[data-widget="globe"]');
  if (!root || !window.requestAnimationFrame || !window.fetch) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TILT = 14 * Math.PI / 180;   // северный полюс к зрителю: видны 7 из 8 ЦБ, Антарктиды нет
  var SPEED = 0.078;               // рад/с ≈ 4,5°/с, оборот ≈ 80 с — как у клиента (видео одобрено)
  var THETA0 = -40 * Math.PI / 180; // спереди 40° в. д.: Европа выходит первой, Индия в кадре
  var RADIUS = 0.40;               // радиус шара от меньшей стороны сцены (PNG из Figma — то же отношение)

  // Порядок = коды 2..9 в globe-dots.json (assets/_src/hero/globe_dots.py)
  var BANKS = [
    { code: 'FED',  city: 'Washington, D.C.', flag: 'us', lat: 38.9,   lon: -77.0,  pool: ['US30', 'US100', 'US500', 'DXY'] },
    { code: 'ECB',  city: 'Frankfurt',        flag: 'eu', lat: 50.1,   lon: 8.68,   pool: ['EURUSD', 'DAX40', 'STOXX50'] },
    { code: 'BOJ',  city: 'Tokyo',            flag: 'jp', lat: 35.68,  lon: 139.69, pool: ['USDJPY', 'JP225'] },
    { code: 'RBA',  city: 'Sydney',           flag: 'au', lat: -33.87, lon: 151.21, pool: ['AUDUSD', 'XAUUSD', 'AU200'] },
    { code: 'PBOC', city: 'Beijing',          flag: 'cn', lat: 39.9,   lon: 116.4,  pool: ['USDCNH', 'CHINA50'] },
    { code: 'BOC',  city: 'Ottawa',           flag: 'ca', lat: 45.42,  lon: -75.70, pool: ['USDCAD', 'WTIUSD'] },
    { code: 'SNB',  city: 'Bern',             flag: 'ch', lat: 46.95,  lon: 7.45,   pool: ['USDCHF', 'SMI20'] },
    { code: 'BOE',  city: 'London',           flag: 'gb', lat: 51.5,   lon: -0.13,  pool: ['GBPUSD', 'UK100', 'XAGUSD'] }
  ];

  // Точки по глубине d (−1 оборот … 1 центр): уровни, радиус (px при R = 332, как в Figma) и непрозрачность.
  // Классы: 0 океан, 1 суша, 2 страна ЦБ. Сетка равномерная, без «облачков» (фидбек 28.09)
  // У горизонта точки сжимаются в линии — там они тоже мелкие и тусклые, крупнеют к центру
  var LEVELS = [-0.02, 0.25, 0.55, 0.82];    // границы уровней: оборот | горизонт | … | центр
  var DOT = [
    { r: [0.5, 0.65, 0.9, 1.05, 1.15], a: [0.05, 0.10, 0.22, 0.30, 0.34], front: 9 },
    { r: [0.55, 0.85, 1.45, 1.9, 2.2], a: [0.09, 0.24, 0.50, 0.70, 0.82], front: 3 },
    { r: [0.55, 0.95, 1.65, 2.2, 2.5], a: [0.10, 0.30, 0.64, 0.84, 0.95], front: 2 }
  ];
  var MAX_CARDS = { wide: 3, narrow: 2 };

  var float = root.querySelector('.hero__globe-float');
  var poster = root.querySelector('.hero__globe-poster');
  var note = document.querySelector('[data-globe-note]');
  var noteText = note && note.querySelector('[data-globe-status]');
  var flagsDir = root.getAttribute('data-flags') || 'assets/img/flags/';

  var canvas, ctx, layer, sprite;
  var W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, scale = 1;
  var grid = null, dotsData = null, pts = null, colors = null;
  var buckets = [];
  var cardW = 0, cardH = 0, maxCards = 4, safeTop = 0, safeLeft = 0, safeBottom = 0, safeRight = 0;
  var theta = THETA0, inertia = 0;
  var visible = true, userPaused = false, dragging = false;
  var raf = 0, last = 0, slowFrames = 0, frameSkip = false, skipOdd = false;
  var started = false;
  var bare = false; // кадр для постера: без карточек, выносок и пульса
  var Q = window.G2GQuotes;

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function cssColor(name) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(v);
    var n = m ? parseInt(m[1], 16) : 0xffffff;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }

  // ── Точки ────────────────────────────────────────────────────────────────
  function buildPoints(name) {
    var g = dotsData.grids[name];
    var list = [];
    var k = 0;
    for (var i = 0; i < g.counts.length; i++) {
      var lat = -90 + 180 / g.bands * (i + 1);
      for (var j = 0; j < g.counts[i]; j++, k++) {
        var t = +g.types.charAt(k);
        list.push(lat, -180 + 360 / g.counts[i] * j, t === 0 ? 0 : t === 1 ? 1 : 2);
      }
    }
    var n = list.length / 3;
    pts = { n: n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), c: new Uint8Array(n) };
    for (var p = 0; p < n; p++) {
      var la = list[p * 3] * Math.PI / 180, lo = list[p * 3 + 1] * Math.PI / 180;
      pts.x[p] = Math.cos(la) * Math.sin(lo);
      pts.y[p] = Math.sin(la);
      pts.z[p] = Math.cos(la) * Math.cos(lo);
      pts.c[p] = list[p * 3 + 2];
    }
    buckets = [];
    for (var b = 0; b < DOT.length * 5; b++) buckets.push({ xy: new Float32Array(n * 2), n: 0 });
    grid = name;
  }
  function bankVec(b) {
    var la = b.lat * Math.PI / 180, lo = b.lon * Math.PI / 180;
    b.ux = Math.cos(la) * Math.sin(lo); b.uy = Math.sin(la); b.uz = Math.cos(la) * Math.cos(lo);
  }

  // Поворот вокруг оси Земли на theta, затем наклон оси к зрителю на TILT
  var cT = Math.cos(TILT), sT = Math.sin(TILT);
  function project(x, y, z, c, s, out) {
    var x1 = x * c + z * s, z1 = -x * s + z * c;
    out.x = cx + x1 * R;
    out.y = cy - (y * cT - z1 * sT) * R;
    out.d = y * sT + z1 * cT;
    return out;
  }

  // Свечение ЦБ — один раз в offscreen-canvas, дальше drawImage (у клиента — новый градиент каждый кадр)
  function makeSprite() {
    var s = document.createElement('canvas');
    s.width = s.height = 128;
    var g = s.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, rgba(colors.glow, 0.55));
    grad.addColorStop(0.35, rgba(colors.glow, 0.18));
    grad.addColorStop(1, rgba(colors.glow, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return s;
  }

  // ── Карточки ─────────────────────────────────────────────────────────────
  function makeCard(b) {
    var el = document.createElement('div');
    el.className = 'globe-card';
    el.innerHTML =
      '<div class="globe-card__head">' +
        '<img class="globe-card__flag" src="' + flagsDir + b.flag + '.svg" width="20" height="14" alt="">' +
        '<span class="globe-card__bank">' + b.code + '</span>' +
        '<span class="globe-card__city">' + b.city + '</span>' +
      '</div>' +
      '<p class="globe-card__instrument"><span class="globe-card__symbol"></span><span class="globe-card__closed">Closed</span></p>' +
      '<p class="globe-card__price-row"><span class="globe-card__price"></span><span class="globe-card__change"></span></p>';
    layer.appendChild(el);
    b.el = el;
    b.symEl = el.querySelector('.globe-card__symbol');
    b.priceEl = el.querySelector('.globe-card__price');
    b.chgEl = el.querySelector('.globe-card__change');
    b.poolIndex = -1;
    b.shown = 0; b.slot = 0; b.px = null; b.py = 0; b.angle = 0;
    b.vis = 0; b.room = 1; b.roomTarget = 1; b.side = null; // место под карточку — placeCards()
    // текст для замера размеров карточки (resize); показ начнётся с первого инструмента пула
    b.symEl.textContent = Q.instruments[b.pool[0]].label;
    b.priceEl.textContent = Q.format(b.pool[0], Q.get(b.pool[0]).price);
    b.flashTimer = 0;
  }
  function renderQuote(b, flash) {
    var id = b.pool[b.poolIndex];
    var q = Q.get(id);
    b.priceEl.textContent = Q.format(id, q.price);
    b.chgEl.textContent = Q.formatChange(q.changePct);
    var bp = Math.round(q.changePct * 100); // знак — по тому, что видно: −0.001% показывается «0.00%»
    b.chgEl.classList.toggle('is-down', bp < 0);
    b.chgEl.classList.toggle('is-flat', bp === 0);
    b.el.classList.toggle('is-closed', q.closed);
    if (flash && q.dir && !calm.matches) {
      clearTimeout(b.flashTimer);
      b.el.classList.remove('is-tick-up', 'is-tick-down');
      b.el.classList.add(q.dir > 0 ? 'is-tick-up' : 'is-tick-down');
      b.flashTimer = setTimeout(function () { b.el.classList.remove('is-tick-up', 'is-tick-down'); }, 600);
    }
  }
  function nextInstrument(b) {
    b.poolIndex = (b.poolIndex + 1) % b.pool.length;
    b.symEl.textContent = Q.instruments[b.pool[b.poolIndex]].label;
    renderQuote(b, false);
  }

  // ── Кадр ─────────────────────────────────────────────────────────────────
  var P = { x: 0, y: 0, d: 0 };
  function draw(now, dt) {
    var c = Math.cos(theta), s = Math.sin(theta);
    var i, b;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (i = 0; i < buckets.length; i++) buckets[i].n = 0;
    var px = pts.x, py = pts.y, pz = pts.z, pc = pts.c;
    for (i = 0; i < pts.n; i++) {
      // project() развёрнут: горячий цикл, ~3 тыс. точек на кадр
      var z1 = -px[i] * s + pz[i] * c;
      var d = py[i] * sT + z1 * cT;
      // океан на обороте не рисуем: непрозрачность 0,05 не видна, а это треть точек; объём держит суша
      if (d < LEVELS[0] && pc[i] === 0) continue;
      var lv = d < LEVELS[0] ? 0 : d < LEVELS[1] ? 1 : d < LEVELS[2] ? 2 : d < LEVELS[3] ? 3 : 4;
      var bk = buckets[pc[i] * 5 + lv];
      bk.xy[bk.n * 2] = cx + (px[i] * c + pz[i] * s) * R;
      bk.xy[bk.n * 2 + 1] = cy - (py[i] * cT - z1 * sT) * R;
      bk.n++;
    }
    // Сначала оборот и горизонт, потом лицевая сторона — ближние точки сверху
    for (var level = 0; level < 5; level++) {
      for (var cls = 0; cls < DOT.length; cls++) {
        var bucket = buckets[cls * 5 + level];
        if (!bucket.n) continue;
        var spec = DOT[cls];
        var r = spec.r[level] * scale;
        ctx.fillStyle = level >= spec.front ? colors.front[cls][level] : colors.base[cls][level];
        ctx.beginPath();
        if (r < 0.8) {
          for (i = 0; i < bucket.n; i++) ctx.rect(bucket.xy[i * 2] - r, bucket.xy[i * 2 + 1] - r, r * 2, r * 2);
        } else {
          for (i = 0; i < bucket.n; i++) {
            ctx.moveTo(bucket.xy[i * 2] + r, bucket.xy[i * 2 + 1]);
            ctx.arc(bucket.xy[i * 2], bucket.xy[i * 2 + 1], r, 0, 6.2832);
          }
        }
        ctx.fill();
      }
    }

    // ЦБ: положение, глубина, кто получает карточку (ближайшие к зрителю, не больше maxCards)
    var front = [];
    for (i = 0; i < BANKS.length; i++) {
      b = BANKS[i];
      project(b.ux, b.uy, b.uz, c, s, P);
      b.mx = P.x; b.my = P.y; b.d = P.d;
      b.reveal = smoothstep(0.12, 0.4, P.d);
      if (b.reveal > 0) front.push(b);
    }
    front.sort(function (a, z) { return z.d - a.d; });
    var fade = 1 - Math.exp(-dt / 0.22);
    for (i = 0; i < BANKS.length; i++) {
      b = BANKS[i];
      var slotTarget = front.indexOf(b) > -1 && front.indexOf(b) < maxCards ? 1 : 0;
      b.want = slotTarget;
      b.slot += (slotTarget - b.slot) * (dt ? fade : 1);
      if (b.slot < 0.01 && !slotTarget) b.slot = 0;
      // карточка, которой не нашлось места без наезда на другие, гаснет (roomTarget ставит placeCards)
      b.vis = Math.min(b.reveal, b.slot);
      if (b.vis <= 0) { b.room = 1; b.roomTarget = 1; b.side = null; }
      b.room += (b.roomTarget - b.room) * (dt ? fade : 1);
      if (b.room < 0.01 && !b.roomTarget) b.room = 0;
      var shown = Math.min(b.vis, b.room);
      if (shown > 0.02 && b.shown <= 0.02) nextInstrument(b); // новое появление — следующий инструмент пула
      b.shown = shown;
    }

    // Маркеры
    var pulse = calm.matches || userPaused || bare ? -1 : (now / 2200) % 1;
    for (i = 0; i < BANKS.length; i++) {
      b = BANKS[i];
      if (b.d < 0) {
        ctx.fillStyle = rgba(colors.glow, 0.10);
        ctx.fillRect(b.mx - 0.8, b.my - 0.8, 1.6, 1.6);
        continue;
      }
      var k = smoothstep(0, 0.4, b.d);
      var gs = (30 + 30 * b.d) * scale;
      ctx.globalAlpha = 0.75 * k;
      ctx.drawImage(sprite, b.mx - gs, b.my - gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
      if (pulse >= 0 && b.reveal > 0) {
        ctx.beginPath();
        ctx.arc(b.mx, b.my, (3 + pulse * 16) * Math.max(scale, 0.8), 0, 6.2832);
        ctx.strokeStyle = rgba(colors.glow, ((1 - pulse) * 0.5 * b.reveal).toFixed(3));
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(b.mx, b.my, 3 * Math.max(scale, 0.8), 0, 6.2832);
      ctx.fillStyle = rgba(colors.marker, (0.45 + 0.55 * k).toFixed(3));
      ctx.fill();
    }

    if (!bare) placeCards(dt);
  }

  // Карточка стоит над маркером (низ по центру — на GAP выше точки, «ножка» — выноской).
  // Пересекающиеся — столбиком сбоку от своих маркеров (наружу от центра шара), к каждому — выноска.
  // Столбик — каскадом: каждая следующая карточка сдвинута на shift наружу (фидбек 28.09).
  // Прежний вариант «в одну линию» — data-stack="column" на [data-widget="globe"] (shift = 0).
  var GAP = 18, PAD = 8, STACK = 8, shift = 0;
  var spots = {}; // столбик (коды ЦБ) → сторона, где он стоял
  function placeCards(dt) {
    shift = root.getAttribute('data-stack') === 'column' ? 0 : Math.round(cardW * 0.14); // 28 / 23 px
    // гаснущие по лимиту карточек в раскладке не участвуют — тают на своём месте
    var list = BANKS.filter(function (b) { return b.vis > 0 && b.want; });
    var minX = safeLeft + cardW / 2, maxX = W - safeRight - cardW / 2;
    list.forEach(function (b) {
      b.bx = Math.min(maxX, Math.max(minX, b.mx));
      b.by = Math.min(H - safeBottom, Math.max(safeTop + cardH, b.my - GAP));
      b.group = b;
    });
    function find(b) { while (b.group !== b) b = b.group = b.group.group; return b; }
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (Math.abs(list[i].bx - list[j].bx) < cardW + 6 && Math.abs(list[i].by - list[j].by) < cardH + 6) {
          find(list[i]).group = find(list[j]);
        }
      }
    }
    var groups = {};
    list.forEach(function (b) {
      var r = find(b);
      (groups[r.code] = groups[r.code] || []).push(b);
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      if (g.length === 1) {
        var b = g[0];
        b.tx = b.bx; b.ty = b.by;
        var edge = 1 - smoothstep(0.3, 0.8, b.d);
        b.ta = (b.mx >= cx ? 1 : -1) * 26 * edge;
        return;
      }
      g.sort(function (a, z) { return a.my - z.my; });
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      g.forEach(function (b) {
        x0 = Math.min(x0, b.mx); x1 = Math.max(x1, b.mx); y0 = Math.min(y0, b.my); y1 = Math.max(y1, b.my);
      });
      var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      var step = cardH + STACK;
      var total = g.length * step - STACK;
      // место под столбик: снаружи от центра шара → с другой стороны → над маркерами → под ними;
      // первое, где столбик не упирается в края и не накрывает маркеры
      var outward = mx >= cx ? 1 : -1;
      var run = (g.length - 1) * shift; // на сколько каскад уходит вбок
      var tries = [
        [x1 + 24 + cardW / 2, my - total / 2], [x0 - 24 - cardW / 2, my - total / 2],
        [mx - outward * run / 2, y0 - GAP - total], [mx - outward * run / 2, y1 + GAP]
      ];
      tries.forEach(function (t, n) { t.side = n; t.dir = n === 0 ? 1 : n === 1 ? -1 : outward; });
      if (outward < 0) tries.unshift(tries.splice(1, 1)[0]);
      var key = g.map(function (b) { return b.code; }).sort().join();
      if (spots[key]) {
        // прежнее место этого столбика — первым, пока подходит (без скачков туда-обратно)
        var same = tries.filter(function (t) { return t.side === spots[key].side; })[0];
        if (same) tries.unshift(tries.splice(tries.indexOf(same), 1)[0]);
      }
      var spot = tries.filter(function (t) {
        var end = t[0] + t.dir * run;
        return Math.min(t[0], end) >= minX && Math.max(t[0], end) <= maxX && t[1] >= safeTop && t[1] + total <= H - safeBottom;
      })[0];
      if (spot) spots[key] = spot;
      var x = spot ? spot[0] : tries[0][0];
      var dir = spot ? spot.dir : tries[0].dir;
      var top = spot ? spot[1] : Math.min(H - safeBottom - total, Math.max(safeTop, my - total / 2));
      g.forEach(function (b, n) {
        b.tx = Math.min(maxX, Math.max(minX, x + dir * n * shift));
        b.ty = top + n * step + cardH;
        b.ta = 0;
      });
    });

    // Второй проход: карточки не наезжают друг на друга (правка 01.10). Столбики стоят, где встали; гаснущие
    // карточки тают на своём месте — это занятые места. Одиночная карточка (ближние к зрителю — первыми) берёт
    // свободное место: над маркером, под ним, сбоку от него или вплотную к мешающей карточке — ближайшее к
    // маркеру; прежнее место держится, пока годится (без скачков). Свободного места нет — карточка гаснет.
    var taken = [];
    list.forEach(function (b) { if (groups[find(b).code].length > 1) taken.push({ x: b.tx, y: b.ty }); });
    BANKS.forEach(function (b) {
      if (list.indexOf(b) < 0 && b.shown > 0.15 && b.px !== null) taken.push({ x: b.px, y: b.py });
    });
    function isFree(x, y) {
      if (x < minX || x > maxX || y - cardH < safeTop || y > H - safeBottom) return false;
      for (var n = 0; n < taken.length; n++) {
        if (Math.abs(x - taken[n].x) < cardW + 6 && Math.abs(y - taken[n].y) < cardH + 6) return false;
      }
      return true;
    }
    var aside = 24 + cardW / 2;
    list.filter(function (b) { return groups[find(b).code].length === 1; })
      .sort(function (a, z) { return z.d - a.d; })
      .forEach(function (b) {
        var opts = [
          ['A', b.bx, b.by], ['B', b.bx, b.my + GAP + cardH],
          ['R', b.mx + aside, b.my + cardH / 2], ['L', b.mx - aside, b.my + cardH / 2],
          ['R-', b.mx + aside, b.my - GAP], ['L-', b.mx - aside, b.my - GAP],
          ['R+', b.mx + aside, b.my + GAP + cardH], ['L+', b.mx - aside, b.my + GAP + cardH]
        ];
        taken.forEach(function (o, n) {
          opts.push(['a' + n, b.bx, o.y - cardH - STACK], ['b' + n, b.bx, o.y + cardH + STACK],
            ['r' + n, o.x + cardW + STACK, b.by], ['l' + n, o.x - cardW - STACK, b.by]);
        });
        var best = null, bestCost = Infinity;
        opts.forEach(function (o) {
          if (!isFree(o[1], o[2])) return;
          // расстояние от маркера до центра карточки; место над маркером и прежнее место — в приоритете
          var cost = Math.hypot(o[1] - b.mx, o[2] - cardH / 2 - b.my) - (o[0] === 'A' ? 120 : 0) - (o[0] === b.side ? 80 : 0);
          if (cost < bestCost) { bestCost = cost; best = o; }
        });
        if (!best) { b.roomTarget = 0; return; }
        b.roomTarget = 1;
        b.side = best[0];
        if (best[0] !== 'A') { b.tx = best[1]; b.ty = best[2]; b.ta = 0; }
        taken.push({ x: b.tx, y: b.ty });
      });

    var follow = dt ? 1 - Math.exp(-dt / 0.1) : 1;
    var turn = dt ? 1 - Math.exp(-dt / 0.25) : 1;
    BANKS.forEach(function (b) {
      if (!b.el) return;
      if (b.shown <= 0) {
        if (b.px !== null) { b.el.style.opacity = '0'; b.el.style.visibility = 'hidden'; b.px = null; }
        return;
      }
      if (b.px === null) { b.px = b.tx; b.py = b.ty; b.angle = b.ta; }
      b.px += (b.tx - b.px) * follow;
      b.py += (b.ty - b.py) * follow;
      b.angle += (b.ta - b.angle) * turn;
      // выноска: от маркера к ближайшей точке карточки
      var lx = Math.min(b.px + cardW / 2, Math.max(b.px - cardW / 2, b.mx));
      var ly = Math.min(b.py, Math.max(b.py - cardH, b.my));
      if (Math.abs(lx - b.mx) + Math.abs(ly - b.my) > 6) {
        ctx.beginPath();
        ctx.moveTo(b.mx, b.my);
        ctx.lineTo(lx, ly);
        ctx.strokeStyle = rgba(colors.glow, (0.35 * b.shown).toFixed(3));
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      b.el.style.visibility = 'visible';
      b.el.style.opacity = b.shown.toFixed(3);
      b.el.style.transform = 'translate3d(' + (b.px - cardW / 2).toFixed(1) + 'px,' + (b.py - cardH).toFixed(1) + 'px,0) ' +
        'perspective(900px) rotateY(' + b.angle.toFixed(1) + 'deg) scale(' + (0.94 + 0.06 * b.shown).toFixed(3) + ')';
    });
  }

  // ── Цикл ─────────────────────────────────────────────────────────────────
  function moving() {
    return (!calm.matches && !userPaused) || dragging || Math.abs(inertia) > 0.002;
  }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    if (frameSkip && (skipOdd = !skipOdd)) { schedule(); return; } // слабое устройство: 30 кадров/с
    last = now;
    if (!dragging) {
      theta += ((calm.matches || userPaused ? 0 : SPEED) + inertia) * dt;
      inertia *= Math.exp(-dt / 0.5);
    }
    var t0 = performance.now();
    draw(now, dt);
    // Адаптация: кадр дольше 9 мс в среднем — снижаем плотность пикселей и частоту
    if (!frameSkip && dt) {
      slowFrames = performance.now() - t0 > 9 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 20) { frameSkip = true; dpr = 1; resize(); }
    }
    var settling = BANKS.some(function (b) { return b.shown > 0 && b.slot > 0.01 && b.slot < 0.99; });
    if (moving() || settling) schedule(); else last = 0;
  }
  function schedule() {
    if (!raf && visible && !document.hidden && started) raf = requestAnimationFrame(frame);
  }
  function redraw() { // один кадр без движения (reduced motion, пауза)
    if (!started || raf) return;
    last = 0;
    schedule();
  }

  function resize() {
    var w = float.clientWidth, h = float.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    var narrow = Math.min(W, H) < 480; // телефон: лёгкая сетка, DPR ≤ 1.5, до 2 карточек
    if (!frameSkip) dpr = Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    R = Math.min(W, H) * RADIUS;
    cx = W / 2; cy = H / 2;
    scale = Math.max(0.6, R / 332);
    maxCards = narrow ? MAX_CARDS.narrow : MAX_CARDS.wide;
    var name = narrow ? 'light' : 'full';
    if (name !== grid) buildPoints(name);
    var first = layer.firstChild;
    cardW = first.offsetWidth; cardH = first.offsetHeight;
    // Сцена шире шара и на десктопе заходит под плавающую шапку, на текст героя, на полосу фактов и за край окна —
    // карточки туда не заезжают. Поля задаёт CSS (--globe-safe-* → padding слоя карточек): padding отдаёт
    // готовые px, а переменную с calc() getComputedStyle вернул бы строкой.
    var pad = getComputedStyle(layer);
    safeTop = Math.max(PAD, parseFloat(pad.paddingTop) || 0);
    safeLeft = Math.max(PAD, parseFloat(pad.paddingLeft) || 0);
    safeBottom = Math.max(PAD, parseFloat(pad.paddingBottom) || 0);
    safeRight = Math.max(PAD, parseFloat(pad.paddingRight) || 0);
    redraw();
  }

  // ── Перетаскивание: только по горизонтали, с инерцией; вертикальный свайп — прокрутка страницы ──
  var lastX = 0, lastT = 0, vel = 0;
  function overBall(e) {
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left - cx, y = e.clientY - r.top - cy;
    return x * x + y * y <= R * R * 1.1;
  }
  function onDown(e) {
    if (e.button > 0 || !overBall(e)) return; // мимо шара — не перехватываем
    dragging = true; inertia = 0; vel = 0;
    lastX = e.clientX; lastT = e.timeStamp;
    root.classList.add('is-dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* нет захвата — тянем без него */ }
    schedule();
  }
  function onMove(e) {
    if (!dragging) {
      if (e.pointerType === 'mouse') canvas.classList.toggle('is-over', overBall(e));
      return;
    }
    var dx = e.clientX - lastX;
    var dtm = Math.max(1, e.timeStamp - lastT);
    var d = dx / R;
    theta += d;
    vel = vel * 0.6 + (d / dtm * 1000) * 0.4;
    lastX = e.clientX; lastT = e.timeStamp;
    schedule();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    inertia = calm.matches ? 0 : Math.max(-2.5, Math.min(2.5, vel)); // бросок докручивает не больше ~70°
    schedule();
  }

  function setPaused(p) {
    userPaused = p;
    root.classList.toggle('is-paused', p || !visible);
    if (p) Q.pause('user'); else Q.resume('user');
    redraw();
  }

  function onStatus(s) {
    if (!noteText) return;
    noteText.textContent = s === 'delayed' ? 'Indicative prices · delayed' : 'Indicative prices';
  }

  // ── Запуск ───────────────────────────────────────────────────────────────
  function init() {
    Promise.all([
      fetch(root.getAttribute('data-dots')).then(function (r) { return r.json(); }),
      Q.start({ snapshot: root.getAttribute('data-snapshot') })
    ]).then(function (res) {
      dotsData = res[0];
      colors = {
        glow: cssColor('--color-globe-glow'),
        marker: cssColor('--color-globe-marker')
      };
      var base = [cssColor('--color-globe-ocean'), cssColor('--color-globe-land'), cssColor('--color-globe-bank')];
      var lit = [cssColor('--color-globe-ocean'), cssColor('--color-globe-land-front'), cssColor('--color-globe-bank-front')];
      colors.base = []; colors.front = [];
      DOT.forEach(function (spec, cls) {
        colors.base.push(spec.a.map(function (a) { return rgba(base[cls], a); }));
        colors.front.push(spec.a.map(function (a, lv) { return rgba(mix(base[cls], lit[cls], lv >= spec.front ? 1 : 0), a); }));
      });
      sprite = makeSprite();

      canvas = document.createElement('canvas');
      canvas.className = 'hero__globe-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
      layer = document.createElement('div');
      layer.className = 'hero__globe-cards';
      layer.setAttribute('aria-hidden', 'true');
      float.appendChild(canvas);
      float.appendChild(layer);
      BANKS.forEach(function (b) { bankVec(b); makeCard(b); });

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      calm.addEventListener && calm.addEventListener('change', function () { setPaused(userPaused); });

      Q.subscribe(function (ids) {
        BANKS.forEach(function (b) {
          if (b.shown > 0 && b.poolIndex > -1 && ids.indexOf(b.pool[b.poolIndex]) > -1) renderQuote(b, true);
        });
      });
      Q.onStatus(onStatus);

      // для проверки и снятия постера: face(долгота°) — повернуть к зрителю, pause(true|false),
      // poster(долгота°, px) — чистый кадр PNG (dataURL) для assets/img/hero-globe.webp
      root.g2gGlobe = {
        face: function (lon) { theta = -lon * Math.PI / 180; inertia = 0; redraw(); },
        pause: setPaused,
        canvas: canvas,
        // раскладка карточек — для проверки наездов: место (центр по x, низ по y), сторона, видимость
        state: function () {
          return { W: W, H: H, cardW: cardW, cardH: cardH, safe: [safeTop, safeRight, safeBottom, safeLeft], cards: BANKS.map(function (b) {
            return { code: b.code, want: b.want, shown: +b.shown.toFixed(2), room: b.roomTarget, side: b.side,
              x: Math.round(b.tx), y: Math.round(b.ty), mx: Math.round(b.mx), my: Math.round(b.my) };
          }) };
        },
        poster: function (lon, px) {
          var keep = [ctx, dpr, theta];
          var out = document.createElement('canvas');
          out.width = out.height = px;
          ctx = out.getContext('2d'); dpr = px / W; theta = -lon * Math.PI / 180; bare = true;
          draw(0, 0);
          bare = false; ctx = keep[0]; dpr = keep[1]; theta = keep[2];
          redraw();
          return out.toDataURL('image/png');
        },
      };

      started = true;
      new ResizeObserver(resize).observe(float);
      // поля карточек зависят от ширины окна и тогда, когда размер сцены не изменился
      window.addEventListener('resize', resize);
      resize();
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        root.classList.toggle('is-paused', userPaused || !visible);
        if (visible) { Q.resume('offscreen'); redraw(); schedule(); } else Q.pause('offscreen');
      }).observe(root);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });

      // первый кадр нарисован — постер гаснет, подпись и кнопка появляются
      requestAnimationFrame(function () {
        root.classList.add('is-live');
        if (note) note.hidden = false;
        if (poster) setTimeout(function () { poster.hidden = true; }, 700);
      });
    }).catch(function () { /* нет маски или котировок — остаётся постер */ });
  }

  function whenIdle() {
    if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 2000 });
    else setTimeout(init, 200);
  }
  if (!Q || !window.ResizeObserver || !window.IntersectionObserver) return;
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle);
})();
