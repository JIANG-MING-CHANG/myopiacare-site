/*
 * 管理後台元件：圖片庫（存放在 Firestore，免費方案可用）、格式文字編輯器、圖片欄位
 * 所有輸出都會再經過 core.js 的白名單過濾，前台顯示時也會再過濾一次（雙重防護）。
 */
(function () {
  'use strict';

  var MC = window.MC;
  if (!MC) return;
  var doc = document;
  var $ = MC.$, $all = MC.$all, el = MC.el, str = MC.str, toast = MC.toast;

  function escAttr(s) { return str(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  /* =========================================================
     圖片處理：在瀏覽器內縮圖與壓縮，避免上傳過大的原始照片
     ========================================================= */
  var MAX_DATA = 900000;      // 單張圖片資料上限（字元），Firestore 每份文件上限 1 MB
  var MAX_INPUT = 25 * 1048576;
  var webpOK = null;
  function canWebp() {
    if (webpOK === null) {
      try { var c = doc.createElement('canvas'); c.width = c.height = 2; webpOK = c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { webpOK = false; }
    }
    return webpOK;
  }
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }
  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('decode')); };
        img.src = String(reader.result);
      };
      reader.onerror = function () { reject(new Error('read')); };
      reader.readAsDataURL(file);
    });
  }
  function render(src, maxSide, quality, type) {
    var w = src.width, h = src.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var c = doc.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch);
    return { data: c.toDataURL(type, quality), w: cw, h: ch };
  }
  function compress(file) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      return Promise.reject(new Error('「' + file.name + '」格式不支援，請使用 JPG、PNG、WebP 或 GIF（iPhone 的 HEIC 照片請先轉成 JPG）。'));
    }
    if (file.size > MAX_INPUT) return Promise.reject(new Error('「' + file.name + '」超過 25 MB，請先縮小。'));
    return decode(file).then(function (src) {
      var type = canWebp() ? 'image/webp' : 'image/jpeg';
      var tries = [[1600, 0.84], [1600, 0.74], [1280, 0.74], [1280, 0.64], [1024, 0.62], [800, 0.6]];
      var out = null;
      for (var i = 0; i < tries.length; i++) {
        out = render(src, tries[i][0], tries[i][1], type);
        if (out.data.length <= MAX_DATA) break;
      }
      if (!out || out.data.length > MAX_DATA) throw new Error('「' + file.name + '」壓縮後仍太大，請換一張較小的圖片。');
      var thumb = render(src, 360, 0.7, type);
      if (src.close) src.close();
      return { data: out.data, thumb: thumb.data, w: out.w, h: out.h, bytes: Math.round(out.data.length * 0.75) };
    }, function () {
      throw new Error('無法讀取「' + file.name + '」，檔案可能已損壞或格式不支援。');
    });
  }

  /* =========================================================
     圖片庫
     ========================================================= */
  var MediaLib = {
    ctx: null,
    items: null,
    init: function (ctx) { this.ctx = ctx; this.items = null; },
    load: function (force) {
      var self = this;
      if (self.items && !force) return Promise.resolve(self.items);
      var fs = self.ctx.fs, db = self.ctx.db;
      return fs.getDocs(fs.query(fs.collection(db, 'mediaIndex'), fs.orderBy('createdAt', 'desc'), fs.limit(300))).then(function (snap) {
        self.items = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        return self.items;
      });
    },
    upload: function (files, onStatus) {
      var self = this;
      var fs = self.ctx.fs, db = self.ctx.db;
      var list = Array.prototype.slice.call(files || []).slice(0, 20);
      var done = [];
      var chain = Promise.resolve();
      list.forEach(function (file, i) {
        chain = chain.then(function () {
          if (onStatus) onStatus('處理中（' + (i + 1) + ' / ' + list.length + '）：' + file.name);
          return compress(file).then(function (r) {
            var ref = fs.doc(fs.collection(db, 'media'));
            var name = file.name.replace(/[^\w一-鿿 .()-]/g, '').slice(0, 100) || 'image';
            var meta = { alt: '', name: name, w: r.w, h: r.h, bytes: r.bytes };
            var b = fs.writeBatch(db);
            b.set(ref, Object.assign({ data: r.data, createdAt: fs.serverTimestamp(), createdBy: self.ctx.email || '' }, meta));
            b.set(fs.doc(db, 'mediaIndex', ref.id), Object.assign({ thumb: r.thumb, createdAt: fs.serverTimestamp() }, meta));
            return b.commit().then(function () {
              var item = Object.assign({ id: ref.id, thumb: r.thumb }, meta);
              if (self.items) self.items.unshift(item);
              done.push(item);
            });
          }).catch(function (err) {
            toast(err && err.code === 'permission-denied' ? '上傳被拒絕：請確認 firestore.rules 已更新並發布。' : (err.message || '上傳失敗'));
          });
        });
      });
      return chain.then(function () { return done; });
    },
    remove: function (id) {
      var self = this;
      var fs = self.ctx.fs, db = self.ctx.db;
      var b = fs.writeBatch(db);
      b.delete(fs.doc(db, 'media', id));
      b.delete(fs.doc(db, 'mediaIndex', id));
      return b.commit().then(function () {
        if (self.items) self.items = self.items.filter(function (it) { return it.id !== id; });
      });
    },
    setAlt: function (id, alt) {
      var self = this;
      var fs = self.ctx.fs, db = self.ctx.db;
      alt = str(alt).trim().slice(0, 200);
      var b = fs.writeBatch(db);
      b.update(fs.doc(db, 'media', id), { alt: alt });
      b.update(fs.doc(db, 'mediaIndex', id), { alt: alt });
      return b.commit().then(function () {
        (self.items || []).forEach(function (it) { if (it.id === id) it.alt = alt; });
      });
    },

    /* 圖片格狀列表：mode = 'pick'（挑選）或 'manage'（管理） */
    renderGrid: function (container, opts) {
      var self = this;
      opts = opts || {};
      container.textContent = '';
      var wrap = el('div', 'media-wrap');
      var up = el('div', 'media-upload');
      var label = el('label', 'btn btn-3d btn-primary btn-sm file-btn', '上傳圖片');
      var input = el('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/png,image/jpeg,image/webp,image/gif';
      label.appendChild(input);
      up.appendChild(label);
      up.appendChild(el('span', 'media-hint', '也可以把圖片拖曳到這裡。系統會自動縮小並壓縮，請在下方填寫圖片說明（無障礙與搜尋引擎都會用到）。'));
      wrap.appendChild(up);
      var status = el('p', 'form-status media-status');
      status.setAttribute('role', 'status');
      wrap.appendChild(status);
      var grid = el('ul', 'media-grid');
      wrap.appendChild(grid);
      container.appendChild(wrap);
      var selected = opts.selectedId || '';

      function setStatus(msg, kind) { status.textContent = msg || ''; status.className = 'form-status media-status' + (kind ? ' is-' + kind : ''); }
      function draw() {
        grid.textContent = '';
        var items = self.items || [];
        if (!items.length) { grid.appendChild(el('li', 'media-empty', '圖片庫還沒有圖片，請先上傳。')); return; }
        items.forEach(function (it) {
          var li = el('li', 'media-item' + (it.id === selected ? ' is-selected' : ''));
          var pickBtn = el('button', 'media-thumb');
          pickBtn.type = 'button';
          pickBtn.dataset.id = it.id;
          pickBtn.setAttribute('aria-pressed', String(it.id === selected));
          pickBtn.setAttribute('aria-label', (opts.mode === 'pick' ? '選擇圖片：' : '圖片：') + (it.alt || it.name || it.id));
          var img = el('img');
          img.alt = '';
          img.loading = 'lazy';
          if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(str(it.thumb))) img.src = it.thumb;
          pickBtn.appendChild(img);
          li.appendChild(pickBtn);
          var meta = el('div', 'media-meta');
          var alt = el('input', 'media-alt');
          alt.type = 'text';
          alt.maxLength = 200;
          alt.placeholder = '圖片說明（例如：眼軸紀錄圖表畫面）';
          alt.value = str(it.alt);
          alt.setAttribute('aria-label', '圖片說明');
          alt.addEventListener('change', function () {
            self.setAlt(it.id, alt.value).then(function () { toast('圖片說明已儲存。'); }, function (err) { toast('儲存失敗：' + (err.code || '')); });
          });
          meta.appendChild(alt);
          meta.appendChild(el('small', null, (it.w && it.h ? it.w + '×' + it.h + ' · ' : '') + kb(it.bytes || 0)));
          li.appendChild(meta);
          if (opts.mode === 'manage') {
            var del = el('button', 'mini-btn danger media-del', '✕');
            del.type = 'button';
            del.setAttribute('aria-label', '刪除這張圖片');
            del.addEventListener('click', function () {
              if (!window.confirm('刪除後，網站上使用這張圖片的地方會變成空白。確定刪除？')) return;
              self.remove(it.id).then(function () { draw(); toast('圖片已刪除。'); }, function (err) { toast('刪除失敗：' + (err.code || '')); });
            });
            li.appendChild(del);
          }
          grid.appendChild(li);
        });
      }
      grid.addEventListener('click', function (e) {
        var b = e.target.closest('.media-thumb');
        if (!b) return;
        selected = b.dataset.id;
        $all('.media-item', grid).forEach(function (li) {
          var on = $('.media-thumb', li).dataset.id === selected;
          li.classList.toggle('is-selected', on);
          $('.media-thumb', li).setAttribute('aria-pressed', String(on));
        });
        if (opts.onSelect) opts.onSelect(selected);
      });
      grid.addEventListener('dblclick', function (e) {
        var b = e.target.closest('.media-thumb');
        if (b && opts.onPick) opts.onPick(b.dataset.id);
      });
      function handleFiles(files) {
        if (!files || !files.length) return;
        setStatus('上傳中…');
        self.upload(files, setStatus).then(function (added) {
          draw();
          setStatus(added.length ? '已上傳 ' + added.length + ' 張圖片。' : '沒有圖片上傳成功。', added.length ? 'success' : 'error');
          if (added.length && opts.mode === 'pick') {
            selected = added[0].id;
            draw();
            if (opts.onSelect) opts.onSelect(selected);
          }
        });
      }
      input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
      wrap.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('is-drop'); });
      wrap.addEventListener('dragleave', function () { wrap.classList.remove('is-drop'); });
      wrap.addEventListener('drop', function (e) {
        e.preventDefault();
        wrap.classList.remove('is-drop');
        handleFiles(e.dataTransfer && e.dataTransfer.files);
      });
      setStatus('讀取圖片庫…');
      self.load().then(function () { setStatus(''); draw(); }, function (err) {
        setStatus('無法讀取圖片庫（' + (err.code || '錯誤') + '），請確認 firestore.rules 已更新並發布。', 'error');
      });
    },

    /* 開啟挑選視窗，回傳 { id, data, alt } 或 null */
    pick: function (currentId) {
      var self = this;
      var dialog = $('#media-dialog');
      var useBtn = $('#media-use');
      return new Promise(function (resolve) {
        var chosen = '';
        var finished = false;
        function finish(val) {
          if (finished) return;
          finished = true;
          useBtn.removeEventListener('click', onUse);
          dialog.removeEventListener('close', onClose);
          if (dialog.open) dialog.close();
          resolve(val);
        }
        function use(id) {
          if (!id) return;
          useBtn.disabled = true;
          MC.FB.fetchMedia(id).then(function (m) {
            if (!m) { toast('讀取圖片失敗，請稍後再試。'); useBtn.disabled = false; return; }
            var meta = (self.items || []).filter(function (it) { return it.id === id; })[0] || {};
            finish({ id: id, data: m.data, alt: meta.alt || m.alt || '' });
          });
        }
        function onUse() { use(chosen); }
        function onClose() { finish(null); }
        useBtn.disabled = true;
        useBtn.addEventListener('click', onUse);
        dialog.addEventListener('close', onClose);
        self.renderGrid($('#media-picker'), {
          mode: 'pick',
          selectedId: currentId,
          onSelect: function (id) { chosen = id; useBtn.disabled = !id; },
          onPick: function (id) { chosen = id; use(id); }
        });
        if (currentId) { chosen = currentId; useBtn.disabled = false; }
        dialog.showModal();
      });
    }
  };

  /* 對話框的關閉按鈕 */
  doc.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('[data-close]') : null;
    if (!c) return;
    var d = c.closest('dialog');
    if (d && d.open) d.close();
  });

  /* =========================================================
     圖片欄位（Logo、封面、醫師照片…）
     ========================================================= */
  function ImageField(id, value, onChange) {
    var box = el('div', 'img-field');
    var preview = el('div', 'img-preview');
    var img = el('img');
    img.alt = '';
    preview.appendChild(img);
    var empty = el('span', 'img-empty', '未設定（使用預設）');
    preview.appendChild(empty);
    var actions = el('div', 'img-actions');
    var pick = el('button', 'btn btn-sm btn-dark btn-3d', '選擇／上傳圖片');
    pick.type = 'button';
    pick.id = id;
    var clear = el('button', 'btn btn-sm btn-outline', '移除');
    clear.type = 'button';
    actions.appendChild(pick);
    actions.appendChild(clear);
    var adv = el('details', 'img-adv');
    adv.appendChild(el('summary', null, '進階：使用圖片網址'));
    var urlInput = el('input');
    urlInput.type = 'text';
    urlInput.inputMode = 'url';
    urlInput.spellcheck = false;
    urlInput.placeholder = 'https://… 或 /assets/img/檔名.jpg';
    urlInput.setAttribute('aria-label', '圖片網址');
    adv.appendChild(urlInput);
    box.appendChild(preview);
    box.appendChild(actions);
    box.appendChild(adv);

    function show(v) {
      value = str(v);
      urlInput.value = value.indexOf('mc-media:') === 0 ? '' : value;
      clear.hidden = !value;
      if (!value) { img.hidden = true; img.removeAttribute('src'); empty.hidden = false; return; }
      MC.resolveImage(value).then(function (r) {
        if (r) { img.src = r.src; img.hidden = false; empty.hidden = true; }
        else { img.hidden = true; empty.hidden = false; empty.textContent = '找不到這張圖片'; }
      });
    }
    pick.addEventListener('click', function () {
      var cur = value.indexOf('mc-media:') === 0 ? value.slice(9) : '';
      MediaLib.pick(cur).then(function (r) {
        if (!r) return;
        show('mc-media:' + r.id);
        onChange(value);
      });
    });
    clear.addEventListener('click', function () { show(''); onChange(''); });
    urlInput.addEventListener('change', function () {
      var v = urlInput.value.trim();
      if (v && !MC.safeUrl(v, { relative: true })) { toast('網址格式不正確：請用 https:// 開頭，或 /assets/ 開頭的站內路徑。'); return; }
      show(v);
      onChange(v);
    });
    show(value);
    return box;
  }

  /* =========================================================
     格式文字編輯器
     ========================================================= */
  var ICON = function (p) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };
  var TOOLS = [
    { g: 'block', items: [
      { block: 'p', text: '內文', title: '一般內文' },
      { block: 'h3', text: '大標', title: '大標題' },
      { block: 'h4', text: '小標', title: '小標題' },
      { block: 'blockquote', html: ICON('M7 7h4v4H8l-1 4M14 7h4v4h-3l-1 4'), title: '引言框' }
    ] },
    { g: 'inline', items: [
      { cmd: 'bold', html: '<b>B</b>', title: '粗體（Ctrl+B）' },
      { cmd: 'italic', html: '<i>I</i>', title: '斜體（Ctrl+I）' },
      { cmd: 'underline', html: '<u>U</u>', title: '底線（Ctrl+U）' },
      { wrap: 'hl', html: '<span class="sw sw-hl">螢</span>', title: '螢光標示（先選取文字）' },
      { wrap: 'tc-brand', html: '<span class="sw sw-brand">A</span>', title: '品牌藍色字' },
      { wrap: 'tc-green', html: '<span class="sw sw-green">A</span>', title: '綠色字' },
      { wrap: 'tc-muted', html: '<span class="sw sw-muted">A</span>', title: '灰色小註' }
    ] },
    { g: 'list', items: [
      { cmd: 'insertUnorderedList', html: ICON('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'), title: '項目清單' },
      { cmd: 'insertOrderedList', html: ICON('M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 13.5c.6-.8 2.5-.9 2.5.4 0 1-2.5 2-2.5 3.1h2.6'), title: '編號清單' },
      { align: '', html: ICON('M4 6h16M4 10h10M4 14h16M4 18h10'), title: '靠左' },
      { align: 'ta-center', html: ICON('M4 6h16M7 10h10M4 14h16M7 18h10'), title: '置中' },
      { align: 'ta-right', html: ICON('M4 6h16M10 10h10M4 14h16M10 18h10'), title: '靠右' }
    ] },
    { g: 'insert', items: [
      { action: 'link', html: ICON('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'), title: '插入連結（先選取文字）' },
      { action: 'unlink', html: ICON('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66M4 4l16 16'), title: '移除連結' },
      { action: 'image', html: ICON('M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01'), title: '插入圖片' },
      { cmd: 'insertHorizontalRule', html: ICON('M4 12h16'), title: '分隔線' }
    ] },
    { g: 'history', items: [
      { action: 'clear', html: ICON('M6 6l12 12M5 19h9M9 5h10M14 5l-4 14'), title: '清除格式' },
      { cmd: 'undo', html: ICON('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'), title: '復原（Ctrl+Z）' },
      { cmd: 'redo', html: ICON('M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3'), title: '重做' }
    ] }
  ];
  var IMG_TOOLS = [
    { size: 'img-full', text: '滿版' },
    { size: 'img-half', text: '半寬置中' },
    { size: 'img-left', text: '靠左繞排' },
    { size: 'img-right', text: '靠右繞排' },
    { act: 'alt', text: '圖片說明' },
    { act: 'remove', text: '刪除圖片' }
  ];
  var BLOCK_SEL = 'p, h3, h4, li, blockquote, figure';

  function displayHtml(html) {
    var inert = doc.implementation.createHTMLDocument('');
    var box = inert.createElement('div');
    box.appendChild(MC.sanitizeRich(html, inert));
    return box.innerHTML;
  }

  function RichEditor(id, value, onChange) {
    var wrap = el('div', 'rte');
    var bar = el('div', 'rte-toolbar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '文字格式工具列');
    var imgBar = el('div', 'rte-imgbar');
    imgBar.hidden = true;
    var area = el('div', 'rte-area rich');
    area.id = id;
    area.contentEditable = 'true';
    area.setAttribute('role', 'textbox');
    area.setAttribute('aria-multiline', 'true');
    area.spellcheck = true;
    var savedRange = null;
    var selectedImg = null;
    var timer = 0;

    TOOLS.forEach(function (group) {
      var g = el('div', 'rte-group');
      group.items.forEach(function (t) {
        var b = el('button', 'rte-btn');
        b.type = 'button';
        b.title = t.title;
        b.setAttribute('aria-label', t.title);
        if (t.html) b.innerHTML = t.html; else b.textContent = t.text;
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { run(t); });
        g.appendChild(b);
      });
      bar.appendChild(g);
    });
    IMG_TOOLS.forEach(function (t) {
      var b = el('button', 'rte-btn rte-text', t.text);
      b.type = 'button';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { imageTool(t); });
      imgBar.appendChild(b);
    });
    wrap.appendChild(bar);
    wrap.appendChild(imgBar);
    wrap.appendChild(area);

    area.innerHTML = displayHtml(value);
    MC.hydrateMedia(area);

    function changed() {
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    }
    function flush() {
      clearTimeout(timer);
      var html = MC.serializeRich(area.innerHTML);
      if (html !== value) { value = html; onChange(html); }
    }
    function inArea(node) { return node && (node === area || area.contains(node)); }
    function saveRange() {
      var sel = window.getSelection();
      if (sel.rangeCount && inArea(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreRange() {
      area.focus();
      var sel = window.getSelection();
      sel.removeAllRanges();
      if (savedRange) sel.addRange(savedRange);
      else { var r = doc.createRange(); r.selectNodeContents(area); r.collapse(false); sel.addRange(r); }
    }
    function closestBlock(node) {
      while (node && node !== area) {
        if (node.nodeType === 1 && node.matches(BLOCK_SEL)) return node;
        node = node.parentNode;
      }
      return null;
    }
    function exec(cmd, arg) {
      try { doc.execCommand(cmd, false, arg); } catch (e) { /* ignore */ }
    }
    function run(t) {
      area.focus();
      if (!savedRange) saveRange(); else restoreRange();
      if (t.block) { exec('formatBlock', '<' + t.block + '>'); }
      else if (t.cmd) { exec(t.cmd); }
      else if (t.wrap) { wrapSelection(t.wrap); }
      else if (t.align !== undefined) { align(t.align); }
      else if (t.action === 'link') { link(); }
      else if (t.action === 'unlink') { exec('unlink'); }
      else if (t.action === 'image') { insertImage(); return; }
      else if (t.action === 'clear') { clearFormat(); }
      saveRange();
      changed();
    }
    function wrapSelection(cls) {
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      var r = sel.getRangeAt(0);
      if (!inArea(r.commonAncestorContainer)) return;
      var anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
      var existing = anc.closest ? anc.closest('span.' + cls) : null;
      if (existing && inArea(existing)) {
        while (existing.firstChild) existing.parentNode.insertBefore(existing.firstChild, existing);
        existing.remove();
        return;
      }
      if (r.collapsed) { toast('請先選取要套用的文字。'); return; }
      if (closestBlock(r.startContainer) !== closestBlock(r.endContainer)) { toast('請在同一段落內選取文字。'); return; }
      var span = doc.createElement('span');
      span.className = cls;
      span.appendChild(r.extractContents());
      r.insertNode(span);
      var nr = doc.createRange();
      nr.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
    function align(cls) {
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      var block = closestBlock(sel.getRangeAt(0).startContainer);
      if (!block) { exec('formatBlock', '<p>'); block = closestBlock(window.getSelection().getRangeAt(0).startContainer); }
      if (!block) return;
      block.classList.remove('ta-center', 'ta-right');
      if (cls) block.classList.add(cls);
      if (!block.className) block.removeAttribute('class');
    }
    function link() {
      var sel = window.getSelection();
      var url = window.prompt('請輸入連結網址（https:// 開頭，或站內網址例如 /news/）', 'https://');
      if (url === null) return;
      url = url.trim();
      var safe = MC.safeUrl(url, { relative: true, mail: true, tel: true });
      if (!safe) { toast('網址格式不正確。'); return; }
      restoreRange();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) exec('createLink', safe);
      else exec('insertHTML', '<a href="' + escAttr(safe) + '">' + escAttr(url) + '</a>');
    }
    function clearFormat() {
      exec('removeFormat');
      var sel = window.getSelection();
      if (sel.rangeCount) {
        var r = sel.getRangeAt(0);
        $all('span', area).forEach(function (s) {
          if (r.intersectsNode(s)) { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); }
        });
      }
      exec('formatBlock', '<p>');
    }
    function insertImage() {
      saveRange();
      MediaLib.pick('').then(function (m) {
        if (!m) { area.focus(); return; }
        restoreRange();
        exec('insertHTML', '<img src="' + m.data + '" data-media="' + escAttr(m.id) + '" alt="' + escAttr(m.alt) + '" class="img-full">');
        saveRange();
        changed();
      });
    }
    function selectImage(img) {
      $all('img.is-selected', area).forEach(function (i) { i.classList.remove('is-selected'); });
      selectedImg = img;
      imgBar.hidden = !img;
      if (img) img.classList.add('is-selected');
    }
    function imageTool(t) {
      if (!selectedImg) return;
      if (t.size) {
        selectedImg.classList.remove('img-full', 'img-half', 'img-left', 'img-right');
        selectedImg.classList.add(t.size);
      } else if (t.act === 'alt') {
        var alt = window.prompt('圖片說明（描述圖片內容，給視障朋友與搜尋引擎）', selectedImg.getAttribute('alt') || '');
        if (alt !== null) selectedImg.setAttribute('alt', alt.trim().slice(0, 200));
      } else if (t.act === 'remove') {
        selectedImg.remove();
        selectImage(null);
      }
      changed();
    }

    area.addEventListener('input', changed);
    area.addEventListener('blur', function () { saveRange(); flush(); });
    area.addEventListener('keyup', saveRange);
    area.addEventListener('mouseup', saveRange);
    area.addEventListener('focus', function () { try { doc.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ } });
    area.addEventListener('click', function (e) { selectImage(e.target.tagName === 'IMG' ? e.target : null); });
    area.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
      e.preventDefault();
      if (files.length) {
        saveRange();
        toast('正在上傳貼上的圖片…');
        MediaLib.upload(files).then(function (items) {
          var chain = Promise.resolve();
          items.forEach(function (it) {
            chain = chain.then(function () {
              return MC.FB.fetchMedia(it.id).then(function (m) {
                if (!m) return;
                restoreRange();
                exec('insertHTML', '<img src="' + m.data + '" data-media="' + escAttr(it.id) + '" alt="" class="img-full">');
                saveRange();
              });
            });
          });
          return chain.then(changed);
        });
        return;
      }
      var html = cd.getData('text/html');
      if (html) { exec('insertHTML', displayHtml(html)); MC.hydrateMedia(area); }
      else exec('insertText', cd.getData('text/plain'));
      changed();
    });
    area.addEventListener('drop', function (e) {
      var files = e.dataTransfer && Array.prototype.slice.call(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); });
      if (!files || !files.length) return;
      e.preventDefault();
      toast('請使用工具列的「插入圖片」按鈕上傳，圖片會先存進圖片庫。');
    });

    return { el: wrap, flush: flush };
  }

  window.MCAdminKit = { MediaLib: MediaLib, ImageField: ImageField, RichEditor: RichEditor, compress: compress };
})();
