/*
 * MyopiaCare 共用核心：每個頁面都會載入
 * - 內容載入（預設值 → 瀏覽器暫存 → 資料庫最新內容）
 * - 安全的格式文字顯示（白名單過濾，防止 XSS）
 * - 圖片解析、網址路由（全部以 myopiacare.site/ 為根目錄）
 * - 頁首選單、深淺色、3D 傾斜、磁吸與漣漪按鈕、捲動進場
 * - 頁尾瀏覽人次（匿名累計）
 * - 視覺化編輯模式：只在管理後台（同網域）的預覽框內啟用，點選物件即可在後台修改
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var FB = window.MC_FIREBASE || null;
  var DEFAULTS = window.MC_DEFAULT_CONTENT || {};
  var CACHE_KEY = 'mc-content-cache-v2';
  var ROUTES = { home: '/', news: '/news/', privacy: '/privacy/' };
  /* 直接在電腦上雙擊打開檔案（file://）時：改用檔案路徑，讓本機預覽的連結與圖片都正常 */
  var IS_FILE = window.location.protocol === 'file:';
  if (IS_FILE) {
    try {
      var rootUrl = new URL('../../', (doc.currentScript && doc.currentScript.src) || window.location.href).href;
      ROUTES = { home: rootUrl + 'index.html', news: rootUrl + 'news/index.html', privacy: rootUrl + 'privacy/index.html' };
    } catch (e) { /* 保留預設 */ }
  }
  if (window.MC_ROUTES) Object.keys(window.MC_ROUTES).forEach(function (k) { ROUTES[k] = window.MC_ROUTES[k]; });

  /* ============ 小工具 ============ */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : ''); }
  function get(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function charLen(s) { return Array.from(s).length; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  /* 視覺化編輯模式：必須同時符合「網址帶 mc-edit=1」「被嵌在框架內」「外層是同網域頁面（管理後台）」 */
  var EDIT = (function () {
    try {
      if (window.parent === window) return false;
      if (new URLSearchParams(window.location.search).get('mc-edit') !== '1') return false;
      return window.parent.location.origin === window.location.origin;
    } catch (e) { return false; }
  })();

  /* 顯示／隱藏：編輯模式下改為半透明，讓管理者仍能點選並重新開啟 */
  function setShown(node, shown) {
    if (!node) return;
    if (EDIT) { node.hidden = false; node.classList.toggle('mc-off', !shown); }
    else { node.hidden = !shown; node.classList.remove('mc-off'); }
  }

  function href(page, id) {
    var base = ROUTES[page] || ROUTES.home;
    return id ? base + '?id=' + encodeURIComponent(id) : base;
  }

  /* 以預設內容為骨架合併：只接受已知欄位與正確型別 */
  function blankOf(t) {
    if (Array.isArray(t)) return [];
    if (isObj(t)) { var o = {}; Object.keys(t).forEach(function (k) { o[k] = blankOf(t[k]); }); return o; }
    return typeof t === 'boolean' ? t : '';
  }
  function merge(base, over) {
    if (Array.isArray(base)) {
      if (!Array.isArray(over)) return JSON.parse(JSON.stringify(base));
      var tpl = base.length ? blankOf(base[0]) : '';
      return over.slice(0, 60).map(function (item) { return isObj(tpl) ? merge(tpl, item) : str(item); });
    }
    if (isObj(base)) {
      var out = {};
      Object.keys(base).forEach(function (k) { out[k] = merge(base[k], isObj(over) ? over[k] : undefined); });
      return out;
    }
    if (typeof base === 'boolean') return typeof over === 'boolean' ? over : base;
    if (over === undefined || over === null) return base;
    return typeof over === 'string' ? over : (typeof over === 'number' ? String(over) : base);
  }

  /* 以預設內容為骨架合併，並把 v2 版尚未修改的佔位文字（例如 ○○○ 醫師、04-0000-0000）換成目前的正式資料 */
  var LEGACY = {
    'about.doctorName': ['○○○ 醫師'],
    'contact.phone': ['04-0000-0000'],
    'contact.email': ['service@myopiacare.site'],
    'contact.address': ['請於管理後台填寫公司地址', 'No. 4-1, Ln. 2, Miaoli City, Miaoli County, Taiwan (R.O.C.)'],
    'contact.lineUrl': [''],
    'brand.nameEn': ['MyopiaCare'],
    'hero.title': ['MyopiaCare'],
    'app.kicker': ['MYOPIACARE APP']
  };
  function withDefaults(over) {
    var c = merge(DEFAULTS, over);
    Object.keys(LEGACY).forEach(function (path) {
      var k = path.split('.');
      if (c[k[0]] && DEFAULTS[k[0]] && LEGACY[path].indexOf(c[k[0]][k[1]]) !== -1) c[k[0]][k[1]] = DEFAULTS[k[0]][k[1]];
    });
    return c;
  }

  /* 只允許安全的網址 */
  var MEDIA_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  function safeUrl(u, opts) {
    opts = opts || {};
    u = str(u).trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) {
      try {
        var p = new URL(u);
        return (p.protocol === 'https:' || p.protocol === 'http:') ? p.href : '';
      } catch (e) { return ''; }
    }
    if (opts.mail && /^mailto:[^\s<>"]+$/i.test(u)) return u;
    if (opts.tel && /^tel:[0-9+\-()#\s]+$/i.test(u)) return u;
    if (opts.relative && /^\/(?!\/)[\w\-./?=&#%~]*$/.test(u) && u.indexOf('..') === -1) return u;
    if (opts.relative && /^#[\w-]*$/.test(u)) return u;
    return '';
  }

  /* ============ 格式文字（白名單過濾） ============ */
  var RICH_MAP = {
    P: 'p', DIV: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's',
    H1: 'h3', H2: 'h3', H3: 'h3', H4: 'h4', H5: 'h4', H6: 'h4', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote',
    A: 'a', IMG: 'img', FIGURE: 'figure', FIGCAPTION: 'figcaption', SPAN: 'span', FONT: 'span', MARK: 'span', HR: 'hr',
    SMALL: 'small', SUB: 'sub', SUP: 'sup'
  };
  var RICH_DROP = {
    SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, IFRAME: 1, FRAME: 1, FRAMESET: 1, OBJECT: 1, EMBED: 1, APPLET: 1,
    SVG: 1, MATH: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, OPTION: 1, LINK: 1, META: 1, BASE: 1,
    TITLE: 1, HEAD: 1, VIDEO: 1, AUDIO: 1, SOURCE: 1, TRACK: 1, CANVAS: 1, PICTURE: 1, DIALOG: 1, PORTAL: 1
  };
  var BLOCKS = { P: 1, DIV: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, FIGURE: 1, HR: 1, TABLE: 1 };
  var CLASS_OK = {
    'ta-center': 1, 'ta-right': 1, 'tc-brand': 1, 'tc-green': 1, 'tc-muted': 1, 'hl': 1, 'lead': 1,
    'img-full': 1, 'img-half': 1, 'img-left': 1, 'img-right': 1
  };
  var COLOR_CLASS = { '0b78a8': 'tc-brand', '2f7d27': 'tc-green', '587084': 'tc-muted' };

  function hexOf(c) {
    c = str(c).trim().toLowerCase();
    var m = c.match(/^#([0-9a-f]{6})$/);
    if (m) return m[1];
    m = c.match(/^#([0-9a-f]{3})$/);
    if (m) return m[1].split('').map(function (x) { return x + x; }).join('');
    m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [m[1], m[2], m[3]].map(function (x) { return ('0' + Number(x).toString(16)).slice(-2); }).join('');
    return '';
  }

  function classesFor(src, tag) {
    var out = [];
    str(src.getAttribute('class')).split(/\s+/).forEach(function (c) { if (CLASS_OK[c] && out.indexOf(c) === -1) out.push(c); });
    var color = tag === 'FONT' ? src.getAttribute('color') : '';
    var style = str(src.getAttribute('style'));
    var cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (cm) color = cm[1];
    var cls = COLOR_CLASS[hexOf(color)];
    if (cls && out.indexOf(cls) === -1) out.push(cls);
    if (/background(?:-color)?\s*:/i.test(style) || tag === 'MARK') { if (out.indexOf('hl') === -1) out.push('hl'); }
    var am = style.match(/text-align\s*:\s*(center|right)/i);
    if (am && out.indexOf('ta-' + am[1].toLowerCase()) === -1) out.push('ta-' + am[1].toLowerCase());
    return out;
  }

  function hasBlockChild(n) {
    for (var c = n.firstElementChild; c; c = c.nextElementSibling) if (BLOCKS[c.nodeName.toUpperCase()]) return true;
    return false;
  }

  function walkRich(src, out, d, depth) {
    var kids = src.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child.nodeType === 3) { out.appendChild(d.createTextNode(child.nodeValue)); continue; }
      if (child.nodeType !== 1) continue;
      var tag = child.nodeName.toUpperCase();
      if (RICH_DROP[tag]) continue;
      if (depth > 24) { out.appendChild(d.createTextNode(child.textContent)); continue; }
      var mapped = RICH_MAP[tag];
      if (!mapped || (tag === 'DIV' && hasBlockChild(child))) { walkRich(child, out, d, depth + 1); continue; }
      var classes = classesFor(child, tag);
      if (mapped === 'span' && !classes.length) { walkRich(child, out, d, depth + 1); continue; }
      var node;
      if (mapped === 'a') {
        var url = safeUrl(child.getAttribute('href'), { relative: true, mail: true, tel: true });
        if (!url) { walkRich(child, out, d, depth + 1); continue; }
        node = d.createElement('a');
        node.setAttribute('href', url);
        if (/^https?:/i.test(url)) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
      } else if (mapped === 'img') {
        var media = str(child.getAttribute('data-media'));
        var s = str(child.getAttribute('src'));
        if (!media && s.indexOf('mc-media:') === 0) media = s.slice(9);
        node = d.createElement('img');
        if (media && MEDIA_ID_RE.test(media)) {
          node.setAttribute('data-media', media);
        } else {
          var u = safeUrl(s, { relative: true });
          if (!u || u.charAt(0) === '#') continue;
          node.setAttribute('src', u);
        }
        node.setAttribute('alt', str(child.getAttribute('alt')).slice(0, 200));
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
      } else {
        node = d.createElement(mapped);
      }
      if (classes.length) node.setAttribute('class', classes.join(' '));
      out.appendChild(node);
      if (mapped !== 'img' && mapped !== 'br' && mapped !== 'hr') walkRich(child, node, d, depth + 1);
    }
  }

  /* 回傳一個只含安全元素的 DocumentFragment（圖片以 data-media 標示，稍後才填入） */
  function sanitizeRich(html, targetDoc) {
    var d = targetDoc || doc;
    var frag = d.createDocumentFragment();
    html = str(html);
    if (!html) return frag;
    if (html.length > 400000) html = html.slice(0, 400000);
    var parsed = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    walkRich(parsed.body, frag, d, 0);
    return frag;
  }

  /* 轉成可儲存的 HTML 字串（在不會載入任何資源的獨立文件中處理） */
  function serializeRich(html) {
    var inert = doc.implementation.createHTMLDocument('');
    var box = inert.createElement('div');
    box.appendChild(sanitizeRich(html, inert));
    $all('img', box).forEach(function (img) {
      if (img.hasAttribute('data-media')) {
        img.setAttribute('src', 'mc-media:' + img.getAttribute('data-media'));
        img.removeAttribute('data-media');
      }
      img.removeAttribute('loading');
      img.removeAttribute('decoding');
    });
    $all('a[target]', box).forEach(function (a) { a.removeAttribute('target'); a.removeAttribute('rel'); });
    return box.innerHTML.replace(/<p><\/p>/g, '');
  }

  function richText(html) {
    var inert = doc.implementation.createHTMLDocument('');
    var box = inert.createElement('div');
    box.appendChild(sanitizeRich(html, inert));
    return box.textContent.replace(/\s+/g, ' ').trim();
  }

  /* ============ 圖片 ============ */
  function fetchMedia(id) {
    return FB && FB.fetchMedia ? FB.fetchMedia(id) : Promise.resolve(null);
  }
  function hydrateMedia(scope) {
    $all('img[data-media]:not([src])', scope).forEach(function (img) {
      img.classList.add('media-loading');
      fetchMedia(img.getAttribute('data-media')).then(function (m) {
        img.classList.remove('media-loading');
        if (!m) { img.classList.add('media-missing'); return; }
        if (!img.getAttribute('alt')) img.setAttribute('alt', m.alt);
        img.src = m.data;
      });
    });
  }
  function fileHref(u) {
    var m = u.match(/^\/(news|privacy)\/?(?:index\.html)?(.*)$/);
    if (m) return ROUTES[m[1]] + m[2];
    return ROUTES.home + u.slice(1).replace(/^index\.html/, '');
  }
  function renderRich(node, html) {
    if (!node) return;
    node.textContent = '';
    node.appendChild(sanitizeRich(html, doc));
    if (IS_FILE) $all('a[href^="/"]', node).forEach(function (a) { a.setAttribute('href', fileHref(a.getAttribute('href'))); });
    hydrateMedia(node);
  }
  /* 圖片欄位：mc-media:ID、https 網址或 /assets/ 路徑 */
  function resolveImage(value) {
    value = str(value).trim();
    if (!value) return Promise.resolve(null);
    if (value.indexOf('mc-media:') === 0) {
      return fetchMedia(value.slice(9)).then(function (m) { return m ? { src: m.data, alt: m.alt } : null; });
    }
    var u = safeUrl(value, { relative: true });
    return Promise.resolve(u && u.charAt(0) !== '#' ? { src: u, alt: '' } : null);
  }
  function setImage(img, value, fallbackSrc) {
    if (!img) return Promise.resolve(false);
    return resolveImage(value).then(function (r) {
      if (r) { img.src = r.src; if (r.alt && !img.getAttribute('data-alt-fixed')) img.alt = r.alt; return true; }
      if (fallbackSrc) img.src = fallbackSrc;
      return false;
    });
  }

  /* ============ 最新消息：排序並確保每則都有固定代號 ============ */
  function newsList(content) {
    var items = (content.news && content.news.items) || [];
    return items.map(function (it, i) {
      var id = MEDIA_ID_RE.test(str(it.id)) ? it.id : ('n' + str(it.date).replace(/\D/g, '') + '-' + i);
      return { id: id, date: str(it.date), title: str(it.title), cover: str(it.cover), summary: str(it.summary), body: str(it.body) };
    }).filter(function (it) { return it.title.trim(); })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function fmtDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '.') : d; }

  /* ============ 提示訊息 ============ */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 3600);
  }

  /* ============ 共用版面：品牌、選單、頁尾、聯絡方式 ============ */
  var PALETTES = ['mist', 'sky', 'ivory'];
  function renderChrome(content, pageTitle) {
    var site = content.site || {};
    root.setAttribute('data-palette', PALETTES.indexOf(site.palette) !== -1 ? site.palette : 'mist');
    if (pageTitle) doc.title = pageTitle;
    var meta = $('meta[name="description"]');
    if (meta && site.description && doc.body.classList.contains('page-home')) meta.setAttribute('content', site.description);

    $all('[data-cms]').forEach(function (n) {
      var v = str(get(content, n.getAttribute('data-cms')));
      if (n.hasAttribute('data-cms-fallback') && !v) v = n.getAttribute('data-cms-fallback');
      n.textContent = v;
    });
    $all('[data-cms-rich]').forEach(function (n) { renderRich(n, get(content, n.getAttribute('data-cms-rich'))); });

    $all('[data-route]').forEach(function (a) {
      var h = a.getAttribute('data-hash');
      a.setAttribute('href', href(a.getAttribute('data-route')) + (h ? '#' + h : ''));
    });

    var sections = content.sections || {};
    $all('[data-section-key]').forEach(function (n) {
      setShown(n, sections[n.getAttribute('data-section-key')] !== false);
    });

    $all('[data-href]').forEach(function (a) {
      var url = safeUrl(get(content, a.getAttribute('data-href')));
      var social = a.classList.contains('social-link');
      if (a.classList.contains('store-badge') || social) {
        // App 商店徽章與社群圖示：沒有網址時仍顯示，點擊會提示「即將上架／即將開放」
        if (url) {
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.classList.remove('is-soon'); a.removeAttribute('aria-disabled');
          if (social) a.title = a.getAttribute('aria-label') || ''; else a.removeAttribute('title');
        } else {
          a.href = href('home') + '#app'; a.removeAttribute('target');
          a.classList.add('is-soon'); a.setAttribute('aria-disabled', 'true');
          a.title = social ? (a.getAttribute('aria-label') || '') + '（即將開放）' : '即將上架';
        }
      } else if (url) {
        a.href = url; setShown(a, true);
      } else {
        setShown(a, false);
      }
    });
    // 可在後台關閉的元素（例如 LINE 按鈕）
    $all('[data-show]').forEach(function (n) {
      if (get(content, n.getAttribute('data-show')) === false) setShown(n, false);
    });
    $all('[data-tel]').forEach(function (a) {
      var dial = str(get(content, a.getAttribute('data-tel'))).replace(/[^\d+]/g, '');
      if (dial.replace(/\D/g, '').length >= 6) a.href = 'tel:' + dial; else a.removeAttribute('href');
    });
    $all('[data-mailto]').forEach(function (a) {
      var m = str(get(content, a.getAttribute('data-mailto'))).trim();
      if (/^[^@\s?&<>"]+@[^@\s?&<>"]+\.[^@\s?&<>"]+$/.test(m)) a.href = 'mailto:' + m; else a.removeAttribute('href');
    });
    $all('[data-map]').forEach(function (a) {
      var addr = str(get(content, a.getAttribute('data-map'))).trim();
      if (addr && addr.indexOf('請於管理後台') === -1) a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
      else a.removeAttribute('href');
    });
    $all('img[data-img]').forEach(function (img) {
      var fb = img.getAttribute('data-fallback') || '';
      setImage(img, get(content, img.getAttribute('data-img')), fb);
    });
    $all('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });
    renderCounter(content);
  }

  /* ============ 頁尾瀏覽人次（匿名累計：同一瀏覽器 30 分鐘內只算一次，不記錄任何個人資料） ============ */
  var VISIT_GAP = 30 * 60 * 1000;
  var visitCount = null;
  var visitJob = null;
  function loadVisits() {
    if (visitJob) return visitJob;
    if (!FB || !FB.isConfigured() || !FB.fetchVisits || !FB.incrementVisits) { visitJob = Promise.resolve(null); return visitJob; }
    var job;
    if (EDIT) {
      job = FB.fetchVisits(6000);
    } else {
      var now = Date.now();
      var last = parseInt(lsGet('mc-visit-at') || '0', 10) || 0;
      lsSet('mc-visit-at', String(now));
      var isNewVisit = !(last > 0 && now >= last && now - last < VISIT_GAP);
      job = isNewVisit
        ? FB.incrementVisits(8000).then(function (n) { return n != null ? n : FB.fetchVisits(6000); })
        : FB.fetchVisits(6000);
    }
    visitJob = job.then(function (n) {
      visitCount = typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : null;
      return visitCount;
    }, function () { return null; });
    return visitJob;
  }
  function renderCounter(content) {
    var wrap = $('[data-counter]');
    if (!wrap) return;
    var on = !(content && content.footer && content.footer.showCounter === false);
    var num = $('[data-visit-count]', wrap);
    if (visitCount == null) {
      if (num) num.textContent = '—';
      if (EDIT) setShown(wrap, on); else wrap.hidden = true;
      return;
    }
    if (num) num.textContent = visitCount.toLocaleString('zh-TW');
    setShown(wrap, on);
  }

  /* ============ 頁首、選單、主題 ============ */
  function initHeader() {
    var header = $('#site-header');
    if (!header) return;
    var toggle = $('.nav-toggle', header);
    var nav = $('#main-nav');
    var backTop = $('.back-to-top');
    var sticky = $('.sticky-cta');
    var hero = $('.hero');
    var heroInner = $('.hero-inner');
    var contact = $('#contact');
    var plain = doc.body.classList.contains('page-plain');
    var ticking = false;
    var contactVisible = false;

    if (contact && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { contactVisible = en[0].isIntersecting; onScroll(); }, { threshold: 0.15 }).observe(contact);
    }
    function onScroll() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      if (!plain) header.classList.toggle('is-scrolled', y > 24);
      if (backTop) backTop.classList.toggle('is-visible', y > 700);
      if (sticky) sticky.classList.toggle('is-visible', y > (plain ? 240 : 560) && !contactVisible && !header.classList.contains('nav-open'));
      if (hero && heroInner && !reduceMotion.matches) {
        var hh = hero.offsetHeight || 1;
        if (y < hh) {
          // 數據卡排在文字下方時（手機、平板、較矮的螢幕）不做位移，避免文字滑到卡片後面
          var drift = hero.classList.contains('cards-row') || window.innerWidth < 1024 ? 0 : 0.22;
          heroInner.style.transform = drift ? 'translate3d(0,' + (y * drift).toFixed(1) + 'px,0)' : '';
          heroInner.style.opacity = String(clamp(1 - y / (hh * 0.75), 0, 1));
        }
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    if (!toggle || !nav) return;
    var scrim = el('div', 'nav-scrim');
    doc.body.appendChild(scrim);
    function isOpen() { return header.classList.contains('nav-open'); }
    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      scrim.classList.toggle('is-visible', open);
      root.classList.toggle('nav-lock', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      onScroll();
    }
    toggle.addEventListener('click', function () { setOpen(!isOpen()); });
    scrim.addEventListener('click', function () { setOpen(false); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
    });
    var desktop = window.matchMedia('(min-width: 1024px)');
    var onBp = function () { if (desktop.matches) setOpen(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onBp); else if (desktop.addListener) desktop.addListener(onBp);

    if (doc.body.classList.contains('page-home') && 'IntersectionObserver' in window) {
      var links = $all('a[data-hash]', nav);
      var byId = {};
      links.forEach(function (a) { byId[a.getAttribute('data-hash')] = a; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.removeAttribute('aria-current'); });
          var link = byId[en.target.id];
          if (link) link.setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(byId).forEach(function (id) { var s = doc.getElementById(id); if (s) io.observe(s); });
    }
  }

  function initTheme() {
    var btn = $('.theme-toggle');
    if (!btn) return;
    var meta = $('meta[name="theme-color"]');
    btn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      lsSet('mc-theme', next);
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0B1C29' : '#0B2B3F');
      toast(next === 'dark' ? '已切換為深色模式' : '已切換為淺色模式');
    });
  }

  /* ============ 捲動進場 ============ */
  var revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in-view'); revealIO.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }) : null;
  function observeReveal(scope) {
    $all('.reveal:not(.in-view), .flow-track:not(.in-view)', scope || doc).forEach(function (n) {
      if (revealIO && !reduceMotion.matches && !EDIT) revealIO.observe(n); else n.classList.add('in-view');
    });
  }

  /* ============ 3D 傾斜、磁吸、漣漪 ============ */
  function initPointerEffects() {
    // 按鈕漣漪：所有裝置都有（觸控也看得到按下的回饋）
    doc.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest ? e.target.closest('.btn, .store-badge') : null;
      if (!btn || reduceMotion.matches) return;
      var fx = btn.querySelector(':scope > .btn-fx');
      if (!fx) { fx = el('span', 'btn-fx'); fx.setAttribute('aria-hidden', 'true'); btn.insertBefore(fx, btn.firstChild); }
      var r = btn.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2.2;
      var dot = el('span', 'ripple');
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (e.clientX - r.left - size / 2) + 'px';
      dot.style.top = (e.clientY - r.top - size / 2) + 'px';
      fx.appendChild(dot);
      setTimeout(function () { dot.remove(); }, 700);
    }, { passive: true });

    if (reduceMotion.matches) return;
    var hero = $('.hero');
    var tiltEl = null, magEl = null, lastEvent = null, frame = 0;
    function resetTilt(card) {
      card.classList.remove('is-tilting');
      ['--rx', '--ry', '--sx', '--sy'].forEach(function (p) { card.style.removeProperty(p); });
    }
    function resetMag(b) { b.style.removeProperty('--tx'); b.style.removeProperty('--ty'); }
    function apply() {
      frame = 0;
      var e = lastEvent;
      if (!e) return;
      if (tiltEl) {
        var r = tiltEl.getBoundingClientRect();
        var x = clamp((e.clientX - r.left) / r.width, 0, 1);
        var y = clamp((e.clientY - r.top) / r.height, 0, 1);
        var max = tiltEl.classList.contains('data-card') ? 14 : (tiltEl.classList.contains('app-phone') ? 10 : 9);
        var ry = (x - 0.5) * 2 * max, rx = (0.5 - y) * 2 * max;
        var s = tiltEl.style;
        tiltEl.classList.add('is-tilting');
        s.setProperty('--rx', rx.toFixed(2) + 'deg');
        s.setProperty('--ry', ry.toFixed(2) + 'deg');
        s.setProperty('--sx', (-ry * 0.7).toFixed(1) + 'px');
        s.setProperty('--sy', (rx * 0.7).toFixed(1) + 'px');
        s.setProperty('--mx', (x * 100).toFixed(1) + '%');
        s.setProperty('--my', (y * 100).toFixed(1) + '%');
      }
      if (magEl) {
        var b = magEl.getBoundingClientRect();
        magEl.style.setProperty('--tx', ((e.clientX - (b.left + b.width / 2)) * 0.2).toFixed(1) + 'px');
        magEl.style.setProperty('--ty', ((e.clientY - (b.top + b.height / 2)) * 0.32).toFixed(1) + 'px');
      }
      if (hero) {
        var hr = hero.getBoundingClientRect();
        if (e.clientY >= hr.top && e.clientY <= hr.bottom) {
          hero.style.setProperty('--px', (((e.clientX - hr.left) / hr.width - 0.5) * -24).toFixed(2));
          hero.style.setProperty('--py', (((e.clientY - hr.top) / hr.height - 0.5) * -18).toFixed(2));
        }
      }
    }
    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || !finePointer.matches) return;
      var t = e.target && e.target.closest ? e.target : null;
      var card = t ? t.closest('.tilt') : null;
      if (card !== tiltEl) { if (tiltEl) resetTilt(tiltEl); tiltEl = card; }
      var mag = t ? t.closest('.magnetic') : null;
      if (mag !== magEl) { if (magEl) resetMag(magEl); magEl = mag; }
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(apply);
    }, { passive: true });
    function resetAll() { if (tiltEl) resetTilt(tiltEl); if (magEl) resetMag(magEl); tiltEl = magEl = null; }
    doc.addEventListener('mouseout', function (e) { if (!e.relatedTarget) resetAll(); });
    window.addEventListener('blur', resetAll);
  }

  function initBadges() {
    doc.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('.store-badge.is-soon, .social-link.is-soon') : null;
      if (!a) return;
      e.preventDefault();
      toast(a.classList.contains('social-link') ? '社群帳號即將開放，敬請期待！' : 'App 即將上架，敬請期待！');
    });
  }

  /* ============ 視覺化編輯模式 ============ */
  var EDIT_SEL = '[data-edit], [data-cms], [data-cms-rich], img[data-img], [data-href], [data-card-meta]';
  var EDIT_PASS = '.carousel-btn, .carousel-dots button, .nav-toggle, .theme-toggle';
  function editKeyOf(n) {
    return n.getAttribute('data-edit') || n.getAttribute('data-cms') || n.getAttribute('data-cms-rich') ||
      n.getAttribute('data-img') || n.getAttribute('data-href') || n.getAttribute('data-card-meta') || '';
  }
  function editTargetOf(node) {
    if (!node || !node.closest) return null;
    var n = node.closest(EDIT_SEL);
    if (n) return { node: n, key: editKeyOf(n) };
    var sec = node.closest('[data-section-key]');
    if (sec) return { node: sec, key: sec.getAttribute('data-section-key') };
    return null;
  }
  function initEditMode(apply) {
    var parentWin = window.parent;
    var labels = {};
    var selectedNode = null, selectedKey = '', hoverNode = null;
    var chip = el('div', 'mc-edit-chip');
    chip.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(chip);
    root.classList.add('mc-editing');

    function post(msg) { try { parentWin.postMessage(msg, window.location.origin); } catch (e) { /* ignore */ } }
    function labelFor(key) {
      var parts = String(key).split('.');
      while (parts.length) {
        var l = labels[parts.join('.')];
        if (typeof l === 'string' && l) return l;
        parts.pop();
      }
      return '點選以編輯';
    }
    function placeChip(node) {
      if (!node) { chip.classList.remove('is-visible'); return; }
      var r = node.getBoundingClientRect();
      chip.textContent = '✎ ' + labelFor(editKeyOf(node) || node.getAttribute('data-section-key') || '');
      chip.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 220)) + 'px';
      chip.style.top = Math.max(4, r.top - 26) + 'px';
      chip.classList.add('is-visible');
    }
    function setHover(n) {
      if (hoverNode === n) return;
      if (hoverNode) hoverNode.classList.remove('mc-hover');
      hoverNode = n;
      if (n) n.classList.add('mc-hover');
      placeChip(n);
    }
    function findByKey(key) {
      if (!key) return null;
      var sel = ['data-edit', 'data-cms', 'data-cms-rich', 'data-img', 'data-href', 'data-card-meta', 'data-section-key']
        .map(function (a) { return '[' + a + '="' + String(key).replace(/["\\]/g, '') + '"]'; }).join(',');
      var list = $all(sel).filter(function (n) { return n.offsetParent !== null || n.getClientRects().length; });
      return list[0] || null;
    }
    function select(node, key, scroll) {
      $all('.mc-selected').forEach(function (n) { n.classList.remove('mc-selected'); });
      selectedKey = key || '';
      selectedNode = node || null;
      if (node) {
        node.classList.add('mc-selected');
        if (scroll && node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }
    function reselect() {
      if (!selectedKey) return;
      var n = selectedNode && selectedNode.isConnected ? selectedNode : findByKey(selectedKey);
      select(n, selectedKey, false);
    }

    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest(EDIT_PASS)) return;
      e.preventDefault();
      e.stopPropagation();
      var hit = editTargetOf(t);
      if (!hit || !hit.key) return;
      select(hit.node, hit.key, false);
      post({ mc: 'select', key: hit.key });
    }, true);
    ['submit', 'auxclick', 'dragstart'].forEach(function (type) {
      doc.addEventListener(type, function (e) { e.preventDefault(); e.stopPropagation(); }, true);
    });
    doc.addEventListener('pointerover', function (e) {
      var hit = editTargetOf(e.target);
      setHover(hit ? hit.node : null);
    }, { passive: true });
    root.addEventListener('pointerleave', function () { setHover(null); });
    window.addEventListener('scroll', function () { if (hoverNode) placeChip(hoverNode); }, { passive: true });

    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin || e.source !== parentWin) return;
      var d = e.data;
      if (!isObj(d)) return;
      if (d.mc === 'content' && isObj(d.content)) {
        if (isObj(d.labels)) labels = d.labels;
        apply(merge(DEFAULTS, d.content));
        reselect();
      } else if (d.mc === 'select' && typeof d.key === 'string') {
        var n = findByKey(d.key);
        select(n, d.key, !!n);
      }
    });
    post({ mc: 'ready' });
  }

  /* ============ 啟動：載入內容 → 顯示 → 取得最新內容 ============ */
  var readyDone = false;
  function markReady() {
    if (readyDone) return;
    readyDone = true;
    doc.body.classList.add('is-ready');
  }

  function start(opts) {
    initHeader();
    initTheme();
    initPointerEffects();
    initBadges();

    var cached = null;
    try { cached = JSON.parse(lsGet(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
    var content = withDefaults(isObj(cached) ? cached : null);
    function render(c) {
      renderChrome(c, opts.title ? opts.title(c) : '');
      if (opts.render) opts.render(c);
      observeReveal(doc);
    }
    if (EDIT) {
      // 預覽框內：內容由管理後台即時傳入；不讀取暫存、不計入瀏覽人次
      content = merge(DEFAULTS, null);
      render(content);
      if (opts.afterFirstRender) opts.afterFirstRender(content);
      loadVisits().then(function () { renderCounter(content); });
      initEditMode(function (c) { content = c; render(c); });
      markReady();
      return;
    }

    render(content);
    if (opts.afterFirstRender) opts.afterFirstRender(content);
    loadVisits().then(function () { renderCounter(content); });

    if (FB && FB.isConfigured()) {
      if (cached) markReady();
      setTimeout(markReady, 1200);
      FB.fetchSiteContent(6000).then(function (remote) {
        if (remote) {
          lsSet(CACHE_KEY, JSON.stringify(remote));
          var fresh = withDefaults(remote);
          if (JSON.stringify(fresh) !== JSON.stringify(content)) { content = fresh; render(content); }
        }
        markReady();
      });
    } else {
      lsDel(CACHE_KEY);
      markReady();
    }
  }

  window.MC = {
    $: $, $all: $all, el: el, isObj: isObj, str: str, get: get, clamp: clamp, pad2: pad2, charLen: charLen,
    lsGet: lsGet, lsSet: lsSet, href: href, merge: merge, withDefaults: withDefaults, blankOf: blankOf, safeUrl: safeUrl,
    sanitizeRich: sanitizeRich, serializeRich: serializeRich, richText: richText, renderRich: renderRich,
    hydrateMedia: hydrateMedia, resolveImage: resolveImage, setImage: setImage, toast: toast,
    newsList: newsList, fmtDate: fmtDate, setShown: setShown, EDIT: EDIT,
    observeReveal: observeReveal, start: start, reduceMotion: reduceMotion, finePointer: finePointer,
    DEFAULTS: DEFAULTS, FB: FB, MEDIA_ID_RE: MEDIA_ID_RE
  };
})();
