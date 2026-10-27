/*
 * 內頁程式：最新消息（列表與單篇文章）、隱私權政策
 * 網址：myopiacare.site/news/、myopiacare.site/news/?id=代號、myopiacare.site/privacy/
 */
(function () {
  'use strict';

  var MC = window.MC;
  if (!MC) return;
  var doc = document;
  var $ = MC.$, el = MC.el, str = MC.str;
  var isNews = doc.body.classList.contains('page-news');
  var isPrivacy = doc.body.classList.contains('page-privacy');
  var params = new URLSearchParams(window.location.search);
  var articleId = params.get('id') || '';
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function findArticle(c) {
    if (!articleId) return null;
    var list = MC.newsList(c);
    for (var i = 0; i < list.length; i++) if (list[i].id === articleId) return { item: list[i], index: i, list: list };
    return { item: null, index: -1, list: list };
  }

  function setCrumb(c, current) {
    var crumb = $('#crumb-current');
    if (crumb) crumb.textContent = current;
    var mid = $('#crumb-mid');
    if (mid) mid.hidden = !articleId;
  }

  function cover(it, cls) {
    var wrap = el('div', cls);
    if (str(it.cover).trim()) {
      var img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      wrap.appendChild(img);
      MC.setImage(img, it.cover).then(function (ok) { if (!ok) { img.remove(); wrap.classList.add('no-image'); } });
    } else {
      wrap.classList.add('no-image');
      var d = el('span', 'cover-date', MC.fmtDate(it.date));
      d.setAttribute('aria-hidden', 'true');
      wrap.appendChild(d);
    }
    return wrap;
  }

  function renderList(c, view) {
    var list = MC.newsList(c);
    $('#page-title').textContent = c.news.title;
    $('#page-title').setAttribute('data-edit', 'news.title');
    $('#page-intro').textContent = c.news.intro;
    $('#page-intro').setAttribute('data-edit', 'news.intro');
    setCrumb(c, c.news.title);
    if (!list.length) { var none = el('p', 'news-empty', '目前沒有最新消息。'); none.setAttribute('data-edit', 'news.items'); view.appendChild(none); return; }
    var grid = el('ul', 'news-cards');
    list.forEach(function (it) {
      var li = el('li', 'reveal');
      li.setAttribute('data-edit', 'news.items.@' + it.id);
      var a = el('a', 'news-card');
      a.href = MC.href('news', it.id);
      a.appendChild(cover(it, 'news-card-cover'));
      var body = el('div', 'news-card-body');
      var t = el('time', null, MC.fmtDate(it.date));
      if (/^\d{4}-\d{2}-\d{2}$/.test(it.date)) t.setAttribute('datetime', it.date);
      body.appendChild(t);
      body.appendChild(el('h2', null, it.title));
      if (it.summary.trim()) body.appendChild(el('p', null, it.summary));
      var more = el('span', 'read-more', '閱讀全文');
      more.insertAdjacentHTML('beforeend', ARROW);
      body.appendChild(more);
      a.appendChild(body);
      li.appendChild(a);
      grid.appendChild(li);
    });
    view.appendChild(grid);
  }

  function renderArticle(c, view, found) {
    var back = el('a', 'back-link', '返回' + c.news.title);
    back.href = MC.href('news');
    if (!found.item) {
      $('#page-title').textContent = '找不到這則消息';
      $('#page-title').setAttribute('data-edit', 'news.items');
      $('#page-intro').setAttribute('data-edit', 'news.items');
      $('#page-intro').textContent = '這則消息可能已經下架或網址有誤。';
      setCrumb(c, '找不到消息');
      view.appendChild(back);
      return;
    }
    var it = found.item;
    var editKey = 'news.items.@' + it.id;
    $('#page-title').textContent = it.title;
    $('#page-title').setAttribute('data-edit', editKey);
    $('#page-intro').setAttribute('data-edit', editKey);
    var intro = $('#page-intro');
    intro.textContent = '';
    var t = el('time', null, MC.fmtDate(it.date));
    if (/^\d{4}-\d{2}-\d{2}$/.test(it.date)) t.setAttribute('datetime', it.date);
    intro.appendChild(t);
    setCrumb(c, it.title);

    var art = el('article', 'article');
    art.setAttribute('data-edit', editKey);
    if (str(it.cover).trim()) art.appendChild(cover(it, 'article-cover'));
    var body = el('div', 'rich article-body');
    if (it.body.trim()) MC.renderRich(body, it.body); else body.appendChild(el('p', null, it.summary));
    art.appendChild(body);
    view.appendChild(art);

    var nav = el('nav', 'article-nav');
    nav.setAttribute('aria-label', '其他消息');
    var newer = found.list[found.index - 1];
    var older = found.list[found.index + 1];
    if (newer) { var n = el('a', 'article-nav-link prev'); n.href = MC.href('news', newer.id); n.appendChild(el('small', null, '較新的消息')); n.appendChild(el('span', null, newer.title)); nav.appendChild(n); }
    if (older) { var o = el('a', 'article-nav-link next'); o.href = MC.href('news', older.id); o.appendChild(el('small', null, '較早的消息')); o.appendChild(el('span', null, older.title)); nav.appendChild(o); }
    view.appendChild(nav);
    view.appendChild(back);
    var canon = $('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', 'https://myopiacare.site/news/?id=' + encodeURIComponent(it.id));
  }

  function renderNewsPage(c) {
    var view = $('#news-view');
    if (!view) return;
    view.textContent = '';
    if (articleId) renderArticle(c, view, findArticle(c));
    else renderList(c, view);
  }

  function title(c) {
    var brand = c.brand.nameZh || 'MyopiaCare';
    if (isNews) {
      var f = findArticle(c);
      if (f && f.item) return f.item.title + '｜' + brand;
      if (f && !f.item) return '找不到消息｜' + brand;
      return c.news.title + '｜' + brand;
    }
    if (isPrivacy) return c.privacy.title + '｜' + brand;
    return brand;
  }

  function boot() {
    MC.start({
      title: title,
      render: function (c) {
        if (isNews) renderNewsPage(c);
        if (isPrivacy) setCrumb(c, c.privacy.title);
      }
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
