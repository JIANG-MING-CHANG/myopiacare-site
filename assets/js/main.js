/*
 * MyopiaCare 首頁專用程式：主視覺動畫、服務輪播、使用流程、最新消息、線上提問表單
 * 共用功能（內容載入、安全過濾、選單、3D 互動）在 core.js。
 */
(function () {
  'use strict';

  var MC = window.MC;
  if (!MC) return;
  var doc = document;
  var $ = MC.$, $all = MC.$all, el = MC.el, clamp = MC.clamp, pad2 = MC.pad2, charLen = MC.charLen, str = MC.str;
  var lsGet = MC.lsGet, lsSet = MC.lsSet, toast = MC.toast, reduceMotion = MC.reduceMotion;
  var FB = MC.FB;

  /* ============ 圖示（固定 SVG，不含使用者資料） ============ */
  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONS = {
    cloud: SVG_OPEN + '<path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.4 4.4 0 0 0 7 18z"/><path d="M12 15.5v-5M9.8 12.6 12 10.4l2.2 2.2"/></svg>',
    ai: SVG_OPEN + '<path d="M4 19.5h16"/><path d="M5.5 15.5l4-4 3 3 5.5-6.5"/><path d="M18.5 2.8l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/></svg>',
    axis: SVG_OPEN + '<path d="M2.5 11S6 5 12 5s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="11" r="2.8"/><path d="M5 21h14M5 19.5v3M19 19.5v3M12 20v2"/></svg>',
    bell: SVG_OPEN + '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.8a2 2 0 0 0 4 0"/></svg>',
    report: SVG_OPEN + '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.8 17v-3.5M12 17V9M15.2 17v-5.5"/></svg>',
    clinic: SVG_OPEN + '<path d="M4 21V8.5L12 3l8 5.5V21"/><path d="M9 21v-5h6v5"/><path d="M12 7.5v4.5M9.75 9.75h4.5"/></svg>'
  };
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ============ 各區塊顯示 ============ */
  function renderHero(c) {
    var hero = $('.hero');
    if (!hero) return;
    var photo = $('.hero-photo', hero);
    var cards = $('.hero-cards', hero);
    if (cards) MC.setShown(cards, c.hero.showCards !== false);
    renderAxis($('.dc-axis', hero), c.hero.card4Value);
    requestAnimationFrame(fitHeroCards);
    $all('[data-card-meta]', hero).forEach(function (n) { renderCardMeta(n, MC.get(c, n.getAttribute('data-card-meta'))); });
    if (photo) {
      MC.resolveImage(c.hero.image).then(function (r) {
        if (r) { photo.src = r.src; photo.hidden = false; hero.classList.add('has-photo'); }
        else { photo.hidden = true; photo.removeAttribute('src'); hero.classList.remove('has-photo'); }
      });
    }
  }

  /* 數據卡說明：結尾若是「+0.12」這類數字，自動以亮綠色強調 */
  function renderCardMeta(node, text) {
    text = str(text);
    node.textContent = '';
    var m = text.match(/^(.*?)\s*([+\-−]\s?\d[\d.,]*\s*[A-Za-z%]*)$/);
    if (m) {
      if (m[1]) node.appendChild(doc.createTextNode(m[1] + ' '));
      node.appendChild(el('b', 'up', m[2]));
    } else {
      node.textContent = text;
    }
  }

  /* 主視覺漂浮數據卡：若在目前的螢幕尺寸會蓋到標題、Logo、文字或按鈕，自動改成一列排在按鈕下方 */
  var tabletDown = window.matchMedia('(max-width: 1023px)');
  function fitHeroCards() {
    var hero = $('.hero');
    var cards = $('.hero-cards');
    var inner = $('.hero-inner');
    if (!hero || !cards || !inner) return;
    hero.classList.remove('cards-row');
    if (cards.hidden || tabletDown.matches) return;
    var saved = inner.style.transform;
    inner.style.transform = 'none';
    var hr = hero.getBoundingClientRect();
    var header = $('#site-header');
    var headerH = header ? header.offsetHeight : 0;
    var targets = [];
    ['#hero-title', '.hero-eyebrow', '.hero-sub [data-cms]', '.hero-lead'].forEach(function (sel) {
      var n = $(sel, hero);
      if (!n || !n.textContent.trim()) return;
      var range = doc.createRange();
      range.selectNodeContents(n);
      targets.push(range.getBoundingClientRect());
    });
    $all('.hero-cta .btn', hero).forEach(function (n) { targets.push(n.getBoundingClientRect()); });
    var gap = 10;
    var crowded = $all('.data-card', cards).some(function (card) {
      var a = card.getBoundingClientRect();
      if (a.top - hr.top < headerH + 6 || a.bottom > hr.bottom) return true;
      return targets.some(function (b) {
        return !(a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top);
      });
    });
    inner.style.transform = saved;
    hero.classList.toggle('cards-row', crowded);
  }

  /* 散光軸度示意：依數值（0–180°）轉動軸線；不是數字時維持 180° */
  function renderAxis(svg, value) {
    if (!svg) return;
    var needle = svg.querySelector('.ax-needle');
    if (!needle) return;
    var deg = parseFloat(str(value).replace(/[^0-9.]/g, ''));
    if (!isFinite(deg)) deg = 180;
    deg = clamp(deg, 0, 180);
    needle.style.transform = 'rotate(' + (-deg).toFixed(1) + 'deg)';
    svg.setAttribute('data-axis', deg.toFixed(1));
  }

  function renderServices(items) {
    var track = $('#services-track');
    if (!track) return;
    track.textContent = '';
    items = items.map(function (it, idx) { return { it: it, idx: idx }; }).filter(function (x) { return x.it.title || x.it.desc; });
    items.forEach(function (x, i) {
      var it = x.it;
      var li = el('li', 'carousel-slide');
      li.setAttribute('data-edit', 'services.items.' + x.idx);
      li.setAttribute('role', 'group');
      li.setAttribute('aria-roledescription', 'slide');
      li.setAttribute('aria-label', (i + 1) + ' / ' + items.length);
      var card = el('article', 'svc-card layer-card tilt');
      card.appendChild(el('span', 'layer layer-1'));
      card.appendChild(el('span', 'layer layer-2'));
      var face = el('div', 'layer-face');
      face.appendChild(el('span', 'glare'));
      if (str(it.image).trim()) {
        var media = el('div', 'svc-media');
        var img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        media.appendChild(img);
        face.appendChild(media);
        MC.setImage(img, it.image).then(function (ok) { if (!ok) media.remove(); });
      }
      var icon = el('div', 'svc-icon');
      icon.innerHTML = Object.prototype.hasOwnProperty.call(ICONS, it.icon) ? ICONS[it.icon] : ICONS.cloud;
      face.appendChild(icon);
      var num = el('span', 'svc-num', pad2(i + 1));
      num.setAttribute('aria-hidden', 'true');
      face.appendChild(num);
      face.appendChild(el('h3', null, it.title));
      face.appendChild(el('p', null, it.desc));
      card.appendChild(face);
      li.appendChild(card);
      track.appendChild(li);
    });
    if (carousel) carousel.refresh();
  }

  function renderFlow(steps) {
    var list = $('#flow-steps');
    if (!list) return;
    list.textContent = '';
    steps.map(function (s, idx) { return { s: s, idx: idx }; }).filter(function (x) { return x.s.title || x.s.desc; }).forEach(function (x, i) {
      var s = x.s;
      var li = el('li', 'flow-step');
      li.setAttribute('data-edit', 'flow.steps.' + x.idx);
      li.style.setProperty('--i', String(i));
      var badge = el('span', 'step-badge');
      var ring = el('span', 'ring');
      ring.setAttribute('aria-hidden', 'true');
      badge.appendChild(ring);
      badge.appendChild(doc.createTextNode(pad2(i + 1)));
      li.appendChild(badge);
      li.appendChild(el('h3', null, s.title));
      li.appendChild(el('p', null, s.desc));
      list.appendChild(li);
    });
  }

  function renderNews(c) {
    var list = $('#news-list');
    if (!list) return;
    var items = MC.newsList(c).slice(0, 4);
    list.textContent = '';
    if (!items.length) { var none = el('li', 'news-empty', '目前沒有最新消息。'); none.setAttribute('data-edit', 'news.items'); list.appendChild(none); return; }
    items.forEach(function (it) {
      var li = el('li', 'news-item');
      li.setAttribute('data-edit', 'news.items.@' + it.id);
      var a = el('a', 'news-link');
      a.href = MC.href('news', it.id);
      var time = el('time', null, MC.fmtDate(it.date));
      if (/^\d{4}-\d{2}-\d{2}$/.test(it.date)) time.setAttribute('datetime', it.date);
      var text = el('span', 'news-text');
      text.appendChild(el('span', 'news-title', it.title));
      if (it.summary.trim()) text.appendChild(el('span', 'news-summary', it.summary));
      var arrow = el('span', 'news-arrow');
      arrow.innerHTML = ARROW;
      a.appendChild(time);
      a.appendChild(text);
      a.appendChild(arrow);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function initialOf(name) {
    var clean = str(name).replace(/[○\s]/g, '').replace(/醫師$/, '');
    return clean ? Array.from(clean)[0] : '醫';
  }
  /* 醫師形象照：預設使用網站內建的照片（依螢幕大小載入 600 或 960 寬），後台上傳的照片優先 */
  var portraitDefault = null;
  function renderPortrait(c) {
    var wrap = $('.portrait-wrap');
    var card = $('.about-card');
    var img = wrap ? $('.portrait-img', wrap) : null;
    if (!wrap || !card || !img) return;
    if (!portraitDefault) portraitDefault = { src: img.getAttribute('src'), srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes') };
    var on = c.about.showPortrait !== false;
    card.classList.toggle('no-portrait', !on && !MC.EDIT);
    var name = str(c.about.doctorName).trim();
    img.alt = (name || '醫師') + '形象照';
    var want = str(c.about.portrait).trim();
    img.dataset.want = want;
    function useDefault() {
      if (img.getAttribute('srcset') === portraitDefault.srcset && img.getAttribute('src') === portraitDefault.src) return;
      img.setAttribute('sizes', portraitDefault.sizes);
      img.setAttribute('srcset', portraitDefault.srcset);
      img.setAttribute('src', portraitDefault.src);
    }
    if (!want) { useDefault(); return; }
    MC.resolveImage(want).then(function (r) {
      if (img.dataset.want !== want) return;
      if (!r) { useDefault(); return; }
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = r.src;
    });
  }

  function renderDoctor(c) {
    var av = $('#doctor-avatar');
    if (!av) return;
    var initial = initialOf(c.about.doctorName);
    av.textContent = initial;
    if (str(c.about.doctorPhoto).trim()) {
      MC.resolveImage(c.about.doctorPhoto).then(function (r) {
        if (!r) return;
        av.textContent = '';
        var img = el('img');
        img.alt = '';
        img.src = r.src;
        av.appendChild(img);
      });
    }
  }

  /* ============ 主視覺：AI 眼睛掃描動畫（Canvas） ============ */
  function initHeroCanvas() {
    var canvas = $('.hero-canvas');
    var hero = $('.hero');
    if (!canvas || !hero || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var w = 0, h = 0, cx = 0, cy = 0, R = 0;
    var fibers = [], particles = [];
    var running = false, visible = true, raf = 0, lastT = 0, clock = 0;
    var look = { x: 0, y: 0, tx: 0, ty: 0 };

    function seedRandom(seed) {
      return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    }
    function build() {
      var rnd = seedRandom(20261025);
      fibers = [];
      for (var i = 0; i < 150; i++) {
        var t = rnd();
        var r = Math.round(43 + (70 - 43) * t), g = Math.round(179 + (169 - 179) * t), b = Math.round(230 + (59 - 230) * t);
        fibers.push({
          a: (i / 150) * Math.PI * 2 + rnd() * 0.03,
          r0: 0.33 + rnd() * 0.04,
          r1: 0.56 + rnd() * 0.12,
          w: 0.6 + rnd() * 1.1,
          p: rnd() * Math.PI * 2,
          c: 'rgba(' + r + ',' + g + ',' + b + ',' + (0.16 + rnd() * 0.26).toFixed(2) + ')'
        });
      }
      particles = [];
      for (var j = 0; j < 54; j++) {
        particles.push({
          a: rnd() * Math.PI * 2,
          r: 0.78 + rnd() * 0.62,
          s: (rnd() < 0.5 ? -1 : 1) * (0.04 + rnd() * 0.1),
          z: 0.8 + rnd() * 1.6,
          al: 0.25 + rnd() * 0.55
        });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var mobile = w < 768;
      cx = w / 2;
      var inner = $('.hero-inner');
      if (inner) {
        var ir = inner.getBoundingClientRect();
        var hr = hero.getBoundingClientRect();
        cy = clamp(ir.top - hr.top + ir.height / 2, h * 0.3, h * 0.6);
      } else {
        cy = h * 0.46;
      }
      R = mobile ? Math.min(w * 0.5, h * 0.3) : Math.min(w * 0.3, h * 0.36);
      if (!running) draw();
    }

    function ring(radius, dash, rot, color, width) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      var t = clock;
      ctx.clearRect(0, 0, w, h);
      look.x += (look.tx - look.x) * 0.05;
      look.y += (look.ty - look.y) * 0.05;
      var ox = look.x * R * 0.07, oy = look.y * R * 0.07;

      // 刻度環
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.04);
      for (var i = 0; i < 120; i++) {
        var a = (i / 120) * Math.PI * 2;
        var major = i % 10 === 0;
        var r1 = R * 1.18, r2 = r1 + (major ? 14 : 6);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.strokeStyle = major ? 'rgba(159,227,255,.38)' : 'rgba(159,227,255,.14)';
        ctx.lineWidth = major ? 1.4 : 1;
        ctx.stroke();
      }
      ctx.restore();

      ring(R * 1.02, [2, 10], -t * 0.08, 'rgba(43,179,230,.32)', 1.2);
      ring(R * 1.34, [1, 14], t * 0.05, 'rgba(255,255,255,.14)', 1);
      ring(R * 0.86, [], 0, 'rgba(140,193,63,.16)', 1);

      // 虹膜纖維
      var breathe = 1 + Math.sin(t * 0.9) * 0.02;
      ctx.save();
      ctx.translate(cx + ox * 0.5, cy + oy * 0.5);
      for (var f = 0; f < fibers.length; f++) {
        var fb = fibers[f];
        var ang = fb.a + Math.sin(t * 0.35 + fb.p) * 0.012;
        var ra = R * fb.r0 * breathe, rb = R * fb.r1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * ra, Math.sin(ang) * ra);
        ctx.lineTo(Math.cos(ang) * rb, Math.sin(ang) * rb);
        ctx.strokeStyle = fb.c;
        ctx.lineWidth = fb.w;
        ctx.stroke();
      }
      ctx.restore();

      // 角膜緣光環
      var lg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      lg.addColorStop(0, 'rgba(43,179,230,.75)');
      lg.addColorStop(0.5, 'rgba(63,176,169,.55)');
      lg.addColorStop(1, 'rgba(140,193,63,.7)');
      ctx.beginPath();
      ctx.arc(cx + ox * 0.5, cy + oy * 0.5, R * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 瞳孔
      var px = cx + ox, py = cy + oy;
      var pg = ctx.createRadialGradient(px, py, 0, px, py, R * 0.42);
      pg.addColorStop(0, 'rgba(3,12,22,.95)');
      pg.addColorStop(0.62, 'rgba(3,12,22,.75)');
      pg.addColorStop(1, 'rgba(3,12,22,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, R * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // 旋轉掃描扇形
      var sweep = t * 0.9;
      ctx.save();
      ctx.translate(cx, cy);
      if (ctx.createConicGradient) {
        var cg = ctx.createConicGradient(sweep - 0.63, 0, 0);
        cg.addColorStop(0, 'rgba(43,179,230,0)');
        cg.addColorStop(0.1, 'rgba(43,179,230,.09)');
        cg.addColorStop(0.104, 'rgba(43,179,230,0)');
        cg.addColorStop(1, 'rgba(43,179,230,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * R * 1.12, Math.sin(sweep) * R * 1.12);
      ctx.strokeStyle = 'rgba(159,227,255,.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // OCT 水平掃描線
      var dy = Math.sin(t * 0.6) * R * 0.66;
      var half = Math.sqrt(Math.max(0, R * R * 0.81 - dy * dy));
      var sg = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
      sg.addColorStop(0, 'rgba(140,193,63,0)');
      sg.addColorStop(0.5, 'rgba(189,235,180,.55)');
      sg.addColorStop(1, 'rgba(140,193,63,0)');
      ctx.beginPath();
      ctx.moveTo(cx - half, cy + dy);
      ctx.lineTo(cx + half, cy + dy);
      ctx.strokeStyle = sg;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 數據粒子網絡
      var pts = [];
      for (var k = 0; k < particles.length; k++) {
        var p = particles[k];
        var pa = p.a + t * p.s;
        var x = cx + Math.cos(pa) * R * p.r;
        var y = cy + Math.sin(pa) * R * p.r * 0.9;
        pts.push(x, y);
        ctx.beginPath();
        ctx.arc(x, y, p.z, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(189,236,255,' + p.al.toFixed(2) + ')';
        ctx.fill();
      }
      var maxD = R * 0.32;
      ctx.lineWidth = 0.6;
      for (var m = 0; m < pts.length; m += 2) {
        for (var n = m + 2; n < pts.length; n += 2) {
          var ddx = pts[m] - pts[n], ddy = pts[m + 1] - pts[n + 1];
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < maxD * maxD) {
            ctx.beginPath();
            ctx.moveTo(pts[m], pts[m + 1]);
            ctx.lineTo(pts[n], pts[n + 1]);
            ctx.strokeStyle = 'rgba(120,210,240,' + (0.22 * (1 - Math.sqrt(d2) / maxD)).toFixed(3) + ')';
            ctx.stroke();
          }
        }
      }

    }

    function loop(now) {
      if (!running) return;
      var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
      lastT = now;
      clock += dt;
      draw();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduceMotion.matches || !visible || doc.hidden) return;
      running = true;
      lastT = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    build();
    resize();
    clock = 4.2; // 靜態畫面時的固定角度
    draw();
    start();

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(canvas);
    }
    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      look.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      look.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { look.tx = 0; look.ty = 0; });
    var onMotion = function () { if (reduceMotion.matches) { stop(); draw(); } else start(); };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotion);
    window.addEventListener('load', resize);
  }
  /* ============ 服務項目輪播 ============ */
  var carousel = null;
  function initCarousel() {
    var rootEl = $('[data-carousel]');
    if (!rootEl) return;
    var viewport = $('.carousel-viewport', rootEl);
    var track = $('.carousel-track', rootEl);
    var prev = $('.carousel-btn.prev', rootEl);
    var next = $('.carousel-btn.next', rootEl);
    var dotsWrap = $('.carousel-dots', rootEl);
    var hovering = false, inView = false, lastInteraction = 0, ticking = false;
    var drag = null, suppressClick = false, dragEndTimer = 0;

    function slides() { return $all('.carousel-slide', track); }
    function stepSize() {
      var s = slides();
      if (s.length < 2) return viewport.clientWidth || 1;
      return (s[1].offsetLeft - s[0].offsetLeft) || 1;
    }
    function maxIndex() {
      return Math.max(0, Math.round((viewport.scrollWidth - viewport.clientWidth) / stepSize()));
    }
    function index() { return clamp(Math.round(viewport.scrollLeft / stepSize()), 0, maxIndex()); }
    function goTo(i, smooth) {
      i = clamp(i, 0, maxIndex());
      var left = Math.min(i * stepSize(), viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollTo({ left: left, behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' });
    }
    function touched() { lastInteraction = Date.now(); }
    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.textContent = '';
      var m = maxIndex();
      dotsWrap.hidden = m === 0;
      for (var i = 0; i <= m; i++) {
        (function (k) {
          var b = el('button');
          b.type = 'button';
          b.setAttribute('aria-label', '第 ' + (k + 1) + ' 組服務');
          b.addEventListener('click', function () { touched(); goTo(k, true); });
          dotsWrap.appendChild(b);
        })(i);
      }
    }
    function update() {
      ticking = false;
      var i = index(), m = maxIndex();
      if (dotsWrap) $all('button', dotsWrap).forEach(function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= m;
    }
    function refresh() { buildDots(); update(); }

    viewport.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    if (prev) prev.addEventListener('click', function () { touched(); goTo(index() - 1, true); });
    if (next) next.addEventListener('click', function () { touched(); goTo(index() + 1, true); });
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); touched(); goTo(index() + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); touched(); goTo(index() - 1, true); }
    });

    // 滑鼠拖曳（觸控裝置使用原生滑動）
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: viewport.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        clearTimeout(dragEndTimer);
        viewport.classList.add('is-dragging');
      }
      if (drag.moved) viewport.scrollLeft = drag.left - dx;
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      if (!moved) return;
      touched();
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 60);
      goTo(index(), true);
      dragEndTimer = setTimeout(function () { viewport.classList.remove('is-dragging'); }, 500);
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // 自動輪播：滑鼠停留、觸控、鍵盤操作或不在畫面中時暫停
    rootEl.addEventListener('mouseenter', function () { hovering = true; });
    rootEl.addEventListener('mouseleave', function () { hovering = false; });
    rootEl.addEventListener('focusin', function () { hovering = true; });
    rootEl.addEventListener('focusout', function () { hovering = false; });
    viewport.addEventListener('touchstart', touched, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; }, { threshold: 0.4 }).observe(rootEl);
    }
    setInterval(function () {
      if (hovering || !inView || doc.hidden || reduceMotion.matches || drag) return;
      if (Date.now() - lastInteraction < 9000) return;
      var i = index();
      goTo(i >= maxIndex() ? 0 : i + 1, true);
    }, 5500);

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refresh, 150);
    });

    carousel = { refresh: refresh };
    refresh();
  }
  /* ============ 線上提問表單 → Firestore ============ */
  var ROLES = ['parent', 'clinic', 'partner', 'other'];
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var PHONE_RE = /^[0-9+\-()#\s]{0,30}$/;

  function initForm() {
    var form = $('#contact-form');
    if (!form) return;
    var statusEl = $('.form-status', form);
    var btn = $('button[type="submit"]', form);
    var counter = $('#msg-counter');
    var startedAt = Date.now();
    var busy = false;

    function setStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.className = 'form-status' + (kind ? ' is-' + kind : '');
    }
    function fieldError(name, msg) {
      var input = form.elements[name];
      var err = $('#err-' + name);
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) err.textContent = msg || '';
    }
    /* 送出時記錄 IP 位址（防止不當使用）：瀏覽器本身不知道對外 IP，向 ipify 查詢；查不到也照常送出 */
    function lookupIp() {
      if (!window.fetch) return Promise.resolve('');
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
      return fetch('https://api64.ipify.org?format=json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (d) {
          var ip = d && typeof d.ip === 'string' ? d.ip.trim() : '';
          return /^[0-9A-Fa-f:.]{3,45}$/.test(ip) ? ip : '';
        })
        .catch(function () { return ''; })
        .then(function (ip) { clearTimeout(timer); return ip; });
    }
    function collect() {
      var f = form.elements;
      return {
        name: f.name.value.trim(),
        email: f.email.value.trim(),
        phone: f.phone.value.trim(),
        role: f.role.value,
        subject: f.subject.value.trim(),
        message: f.message.value.trim(),
        consent: !!f.consent.checked
      };
    }
    function validate(d) {
      var errors = {};
      var n = charLen(d.name);
      if (!n) errors.name = '請填寫姓名'; else if (n > 50) errors.name = '姓名最多 50 個字';
      if (!d.email) errors.email = '請填寫 Email';
      else if (!EMAIL_RE.test(d.email) || charLen(d.email) > 120) errors.email = 'Email 格式不正確';
      if (d.phone && (!PHONE_RE.test(d.phone) || charLen(d.phone) > 30)) errors.phone = '電話格式不正確（只能包含數字、+、-、括號）';
      if (ROLES.indexOf(d.role) === -1) errors.role = '請選擇您的身分';
      var s = charLen(d.subject);
      if (!s) errors.subject = '請填寫主旨'; else if (s > 100) errors.subject = '主旨最多 100 個字';
      var m = charLen(d.message);
      if (m < 5) errors.message = '提問內容請至少填寫 5 個字'; else if (m > 2000) errors.message = '提問內容最多 2000 個字';
      if (!d.consent) errors.consent = '請勾選同意隱私權政策';
      return errors;
    }
    function updateCounter() {
      if (counter) counter.textContent = charLen(form.elements.message.value) + ' / 2000';
    }

    form.addEventListener('input', function (e) {
      var name = e.target && e.target.name;
      if (name && e.target.getAttribute('aria-invalid') === 'true') fieldError(name, '');
      if (name === 'message') updateCounter();
    });
    form.addEventListener('change', function (e) {
      var name = e.target && e.target.name;
      if ((name === 'consent' || name === 'role') && e.target.getAttribute('aria-invalid') === 'true') fieldError(name, '');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var data = collect();
      var errors = validate(data);
      ['name', 'email', 'phone', 'role', 'subject', 'message', 'consent'].forEach(function (k) { fieldError(k, errors[k]); });
      var firstBad = Object.keys(errors)[0];
      if (firstBad) {
        setStatus('請修正標示的欄位後再送出。', 'error');
        var input = form.elements[firstBad];
        if (input && input.focus) input.focus();
        return;
      }
      // 機器人陷阱：真人看不到這個欄位
      if (form.elements.website.value) {
        form.reset();
        updateCounter();
        setStatus('已收到您的提問，謝謝！', 'success');
        return;
      }
      if (Date.now() - startedAt < 2500) {
        setStatus('送出太快了，請確認內容後再按一次。', 'warn');
        return;
      }
      var last = parseInt(lsGet('mc-last-submit') || '0', 10);
      if (Date.now() - last < 60000) {
        setStatus('您剛剛已送出一則提問，請稍候 1 分鐘再送出下一則。', 'warn');
        return;
      }
      if (!FB || !FB.isConfigured()) {
        setStatus('示範模式：網站尚未連接資料庫，這則訊息沒有送出。請管理者依部署指南完成 Firebase 設定。', 'warn');
        return;
      }

      busy = true;
      btn.disabled = true;
      btn.classList.add('is-loading');
      setStatus('傳送中，請稍候…');

      var job = Promise.all([FB.firestore(), lookupIp()]).then(function (r) {
        var f = r[0];
        var col = f.fs.collection(f.db, 'inquiries');
        var record = {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: data.role,
          subject: data.subject,
          message: data.message,
          consent: true,
          status: 'new',
          createdAt: f.fs.serverTimestamp(),
          ip: r[1],
          ua: str(navigator.userAgent).slice(0, 400)
        };
        return f.fs.addDoc(col, record).catch(function (err) {
          // 資料庫規則尚未更新（還不接受 IP 欄位）時，仍然照常收下提問，不讓訪客送不出去
          if (!err || err.code !== 'permission-denied') throw err;
          delete record.ip;
          delete record.ua;
          return f.fs.addDoc(col, record);
        });
      });

      FB.withTimeout(job, 20000).then(function () {
        form.reset();
        updateCounter();
        startedAt = Date.now();
        lsSet('mc-last-submit', String(Date.now()));
        setStatus('已收到您的提問！我們會盡快以 Email 回覆您，謝謝。', 'success');
        toast('提問已送出，謝謝您！');
      }).catch(function (err) {
        if (window.console) console.error('[contact form]', err);
        var code = err && err.code;
        var msg = '送出失敗，請稍後再試，或直接以 Email 與我們聯絡。';
        if (code === 'permission-denied') msg = '送出失敗：資料格式不符，請檢查各欄位後再試一次。';
        else if (code === 'timeout' || code === 'unavailable') msg = '網路連線不穩定，請確認網路後再試一次。';
        setStatus(msg, 'error');
      }).then(function () {
        busy = false;
        btn.disabled = false;
        btn.classList.remove('is-loading');
      });
    });

    // 使用者開始填表時先預載 Firebase，送出時更快
    var warmed = false;
    form.addEventListener('focusin', function () {
      if (warmed || !FB || !FB.isConfigured()) return;
      warmed = true;
      FB.firestore().catch(function () { warmed = false; });
    });
  }

  /* ============ 啟動 ============ */
  function boot() {
    initCarousel();
    initForm();
    MC.start({
      title: function (c) { return c.site.title || c.brand.nameZh; },
      render: function (c) {
        renderHero(c);
        renderServices((c.services && c.services.items) || []);
        renderFlow((c.flow && c.flow.steps) || []);
        renderNews(c);
        renderDoctor(c);
        renderPortrait(c);
      },
      afterFirstRender: function () {
        initHeroCanvas();
        fitHeroCards();
        setTimeout(fitHeroCards, 1300); // 進場動畫結束後再確認一次
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitHeroCards);
        var fitTimer = 0;
        window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitHeroCards, 150); });
      }
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
