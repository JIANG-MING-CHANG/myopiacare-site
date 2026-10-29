/*
 * MyopiaCare 管理後台
 * - 登入（Firebase Authentication）
 * - 客戶提問：即時收件匣、回覆、封存、刪除、匯出、過期資料清除
 * - 網站內容：所有文字、頁面名稱、選單名稱、區塊顯示、背景色系、圖片、格式文字
 * - 視覺化編輯：在即時預覽畫面直接點選文字、圖片或區塊，右側面板立即修改
 * - 醫療法規用語檢查、版本紀錄（可還原）、圖片庫、瀏覽人次
 * 安全性由 firestore.rules 把關：只有 admins 名單內的帳號能讀寫。
 */
(function () {
  'use strict';

  if (window.top !== window.self) {
    document.documentElement.hidden = true;
    try { window.top.location.href = window.self.location.href; } catch (e) { /* ignore */ }
    return;
  }

  var MC = window.MC;
  var KIT = window.MCAdminKit;
  var doc = document;
  var FB = window.MC_FIREBASE;
  var DEFAULTS = window.MC_DEFAULT_CONTENT || {};
  var IDLE_LIMIT = 30 * 60 * 1000;
  var HISTORY_KEEP = 20;
  var $ = MC.$, $all = MC.$all, el = MC.el, str = MC.str, isObj = MC.isObj, toast = MC.toast;

  var auth, fa, db, fs;
  var currentUser = null;
  var unsubInbox = null;
  var inquiries = [];
  var cardById = {};
  var filter = 'all';
  var search = '';
  var contentState = null;
  var contentDirty = false;
  var activeSection = 'site';
  var editors = [];      // 「網站內容」分頁的格式文字編輯器
  var vEditors = [];     // 「視覺化編輯」面板的格式文字編輯器
  var sink = editors;
  var idleTimer = 0;

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function setStatus(node, msg, kind) { node.textContent = msg || ''; node.className = 'form-status' + (kind ? ' is-' + kind : ''); }
  function busy(btn, on) { btn.disabled = on; btn.classList.toggle('is-loading', on); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '—';
    var d = ts.toDate();
    return d.getFullYear() + '/' + p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function newId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 畫面切換 ---------- */
  var VIEWS = ['loading', 'setup', 'login', 'denied', 'dash'];
  function show(name) {
    VIEWS.forEach(function (v) { $('#view-' + v).hidden = v !== name; });
    $('#admin-user').hidden = name !== 'dash' && name !== 'denied';
    if (name === 'login') setTimeout(function () { var i = $('#login-email'); if (i) i.focus(); }, 50);
  }

  /* ---------- 登入 ---------- */
  var AUTH_MSG = {
    'auth/invalid-credential': 'Email 或密碼錯誤。',
    'auth/wrong-password': 'Email 或密碼錯誤。',
    'auth/user-not-found': 'Email 或密碼錯誤。',
    'auth/invalid-email': 'Email 格式不正確。',
    'auth/missing-password': '請輸入密碼。',
    'auth/user-disabled': '此帳號已被停用。',
    'auth/too-many-requests': '嘗試次數過多，帳號暫時鎖定。請稍後再試，或使用「忘記密碼」。',
    'auth/network-request-failed': '網路連線失敗，請檢查網路。',
    'auth/operation-not-allowed': '尚未在 Firebase 啟用「電子郵件/密碼」登入方式。',
    'auth/unauthorized-domain': '此網域尚未加入 Firebase 的「已授權網域」。'
  };
  function authMsg(err) { return AUTH_MSG[err && err.code] || ('發生錯誤：' + ((err && err.code) || '未知')); }

  function initLogin() {
    var form = $('#login-form');
    var status = $('#login-status');
    var btn = $('button[type="submit"]', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      var pw = form.elements.password.value;
      if (!email || !pw) { setStatus(status, '請輸入 Email 與密碼。', 'error'); return; }
      busy(btn, true);
      setStatus(status, '登入中…');
      fa.signInWithEmailAndPassword(auth, email, pw).then(function () {
        form.reset();
        setStatus(status, '');
      }).catch(function (err) { setStatus(status, authMsg(err), 'error'); })
        .then(function () { busy(btn, false); });
    });
    $('#btn-forgot').addEventListener('click', function () {
      var email = form.elements.email.value.trim();
      if (!email) { setStatus(status, '請先在上方輸入 Email，再按「忘記密碼」。', 'warn'); return; }
      fa.sendPasswordResetEmail(auth, email).then(function () {
        setStatus(status, '若這是管理員帳號，重設密碼的信件已寄出，請到信箱查看。', 'success');
      }).catch(function (err) { setStatus(status, authMsg(err), 'error'); });
    });
  }

  function logout(reason) {
    stopInbox();
    contentDirty = false;
    fa.signOut(auth).then(function () { if (reason) toast(reason); });
  }

  function onUser(user) {
    stopInbox();
    currentUser = null;
    if (!user) { show('login'); return; }
    show('loading');
    fs.getDoc(fs.doc(db, 'admins', user.uid)).then(function (snap) {
      $('#admin-email').textContent = user.email || '';
      if (!snap.exists()) {
        $('#denied-uid').textContent = user.uid;
        $('#denied-note').textContent = '';
        show('denied');
        return;
      }
      currentUser = user;
      KIT.MediaLib.init({ db: db, fs: fs, email: user.email || '' });
      show('dash');
      startInbox();
      loadContent();
      resetIdle();
    }).catch(function (err) {
      $('#denied-uid').textContent = user.uid;
      $('#admin-email').textContent = user.email || '';
      $('#denied-note').textContent = err && err.code === 'permission-denied'
        ? '讀取權限被拒絕：請確認已在 Firestore「規則」貼上並發布最新的 firestore.rules，且 admins 文件 ID 與上方 UID 完全相同。'
        : '無法讀取資料庫（' + ((err && err.code) || '未知錯誤') + '），請檢查網路後重新整理。';
      show('denied');
    });
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    if (!currentUser) return;
    idleTimer = setTimeout(function () {
      if (contentDirty) { resetIdle(); toast('網站內容有尚未發布的修改，暫不自動登出。'); return; }
      logout('閒置超過 30 分鐘，已自動登出。');
    }, IDLE_LIMIT);
  }
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
    doc.addEventListener(ev, function () { if (currentUser) resetIdle(); }, { passive: true });
  });

  /* ---------- 分頁 ---------- */
  function openTab(name) {
    $all('.admin-tabs [role="tab"]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', String(on));
      $('#panel-' + t.getAttribute('data-tab')).hidden = !on;
    });
    $('#content-tools').hidden = !(name === 'content' || name === 'visual');
    doc.body.classList.toggle('vis-wide', name === 'visual');
    if (name === 'media') KIT.MediaLib.renderGrid($('#media-manager'), { mode: 'manage' });
    if (name === 'history') loadHistory();
    if (name === 'content' && contentState) buildForm();
    if (name === 'visual') visOpen();
  }
  function initTabs() {
    $all('.admin-tabs [role="tab"]').forEach(function (tab) {
      tab.addEventListener('click', function () { openTab(tab.getAttribute('data-tab')); });
    });
  }

  /* =========================================================
     客戶提問
     ========================================================= */
  var ROLE_LABEL = { parent: '家長／民眾', clinic: '眼科院所', partner: '合作夥伴', other: '其他' };
  var STATUS_LABEL = { 'new': '新提問', read: '已讀', replied: '已回覆', archived: '已封存' };

  function startInbox() {
    stopInbox();
    var q = fs.query(fs.collection(db, 'inquiries'), fs.orderBy('createdAt', 'desc'), fs.limit(500));
    unsubInbox = fs.onSnapshot(q, function (snap) {
      inquiries = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      renderInbox();
    }, function (err) {
      var list = $('#inbox-list');
      list.textContent = '';
      list.appendChild(el('li', 'inbox-empty', '無法讀取客戶提問（' + (err.code || '錯誤') + '）。請確認 firestore.rules 已發布，並重新整理頁面。'));
    });
  }
  function stopInbox() {
    if (unsubInbox) { unsubInbox(); unsubInbox = null; }
    inquiries = [];
    cardById = {};
    var list = $('#inbox-list');
    if (list) list.textContent = '';
  }
  function matches(q) {
    if (filter !== 'all' && (q.status || 'new') !== filter) return false;
    if (!search) return true;
    return [q.name, q.email, q.phone, q.subject, q.message, q.reply].map(str).join(' ').toLowerCase().indexOf(search) !== -1;
  }

  function buildCard(q) {
    var li = el('li', 'inq');
    li.dataset.id = q.id;
    var head = el('button', 'inq-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    head.dataset.action = 'toggle';
    var who = el('span', 'inq-who');
    who.appendChild(el('b'));
    who.appendChild(el('small'));
    head.appendChild(el('span', 'pill'));
    head.appendChild(who);
    head.appendChild(el('span', 'inq-subject'));
    head.appendChild(el('time'));
    li.appendChild(head);
    var body = el('div', 'inq-body');
    body.hidden = true;
    var meta = el('dl', 'inq-meta');
    [['Email', 'email'], ['電話', 'phone'], ['身分', 'role'], ['收到時間', 'time']].forEach(function (p) {
      meta.appendChild(el('dt', null, p[0]));
      var dd = el('dd');
      dd.dataset.k = p[1];
      meta.appendChild(dd);
    });
    body.appendChild(meta);
    body.appendChild(el('p', 'inq-msg'));
    var label = el('label', null, '回覆內容（按「以 Email 回覆」會自動帶入郵件，並保存在這筆紀錄）');
    var ta = el('textarea');
    ta.id = 'reply-' + q.id;
    label.htmlFor = ta.id;
    ta.maxLength = 5000;
    ta.addEventListener('input', function () { ta.dataset.dirty = '1'; });
    body.appendChild(label);
    body.appendChild(ta);
    var actions = el('div', 'inq-actions');
    [['mail', '以 Email 回覆', 'btn btn-3d btn-primary btn-sm'], ['save', '儲存回覆並標記已回覆', 'btn btn-sm btn-outline'],
     ['copy', '複製回覆', 'btn btn-sm btn-outline'], ['archive', '封存', 'btn btn-sm btn-outline'], ['delete', '刪除', 'btn btn-sm btn-outline danger']].forEach(function (a) {
      var b = el('button', a[2], a[1]);
      b.type = 'button';
      b.dataset.action = a[0];
      actions.appendChild(b);
    });
    body.appendChild(actions);
    body.appendChild(el('p', 'inq-replied'));
    li.appendChild(body);
    return li;
  }
  function fillCard(li, q) {
    var status = q.status || 'new';
    li.classList.toggle('is-new', status === 'new');
    var pill = $('.pill', li);
    pill.className = 'pill pill-' + status;
    pill.textContent = STATUS_LABEL[status] || status;
    $('.inq-who b', li).textContent = str(q.name) || '（未填姓名）';
    $('.inq-who small', li).textContent = ROLE_LABEL[q.role] || '';
    $('.inq-subject', li).textContent = str(q.subject);
    $('.inq-head time', li).textContent = fmtTime(q.createdAt);
    var emailDd = $('[data-k="email"]', li);
    emailDd.textContent = '';
    var email = str(q.email);
    if (/^[^@\s?&<>"]+@[^@\s?&<>"]+\.[^@\s?&<>"]+$/.test(email)) {
      var a = el('a', null, email);
      a.href = 'mailto:' + email;
      emailDd.appendChild(a);
    } else emailDd.textContent = email;
    $('[data-k="phone"]', li).textContent = str(q.phone) || '—';
    $('[data-k="role"]', li).textContent = ROLE_LABEL[q.role] || '—';
    $('[data-k="time"]', li).textContent = fmtTime(q.createdAt);
    $('.inq-msg', li).textContent = str(q.message);
    var ta = $('textarea', li);
    if (ta.dataset.dirty !== '1' && doc.activeElement !== ta) ta.value = str(q.reply);
    $('[data-action="archive"]', li).textContent = status === 'archived' ? '取消封存' : '封存';
    $('.inq-replied', li).textContent = q.repliedAt ? ('已於 ' + fmtTime(q.repliedAt) + ' 回覆' + (q.repliedBy ? '（' + str(q.repliedBy) + '）' : '')) : '';
  }
  function renderInbox() {
    var list = $('#inbox-list');
    var seen = {}, visible = 0, newCount = 0;
    var empty = $('.inbox-empty', list);
    if (empty) empty.remove();
    inquiries.forEach(function (q, i) {
      seen[q.id] = true;
      var li = cardById[q.id];
      if (!li) { li = buildCard(q); cardById[q.id] = li; }
      fillCard(li, q);
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
      var ok = matches(q);
      li.hidden = !ok;
      if (ok) visible++;
      if ((q.status || 'new') === 'new') newCount++;
    });
    Object.keys(cardById).forEach(function (id) { if (!seen[id]) { cardById[id].remove(); delete cardById[id]; } });
    if (!inquiries.length) list.appendChild(el('li', 'inbox-empty', '目前還沒有客戶提問。網站表單送出的訊息會即時出現在這裡。'));
    else if (!visible) list.appendChild(el('li', 'inbox-empty', '沒有符合篩選條件的提問。'));
    $('#inbox-summary').textContent = '共 ' + inquiries.length + ' 則提問' + (visible !== inquiries.length ? '，目前顯示 ' + visible + ' 則' : '') + (inquiries.length >= 500 ? '（只顯示最新 500 則）' : '');
    var badge = $('#badge-new');
    badge.hidden = newCount === 0;
    badge.textContent = String(newCount);
    doc.title = (newCount ? '(' + newCount + ') ' : '') + '管理後台｜豪智慧有限公司';
  }
  function findQ(id) { for (var i = 0; i < inquiries.length; i++) if (inquiries[i].id === id) return inquiries[i]; return null; }
  function updateQ(id, data) {
    return fs.updateDoc(fs.doc(db, 'inquiries', id), data).catch(function (err) { toast('更新失敗：' + (err.code || '請稍後再試')); throw err; });
  }
  function mailtoFor(q, reply) {
    var parts = str(q.email).split('@');
    if (parts.length !== 2) return '';
    var subject = 'Re: ' + str(q.subject) + '｜豪智慧有限公司';
    var body = reply + '\n\n—— 原始提問 ——\n' + str(q.message);
    if (body.length > 1800) body = reply.slice(0, 1800);
    return 'mailto:' + encodeURIComponent(parts[0]) + '@' + encodeURIComponent(parts[1]) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
  function markReplied(q, reply, li) {
    return updateQ(q.id, { status: 'replied', reply: reply, repliedAt: fs.serverTimestamp(), repliedBy: (currentUser && currentUser.email) || '' })
      .then(function () { $('textarea', li).dataset.dirty = ''; });
  }
  function initInbox() {
    $('#inbox-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var li = btn.closest('.inq');
      var q = li && findQ(li.dataset.id);
      if (!q) return;
      var action = btn.dataset.action;
      var ta = $('textarea', li);
      var reply = ta.value.trim();
      if (action === 'toggle') {
        var body = $('.inq-body', li);
        body.hidden = !body.hidden;
        btn.setAttribute('aria-expanded', String(!body.hidden));
        if (!body.hidden && (q.status || 'new') === 'new') updateQ(q.id, { status: 'read', readAt: fs.serverTimestamp() }).catch(function () {});
      } else if (action === 'mail') {
        if (!reply) { toast('請先在「回覆內容」輸入要回覆的文字。'); ta.focus(); return; }
        var url = mailtoFor(q, reply);
        if (!url) { toast('這筆提問的 Email 格式有誤，無法開啟郵件。'); return; }
        var a = el('a');
        a.href = url;
        doc.body.appendChild(a);
        a.click();
        a.remove();
        markReplied(q, reply, li).then(function () { toast('已開啟郵件程式並標記為已回覆。寄出前請確認收件人與內容。'); }).catch(function () {});
      } else if (action === 'save') {
        if (!reply) { toast('請先輸入回覆內容。'); ta.focus(); return; }
        markReplied(q, reply, li).then(function () { toast('已儲存回覆並標記為已回覆。'); }).catch(function () {});
      } else if (action === 'copy') {
        if (!reply) { toast('回覆內容是空的。'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(reply).then(function () { toast('已複製回覆內容。'); }, function () { ta.select(); toast('請按 Ctrl/⌘ + C 複製。'); });
        } else { ta.select(); toast('請按 Ctrl/⌘ + C 複製。'); }
      } else if (action === 'archive') {
        var next = q.status === 'archived' ? (q.reply ? 'replied' : 'read') : 'archived';
        updateQ(q.id, { status: next }).then(function () { toast(next === 'archived' ? '已封存。' : '已取消封存。'); }).catch(function () {});
      } else if (action === 'delete') {
        if (!window.confirm('確定要永久刪除「' + str(q.name) + '」的這則提問嗎？刪除後無法復原。')) return;
        fs.deleteDoc(fs.doc(db, 'inquiries', q.id)).then(function () { toast('已刪除。'); }, function (err) { toast('刪除失敗：' + (err.code || '請稍後再試')); });
      }
    });
    $all('.chip[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        filter = chip.dataset.filter;
        $all('.chip[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
        renderInbox();
      });
    });
    var searchTimer = 0;
    $('#inbox-search').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { search = e.target.value.trim().toLowerCase(); renderInbox(); }, 200);
    });
    $('#btn-export').addEventListener('click', exportCsv);
    $('#btn-purge').addEventListener('click', purgeOld);
  }
  function csvCell(v) {
    var s = str(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    var rows = inquiries.filter(matches);
    if (!rows.length) { toast('沒有可匯出的資料。'); return; }
    var lines = [['收到時間', '狀態', '姓名', 'Email', '電話', '身分', '主旨', '提問內容', '回覆內容', '回覆時間'].map(csvCell).join(',')];
    rows.forEach(function (q) {
      lines.push([fmtTime(q.createdAt), STATUS_LABEL[q.status] || q.status, q.name, q.email, q.phone, ROLE_LABEL[q.role] || q.role,
        q.subject, q.message, q.reply, q.repliedAt ? fmtTime(q.repliedAt) : ''].map(csvCell).join(','));
    });
    var d = new Date();
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'myopiacare-inquiries-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv');
  }
  function purgeOld() {
    var cutoff = Date.now() - 730 * 86400000;
    var old = inquiries.filter(function (q) { return q.createdAt && q.createdAt.toDate && q.createdAt.toDate().getTime() < cutoff; });
    if (!old.length) { toast('沒有超過 2 年的提問。'); return; }
    if (!window.confirm('找到 ' + old.length + ' 則超過 2 年的提問（依隱私權政策應刪除）。確定永久刪除？建議先「匯出 CSV」備份。')) return;
    var b = fs.writeBatch(db);
    old.slice(0, 450).forEach(function (q) { b.delete(fs.doc(db, 'inquiries', q.id)); });
    b.commit().then(function () { toast('已刪除 ' + Math.min(old.length, 450) + ' 則過期提問。'); }, function (err) { toast('刪除失敗：' + (err.code || '')); });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* =========================================================
     網站內容編輯器
     ========================================================= */
  var T = function (label, extra) { return Object.assign({ type: 'text', label: label }, extra || {}); };
  var SCHEMA = [
    { key: 'site', label: '網站設定', desc: '瀏覽器分頁名稱、搜尋引擎摘要與背景色系。', fields: {
      title: T('首頁網頁標題（瀏覽器分頁名稱）', { hint: '顯示在瀏覽器分頁與 Google 搜尋結果的標題。' }),
      description: T('網站描述', { type: 'textarea', hint: '搜尋引擎顯示的摘要，建議 80 字以內。' }),
      palette: T('背景色系', { type: 'palette' }) } },
    { key: 'brand', label: '品牌', fields: {
      nameZh: T('公司中文名稱'), nameEn: T('品牌英文名稱'), tagline: T('品牌標語'),
      logo: T('Logo 圖片（選填）', { type: 'image', hint: '建議使用正方形圖片；留空則使用預設的 MyopiaCare 圓形 logo。' }) } },
    { key: 'nav', label: '選單與頁面名稱', desc: '修改上方選單、頁尾連結顯示的名稱。各區塊與內頁的標題請到各自的分頁修改。', fields: {
      services: T('「服務項目」選單名稱'), flow: T('「使用流程」選單名稱'), news: T('「最新消息」選單名稱'),
      about: T('「關於我們」選單名稱'), contact: T('「聯絡我們」選單名稱'), cta: T('提問按鈕文字') } },
    { key: 'sections', label: '區塊顯示', desc: '關閉的區塊不會出現在首頁，選單中的對應項目也會一起隱藏。', fields: {
      services: T('顯示「服務項目」', { type: 'bool' }), flow: T('顯示「使用流程」', { type: 'bool' }), news: T('顯示「最新消息」', { type: 'bool' }),
      about: T('顯示「關於我們」', { type: 'bool' }), contact: T('顯示「聯絡我們」與提問表單', { type: 'bool' }), app: T('顯示「App 下載」', { type: 'bool' }) } },
    { key: 'hero', label: '首頁主視覺', fields: {
      eyebrow: T('英文小標'), title: T('主標題'), subtitle: T('副標題'), lead: T('引言', { type: 'textarea' }),
      ctaPrimary: T('主要按鈕文字'), ctaSecondary: T('次要按鈕文字'),
      image: T('背景照片（選填）', { type: 'image', hint: '設定後會疊在眼睛掃描動畫下方，並自動加上深色遮罩讓文字清楚。' }),
      showCards: T('顯示漂浮數據卡（示意）', { type: 'bool', hint: '卡片右上角固定顯示「示意」，代表非真實個人資料。' }),
      card1Label: T('數據卡 1｜名稱'), card1Value: T('數據卡 1｜數值'), card1Unit: T('數據卡 1｜單位'),
      card1Meta: T('數據卡 1｜說明', { hint: '結尾若是「+0.12」這類數字，會自動以綠色強調。' }),
      card2Label: T('數據卡 2｜名稱'), card2Value: T('數據卡 2｜數值'), card2Unit: T('數據卡 2｜單位'), card2Meta: T('數據卡 2｜說明'),
      card3Label: T('數據卡 3（趨勢圖）｜名稱'), card3Meta: T('數據卡 3（趨勢圖）｜說明'),
      card4Label: T('數據卡 4（散光軸度）｜名稱'),
      card4Value: T('數據卡 4｜軸度數值', { hint: '輸入 0–180 的數字，示意圖的軸線會自動轉到這個角度。' }),
      card4Unit: T('數據卡 4｜單位'), card4Meta: T('數據卡 4｜說明') } },
    { key: 'services', label: '服務項目', fields: {
      kicker: T('英文小標'), title: T('區塊名稱'), intro: T('區塊介紹', { type: 'textarea' }),
      items: { type: 'list', label: '服務卡片', noun: '服務', fields: {
        icon: T('圖示', { type: 'icon' }), image: T('卡片圖片（選填，設定後取代圖示）', { type: 'image' }),
        title: T('名稱'), desc: T('說明', { type: 'textarea' }) } } } },
    { key: 'flow', label: '使用流程', fields: {
      kicker: T('英文小標'), title: T('區塊名稱'), intro: T('區塊介紹', { type: 'textarea' }),
      steps: { type: 'list', label: '步驟', noun: '步驟', fields: { title: T('步驟名稱'), desc: T('說明', { type: 'textarea' }) } } } },
    { key: 'news', label: '最新消息', desc: '每則消息都有自己的網址：myopiacare.site/news/?id=代號。新增的消息會排在最上面。', fields: {
      kicker: T('英文小標'), title: T('區塊與頁面名稱'), intro: T('消息頁介紹', { type: 'textarea' }),
      moreLabel: T('首頁「查看全部消息」按鈕文字'),
      items: { type: 'list', label: '消息', noun: '消息', newestFirst: true, fields: {
        id: T('網址代號', { type: 'id' }), date: T('日期', { type: 'date' }), title: T('標題'),
        cover: T('封面圖片（選填）', { type: 'image' }), summary: T('摘要（列表顯示）', { type: 'textarea' }),
        body: T('內文（可加入標題、粗體、清單、圖片與連結）', { type: 'rich' }) } } } },
    { key: 'about', label: '關於我們', fields: {
      kicker: T('英文小標'), title: T('區塊名稱'), body: T('內文', { type: 'rich' }),
      doctorName: T('醫師姓名'),
      doctorLicense: T('專科醫師證書字號', { hint: '顯示在醫師姓名右邊，會自動加上全形括號；留空則不顯示。' }),
      doctorTitle: T('職稱'), doctorQuote: T('醫師的話', { type: 'textarea' }),
      doctorPhoto: T('醫師照片（選填）', { type: 'image', hint: '留空會顯示姓氏頭像。' }) } },
    { key: 'contact', label: '聯絡我們', fields: {
      kicker: T('英文小標'), title: T('區塊名稱'), intro: T('區塊介紹', { type: 'textarea' }),
      formTitle: T('表單標題'), submitLabel: T('送出按鈕文字'),
      formNote: T('表單下方提醒', { type: 'textarea', hint: '建議保留「不提供醫療諮詢、請勿填寫病歷等敏感資料」的提醒。' }),
      phone: T('電話'), email: T('Email'), address: T('地址'), hours: T('服務時間'),
      showLine: T('顯示 LINE 按鈕（頁首深淺模式按鈕左邊、聯絡我們）', { type: 'bool' }),
      lineUrl: T('LINE 官方帳號連結', { type: 'url', hint: '目前是 LINE ID @892zqqxn：https://line.me/R/ti/p/%40892zqqxn（@ 寫成 %40）。留空會自動使用這個連結；不想顯示請關閉上方開關。' }) } },
    { key: 'app', label: 'App 下載', fields: {
      kicker: T('英文小標'), title: T('區塊名稱'), desc: T('說明', { type: 'textarea' }),
      image: T('App 圖示（選填）', { type: 'image', hint: '顯示在手機示意圖中央；留空則使用預設的 MyopiaCare 方形圖示。' }),
      screenTitle: T('手機示意畫面｜App 名稱'), screenText: T('手機示意畫面｜副標'),
      appStoreUrl: T('App Store 連結', { type: 'url', hint: '上架後貼上 https://apps.apple.com/… 網址；留空顯示「即將上架」。' }),
      googlePlayUrl: T('Google Play 連結', { type: 'url', hint: '上架後貼上 https://play.google.com/… 網址；留空顯示「即將上架」。' }),
      facebookUrl: T('Facebook 粉絲專頁連結', { type: 'url', hint: '例如 https://www.facebook.com/你的專頁；留空時圖示仍顯示，點擊會提示「即將開放」。' }),
      xUrl: T('X（Twitter）連結', { type: 'url', hint: '例如 https://x.com/你的帳號；留空時點擊會提示「即將開放」。' }),
      instagramUrl: T('Instagram 連結', { type: 'url', hint: '例如 https://www.instagram.com/你的帳號；留空時點擊會提示「即將開放」。' }) } },
    { key: 'mascot', label: '眼球寶寶', desc: '浮動提問吉祥物：畫面右下角的眼球寶寶會跟著訪客捲動；點一下會出現特效，並直接前往「線上提問」表單。關閉「聯絡我們」區塊時也會一起隱藏。', fields: {
      show: T('顯示眼球寶寶', { type: 'bool' }),
      bubble: T('對話泡泡文字', { hint: '第一次進站、滑鼠移上去時顯示，例如「有問題嗎？點我線上提問」。建議 15 字以內。' }),
      image: T('眼球寶寶圖片（選填）', { type: 'image', hint: '請用去背的 PNG 或 WebP（直式、約 240×245）；留空則使用預設的眼球寶寶。' }) } },
    { key: 'privacy', label: '隱私權政策頁', desc: '頁面網址：myopiacare.site/privacy/', fields: {
      kicker: T('英文小標'), title: T('頁面名稱'), body: T('內容', { type: 'rich' }) } },
    { key: 'footer', label: '頁尾', fields: {
      note: T('頁尾聲明', { type: 'textarea', hint: '建議保留「本公司非醫療機構、不提供醫療診斷」的聲明。' }),
      showCounter: T('顯示瀏覽人次', { type: 'bool', hint: '同一個瀏覽器 30 分鐘內重複瀏覽只算 1 次；不記錄任何個人資料。' }),
      counterLabel: T('瀏覽人次文字'),
      visits: T('目前累計瀏覽人次', { type: 'stats' }) } }
  ];
  var ICON_OPTIONS = [['cloud', '雲端紀錄'], ['ai', 'AI 整理'], ['axis', '眼軸圖表'], ['bell', '提醒'], ['report', '報告'], ['clinic', '院所']];
  var PALETTES = [['mist', '晨霧', '柔和霧綠，長時間閱讀最舒適（預設）', '#F1F6F4', '#E7EFEC'], ['sky', '晴空', '清爽淡藍，科技感', '#F2F7FB', '#E8F1F7'], ['ivory', '暖陽', '溫暖米白，親切感', '#F7F5EF', '#EFECE3']];

  function getIn(obj, path) { return path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setIn(obj, path, value) { var parent = getIn(obj, path.slice(0, -1)); if (parent != null) parent[path[path.length - 1]] = value; }
  function schemaFor(key) { for (var i = 0; i < SCHEMA.length; i++) if (SCHEMA[i].key === key) return SCHEMA[i]; return null; }

  function fieldShell(spec, id) {
    var wrap = el('div', 'field cms-field cms-' + spec.type);
    var label = el('label', null, spec.label);
    label.htmlFor = id;
    wrap.appendChild(label);
    return wrap;
  }
  function addHint(wrap, spec) { if (spec.hint) wrap.appendChild(el('p', 'cms-hint', spec.hint)); }

  /* 瀏覽人次：直接讀寫 stats/visits（立即生效，不需要發布） */
  function buildStatsField(spec, id) {
    var wrap = el('div', 'field cms-field cms-stats');
    var label = el('label', null, spec.label);
    label.htmlFor = id;
    wrap.appendChild(label);
    var row = el('div', 'stats-row');
    var num = el('strong', 'stats-num', '讀取中…');
    var input = el('input');
    input.type = 'number';
    input.id = id;
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    var set = el('button', 'btn btn-sm btn-outline', '設定為此數字');
    set.type = 'button';
    row.appendChild(num);
    row.appendChild(input);
    row.appendChild(set);
    wrap.appendChild(row);
    wrap.appendChild(el('p', 'cms-hint', '要歸零請輸入 0；要接續舊網站的累計數字，輸入該數字即可。這個設定會立即生效，不需要按「檢查並發布」。'));
    function refresh() {
      fs.getDoc(fs.doc(db, 'stats', 'visits')).then(function (snap) {
        var n = snap.exists() ? Math.max(0, Math.floor(Number(snap.data().count) || 0)) : 0;
        num.textContent = n.toLocaleString('zh-TW') + ' 人次';
        input.value = String(n);
      }, function (err) { num.textContent = '無法讀取（' + ((err && err.code) || '錯誤') + '）'; });
    }
    set.addEventListener('click', function () {
      var v = input.value.trim();
      if (!/^\d{1,12}$/.test(v)) { toast('請輸入 0 以上的整數。'); input.focus(); return; }
      var n = parseInt(v, 10);
      if (!window.confirm('確定把瀏覽人次設定為 ' + n.toLocaleString('zh-TW') + ' 嗎？（立即生效）')) return;
      busy(set, true);
      fs.setDoc(fs.doc(db, 'stats', 'visits'), { count: n }).then(function () {
        toast('瀏覽人次已更新為 ' + n.toLocaleString('zh-TW') + '。');
        refresh();
      }, function (err) {
        toast('更新失敗（' + ((err && err.code) || '錯誤') + '）：請確認已發布最新的 firestore.rules。');
      }).then(function () { busy(set, false); });
    });
    if (db && fs) refresh(); else num.textContent = '—';
    return wrap;
  }

  function buildField(spec, path, value, prefix) {
    var id = (prefix || 'cms-') + path.join('-');
    var type = spec.type || 'text';
    if (type === 'id') return null;
    if (type === 'stats') return buildStatsField(spec, id);
    var wrap;
    if (type === 'bool') {
      wrap = el('div', 'field cms-field cms-bool');
      var lab = el('label', 'switch');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = value !== false;
      cb.dataset.path = JSON.stringify(path);
      cb.dataset.kind = 'bool';
      lab.appendChild(cb);
      lab.appendChild(el('span', 'switch-ui'));
      lab.appendChild(el('span', 'switch-text', spec.label));
      wrap.appendChild(lab);
      addHint(wrap, spec);
      return wrap;
    }
    if (type === 'palette') {
      wrap = el('fieldset', 'field cms-field cms-palette');
      wrap.appendChild(el('legend', null, spec.label));
      var grid = el('div', 'palette-grid');
      PALETTES.forEach(function (p) {
        var opt = el('label', 'palette-opt');
        var r = el('input');
        r.type = 'radio';
        r.name = id;
        r.value = p[0];
        r.checked = (value || 'mist') === p[0];
        r.dataset.path = JSON.stringify(path);
        r.dataset.kind = 'radio';
        var sw = el('span', 'palette-swatch palette-' + p[0]);
        sw.setAttribute('aria-hidden', 'true');
        var txt = el('span', 'palette-text');
        txt.appendChild(el('strong', null, p[1]));
        txt.appendChild(el('small', null, p[2]));
        opt.appendChild(r);
        opt.appendChild(sw);
        opt.appendChild(txt);
        grid.appendChild(opt);
      });
      wrap.appendChild(grid);
      return wrap;
    }
    wrap = fieldShell(spec, id);
    if (type === 'image') {
      wrap.appendChild(KIT.ImageField(id, value, function (v) { setIn(contentState, path, v); setDirty(true); }));
      addHint(wrap, spec);
      return wrap;
    }
    if (type === 'rich') {
      var ed = KIT.RichEditor(id, value, function (html) { setIn(contentState, path, html); setDirty(true); });
      sink.push(ed);
      wrap.appendChild(ed.el);
      addHint(wrap, spec);
      return wrap;
    }
    var input;
    if (type === 'icon') {
      input = el('select');
      ICON_OPTIONS.forEach(function (o) { var opt = el('option', null, o[1]); opt.value = o[0]; input.appendChild(opt); });
    } else if (type === 'textarea') {
      input = el('textarea');
      input.rows = 3;
    } else {
      input = el('input');
      input.type = type === 'date' ? 'date' : 'text';
      if (type === 'url') { input.inputMode = 'url'; input.spellcheck = false; input.placeholder = 'https://'; }
    }
    input.id = id;
    input.value = str(value);
    input.dataset.path = JSON.stringify(path);
    wrap.appendChild(input);
    addHint(wrap, spec);
    return wrap;
  }

  function buildList(spec, path, arr, opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'cms-';
    var focus = typeof opts.openIndex === 'number' ? opts.openIndex : null;
    var box = el('div', 'cms-array');
    box.appendChild(el('p', 'cms-array-title', spec.label + '（' + arr.length + '）'));
    arr.forEach(function (item, i) {
      var card = el('details', 'cms-item');
      card.open = focus === null ? (arr.length <= 3 || i === 0) : i === focus;
      if (focus !== null && i === focus) card.classList.add('is-target');
      var head = el('summary', 'cms-item-head');
      head.appendChild(el('strong', null, spec.noun + ' #' + (i + 1) + (item.title ? '　' + item.title : '')));
      [['up', '↑', '上移', i === 0], ['down', '↓', '下移', i === arr.length - 1], ['remove', '✕', '刪除', false]].forEach(function (b) {
        var btn = el('button', 'mini-btn' + (b[0] === 'remove' ? ' danger' : ''), b[1]);
        btn.type = 'button';
        btn.title = b[2];
        btn.setAttribute('aria-label', b[2] + ' ' + spec.noun + ' #' + (i + 1));
        btn.disabled = b[3];
        btn.dataset.action = b[0];
        btn.dataset.path = JSON.stringify(path);
        btn.dataset.index = String(i);
        head.appendChild(btn);
      });
      card.appendChild(head);
      var body = el('div', 'cms-item-body');
      Object.keys(spec.fields).forEach(function (k) {
        var f = buildField(spec.fields[k], path.concat(i, k), item[k], prefix);
        if (f) body.appendChild(f);
      });
      if (path.join('.') === 'news.items' && item.id) {
        if (prefix === 'vis-') {
          var open = el('button', 'btn btn-sm btn-outline vis-open-article', '在預覽中開啟這則消息的內文頁');
          open.type = 'button';
          open.dataset.visArticle = item.id;
          body.appendChild(open);
        }
        var link = el('a', 'cms-hint cms-link', '查看這則消息 → myopiacare.site/news/?id=' + item.id);
        link.href = MC.href('news', item.id);
        link.target = '_blank';
        link.rel = 'noopener';
        body.appendChild(link);
      }
      card.appendChild(body);
      box.appendChild(card);
    });
    var add = el('button', 'btn btn-sm btn-3d btn-dark', '＋ 新增' + spec.noun);
    add.type = 'button';
    add.dataset.action = 'add';
    add.dataset.path = JSON.stringify(path);
    add.disabled = arr.length >= 60;
    box.appendChild(add);
    return box;
  }

  function flushEditors() { editors.concat(vEditors).forEach(function (e) { e.flush(); }); }

  function buildNav() {
    var nav = $('#cms-nav');
    nav.textContent = '';
    SCHEMA.forEach(function (s) {
      var b = el('button', 'cms-nav-btn', s.label);
      b.type = 'button';
      b.dataset.section = s.key;
      b.setAttribute('aria-current', String(s.key === activeSection));
      nav.appendChild(b);
    });
  }
  function buildForm() {
    flushEditors();
    editors = [];
    sink = editors;
    var form = $('#content-form');
    form.textContent = '';
    var s = schemaFor(activeSection) || SCHEMA[0];
    var sec = el('section', 'cms-section');
    sec.appendChild(el('h2', 'cms-section-title', s.label));
    if (s.desc) sec.appendChild(el('p', 'cms-hint cms-section-desc', s.desc));
    var data = contentState[s.key] || {};
    Object.keys(s.fields).forEach(function (k) {
      var spec = s.fields[k];
      var node = spec.type === 'list' ? buildList(spec, [s.key, k], Array.isArray(data[k]) ? data[k] : []) : buildField(spec, [s.key, k], data[k]);
      if (node) sec.appendChild(node);
    });
    form.appendChild(sec);
    buildNav();
  }

  function setDirty(on) {
    contentDirty = on;
    $('.btn-label', $('#btn-save')).textContent = on ? '檢查並發布 •' : '檢查並發布';
    if (on) visSend();
  }

  /* 內容整份被替換（讀取、還原舊版、匯入、套用預設）時，兩種編輯畫面一起更新 */
  function contentReplaced() {
    buildForm();
    if (!$('#panel-visual').hidden) { vis.target = null; visArticles(); buildPanel(); }
    if (vis.loaded) visSend(true);
  }

  function ensureIds(c) {
    (c.news.items || []).forEach(function (it) { if (!MC.MEDIA_ID_RE.test(str(it.id))) it.id = newId(); });
    return c;
  }

  function loadContent() {
    var status = $('#content-status');
    setStatus(status, '讀取網站內容中…');
    fs.getDoc(fs.doc(db, 'site', 'content')).then(function (snap) {
      var data = null;
      if (snap.exists()) { try { data = JSON.parse(snap.data().json); } catch (e) { data = null; } }
      contentState = ensureIds(MC.withDefaults(data));
      contentReplaced();
      setDirty(false);
      if (snap.exists()) {
        var d = snap.data();
        setStatus(status, '目前網站內容：最後發布 ' + fmtTime(d.updatedAt) + (d.updatedBy ? '（' + d.updatedBy + '）' : ''));
      } else {
        setStatus(status, '資料庫還沒有網站內容，下方顯示的是預設內容。修改後按「檢查並發布」即可建立。', 'warn');
      }
    }).catch(function (err) {
      contentState = ensureIds(MC.withDefaults(null));
      contentReplaced();
      setStatus(status, '讀取失敗（' + (err.code || '錯誤') + '），目前顯示預設內容。請確認網路與 firestore.rules。', 'error');
    });
  }

  /* ---------- 醫療法規用語檢查 ---------- */
  var NEGATION = /(不提供|不能取代|不得|並非|非屬|不屬於|不作為|不是|無法|不宜|不可|不涉及|不包含|未提供|避免|不能)[^。；\n]{0,10}$/;
  var RISK_RULES = [
    { re: /治療|療程/g, cat: '療效／醫療行為', tip: '公司網站不宣稱治療；改為「紀錄」「整理」，或寫明「由您的醫師說明」。' },
    { re: /治癒|痊癒|根治|斷根|康復/g, cat: '療效宣稱', tip: '刪除。' },
    { re: /療效|功效|有效率|成功率|顯著改善|改善度數|降低度數|度數下降|恢復視力|視力恢復|逆轉|延緩|減緩|抑制/g, cat: '療效宣稱', tip: '刪除，或改為客觀描述（例如「記錄度數變化」）。' },
    { re: /預防近視|防止近視|避免近視|控制近視|近視控制|防近視|遠離近視/g, cat: '預防／控制宣稱', tip: '改為「記錄」「追蹤」；衛教內容請引用國健署並註明來源。' },
    { re: /診斷|確診|判讀|篩檢出|檢測出|偵測疾病|預測疾病/g, cat: '診斷宣稱', tip: '改為「整理」「呈現」「供醫師參考」。' },
    { re: /保證|100%|百分之百|絕對|零風險|無副作用|安全無虞|永久/g, cat: '保證用語', tip: '刪除。' },
    { re: /最佳|最好|第一|唯一|權威|頂尖|名醫|神醫|首選|最先進|最專業/g, cat: '誇大用語', tip: '刪除或改為具體事實。' },
    { re: /優惠|折扣|免費檢查|免費驗光|團購|贈送|限時|特價|促銷/g, cat: '促銷招攬', tip: '醫療相關服務避免促銷用語。' },
    { re: /掛號|門診時間|看診|預約看診|就診|來院|到院/g, cat: '招攬醫療業務', tip: '公司網站不宜招攬就醫；可改為「如有需要請洽您的眼科醫師」。' },
    { re: /處方|開藥|用藥建議|藥效/g, cat: '醫療行為', tip: '刪除，或改為「依醫囑」。' },
    { re: /衛福部核准|FDA|TFDA|醫療器材許可|認證通過/g, cat: '許可宣稱', tip: '確認已取得許可並附許可字號，否則刪除。' }
  ];
  function collectTexts() {
    var out = [];
    SCHEMA.forEach(function (s) {
      var data = contentState[s.key] || {};
      Object.keys(s.fields).forEach(function (k) {
        var spec = s.fields[k];
        if (spec.type === 'list') {
          (data[k] || []).forEach(function (item, i) {
            Object.keys(spec.fields).forEach(function (fk) {
              var fspec = spec.fields[fk];
              if (['text', 'textarea', 'rich'].indexOf(fspec.type) === -1) return;
              var v = fspec.type === 'rich' ? MC.richText(item[fk]) : str(item[fk]);
              out.push({ where: s.label + ' › ' + spec.noun + ' #' + (i + 1) + ' › ' + fspec.label, text: v, section: s.key });
            });
          });
        } else if (['text', 'textarea', 'rich'].indexOf(spec.type) !== -1) {
          out.push({ where: s.label + ' › ' + spec.label, text: spec.type === 'rich' ? MC.richText(data[k]) : str(data[k]), section: s.key });
        }
      });
    });
    return out;
  }
  function checkCompliance() {
    var found = [];
    collectTexts().forEach(function (t) {
      RISK_RULES.forEach(function (rule) {
        rule.re.lastIndex = 0;
        var m;
        while ((m = rule.re.exec(t.text))) {
          var before = t.text.slice(Math.max(0, m.index - 14), m.index);
          if (NEGATION.test(before)) continue;
          var ctx = t.text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12);
          found.push({ where: t.where, section: t.section, term: m[0], cat: rule.cat, tip: rule.tip, ctx: ctx });
        }
      });
    });
    return found;
  }
  function showCheck(found, allowPublish) {
    var dialog = $('#check-dialog');
    var body = $('#check-body');
    body.textContent = '';
    if (!found.length) {
      body.appendChild(el('p', 'check-ok', '沒有發現需要注意的用語。'));
    } else {
      body.appendChild(el('p', 'check-lead', '發現 ' + found.length + ' 處可能涉及醫療廣告或醫療效能宣稱的用語（依《醫療法》第 84、87 條與《醫療器材管理法》第 46 條）。系統只做提醒，請自行判斷是否修改。'));
      var ul = el('ul', 'check-list');
      found.slice(0, 80).forEach(function (f) {
        var li = el('li');
        var top = el('div', 'check-top');
        top.appendChild(el('span', 'pill pill-new', f.cat));
        top.appendChild(el('strong', null, '「' + f.term + '」'));
        var go = el('button', 'link-btn check-go', f.where);
        go.type = 'button';
        go.addEventListener('click', function () {
          dialog.close();
          activeSection = f.section;
          if (!$('#panel-visual').hidden) { vis.target = { section: f.section, field: '', index: -1, key: f.section }; buildPanel(); visPostSelect(f.section); return; }
          buildForm();
          window.scrollTo(0, 0);
        });
        top.appendChild(go);
        li.appendChild(top);
        li.appendChild(el('p', 'check-ctx', '…' + f.ctx + '…'));
        li.appendChild(el('p', 'check-tip', '建議：' + f.tip));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    $('#check-publish').hidden = !allowPublish;
    $('#check-publish').textContent = found.length ? '我已確認，仍要發布' : '發布';
    dialog.showModal();
  }

  /* ---------- 網址自動修正：少打 https://、打成 http://、LINE 只填 @ID 時自動補正，避免發布被擋 ---------- */
  var URL_FIELDS = [['contact', 'lineUrl'], ['app', 'appStoreUrl'], ['app', 'googlePlayUrl'], ['app', 'facebookUrl'], ['app', 'xUrl'], ['app', 'instagramUrl']];
  function fixUrl(v, field) {
    var s = str(v).trim();
    if (!s) return '';
    if (field === 'lineUrl' && /^@[A-Za-z0-9._-]{2,40}$/.test(s)) return 'https://line.me/R/ti/p/%40' + s.slice(1);
    if (/^http:\/\//i.test(s)) return 'https://' + s.slice(7);
    if (/^\/\/[^\s/]/.test(s)) return 'https:' + s;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(s)) return 'https://' + s;
    return s;
  }
  function syncInputs(path, value) {
    var key = JSON.stringify(path);
    $all('input[data-path], textarea[data-path]').forEach(function (n) {
      if (n.dataset.path === key && n.type !== 'checkbox' && n.type !== 'radio') n.value = value;
    });
  }
  function autoFixUrls(c) {
    var fixed = [];
    URL_FIELDS.forEach(function (p) {
      if (!isObj(c[p[0]]) || typeof c[p[0]][p[1]] !== 'string') return;
      var before = c[p[0]][p[1]];
      var after = fixUrl(before, p[1]);
      if (after === before) return;
      c[p[0]][p[1]] = after;
      syncInputs(p, after);
      if (after.trim() !== before.trim()) fixed.push(schemaFor(p[0]).fields[p[1]].label);
    });
    return fixed;
  }

  /* 回傳要修正的欄位：msg 是說明，section／field／index／sub 用來「前往修改」 */
  function validateContent(c) {
    var problems = [];
    URL_FIELDS.forEach(function (p) {
      var v = str(c[p[0]][p[1]]).trim();
      if (v && !/^https:\/\/[^\s]+$/i.test(v)) problems.push({ msg: '「' + schemaFor(p[0]).fields[p[1]].label + '」必須是 https:// 開頭的完整網址。', section: p[0], field: p[1], index: -1 });
    });
    (c.news.items || []).forEach(function (n, i) {
      if (n.date && !/^\d{4}-\d{2}-\d{2}$/.test(n.date)) problems.push({ msg: '消息 #' + (i + 1) + ' 的日期格式應為 2026-10-25。', section: 'news', field: 'items', index: i, sub: 'date' });
      if (!str(n.title).trim()) problems.push({ msg: '消息 #' + (i + 1) + ' 沒有標題，前台不會顯示。', section: 'news', field: 'items', index: i, sub: 'title' });
    });
    if (!str(c.site.title).trim()) problems.push({ msg: '「首頁網頁標題」不能空白。', section: 'site', field: 'title', index: -1 });
    var axis = str(c.hero.card4Value).replace(/[°\s]/g, '');
    if (axis && !(/^\d{1,3}(\.\d+)?$/.test(axis) && parseFloat(axis) <= 180)) problems.push({ msg: '「數據卡 4｜軸度數值」請填 0–180 的數字。', section: 'hero', field: 'card4Value', index: -1 });
    return problems;
  }
  var MAX_JSON = 290000;
  var PUBLISH_TIMEOUT = 25000;
  var checkPending = false;

  function startPublish() {
    if (!contentState) return;
    flushEditors();
    var status = $('#content-status');
    var fixed = autoFixUrls(contentState);
    if (fixed.length) { visSend(); toast('已自動把「' + fixed.join('、') + '」補成完整網址。'); }
    var problems = validateContent(contentState);
    if (problems.length) {
      setStatus(status, problems.map(function (p) { return p.msg; }).join(' '), 'error');
      showProblems(problems);
      return;
    }
    var json = JSON.stringify(contentState);
    if (json.length > MAX_JSON) {
      setStatus(status, '內容太長了（超過 29 萬字元），請精簡內文後再發布。圖片請使用圖片庫，不要直接貼進文字。', 'error');
      showProblems([{ msg: '網站內容總長度約 ' + Math.round(json.length / 1000) + ' 千字元，超過上限 290 千字元。請刪減消息內文，圖片一律從圖片庫插入（不要直接貼上圖片）。', section: 'news', field: 'items', index: -1 }]);
      return;
    }
    var found = checkCompliance();
    if (found.length) { checkPending = true; showCheck(found, true); return; }
    publish();
  }

  function publish() {
    var status = $('#content-status');
    var btn = $('#btn-save');
    var json = JSON.stringify(contentState);
    var finished = false;
    busy(btn, true);
    setStatus(status, '發布中…');
    var b = fs.writeBatch(db);
    var by = (currentUser && currentUser.email) || '';
    b.set(fs.doc(db, 'site', 'content'), { json: json, updatedAt: fs.serverTimestamp(), updatedBy: by });
    b.set(fs.doc(fs.collection(db, 'siteHistory')), { json: json, savedAt: fs.serverTimestamp(), savedBy: by });
    // 連線被擋住時，資料庫程式會一直等待而不回報錯誤；超過時間就主動說明原因
    var slow = setTimeout(function () {
      if (finished) return;
      busy(btn, false);
      setStatus(status, '發布等候逾時：資料庫一直沒有回應。請依照跳出視窗的說明處理。', 'error');
      openDiag({ code: 'timeout' }, true);
    }, PUBLISH_TIMEOUT);
    b.commit().then(function () {
      finished = true;
      clearTimeout(slow);
      if (JSON.stringify(contentState) === json) setDirty(false);
      setStatus(status, '已發布！重新整理網站就會看到新內容。', 'success');
      toast('網站內容已發布。');
      if (diag.fromPublish && $('#diag-dialog').open) $('#diag-dialog').close();
      pruneHistory();
    }).catch(function (err) {
      finished = true;
      clearTimeout(slow);
      setStatus(status, '發布失敗（' + (err.code || '錯誤') + '）。' + (err.code === 'permission-denied' ? '請確認此帳號在 admins 名單內，且已發布最新的 firestore.rules。' : '請稍後再試。'), 'error');
      openDiag(err, true);
    }).then(function () { busy(btn, false); });
  }

  function pruneHistory() {
    fs.getDocs(fs.query(fs.collection(db, 'siteHistory'), fs.orderBy('savedAt', 'desc'), fs.limit(60))).then(function (snap) {
      var extra = snap.docs.slice(HISTORY_KEEP);
      if (!extra.length) return;
      var b = fs.writeBatch(db);
      extra.forEach(function (d) { b.delete(d.ref); });
      return b.commit();
    }).catch(function () { /* 清理失敗不影響發布 */ });
  }

  /* =========================================================
     發布問題說明與連線診斷
     - 發布失敗時自動逐項檢查設定，用白話說明是哪一步有問題、該怎麼修正
     - 檢查只讀取資料；「寫入測試」只對瀏覽人次做 +0，不會改動任何內容
     ========================================================= */
  var diag = { running: 0, fromPublish: false, err: null, text: [] };
  var NET_CODES = ['unavailable', 'deadline-exceeded', 'timeout', 'cancelled', 'aborted'];
  function projectId() { var c = window.MC_FIREBASE_CONFIG || {}; return str(c.projectId) || '（未設定）'; }
  function isNet(err) { return !!err && NET_CODES.indexOf(err.code) !== -1; }
  function codeOf(err) { return (err && (err.code || err.message)) || '未知錯誤'; }
  function timed(p) { return FB && FB.withTimeout ? FB.withTimeout(p, 12000) : p; }

  function rulesSteps() {
    return [
      '用 Safari 或 Chrome 打開 console.firebase.google.com，點進專案 ID 為「' + projectId() + '」的專案（點左上角齒輪 →「專案設定」可看到專案 ID，必須完全一樣）。',
      '左側選「Firestore Database」，上方切到「規則（Rules）」分頁。',
      '另開一個分頁到你的 GitHub repository，點檔案「firestore.rules」，按右上角「Copy raw file」（兩個方框的複製圖示）。',
      '回到 Firebase 規則編輯區，按 ⌘A 全選 → Delete 刪除 → ⌘V 貼上。第一行必須是 rules_version = \'2\';',
      '按「發布（Publish）」，看到發布成功後等 1 分鐘，回到後台按 ⌘R 重新整理，再按「檢查並發布」。'
    ];
  }
  function netSteps() {
    return [
      '先確認網路正常（開其他網站試試），再按下方「重新診斷」。',
      '有安裝廣告阻擋程式（AdBlock、uBlock、1Blocker、AdGuard、Brave 防護等）時，請對 myopiacare.site 暫停或加入白名單。Safari：選單列「Safari → 此網站的設定…」→ 取消勾選「啟用內容阻擋器」。',
      '公司、學校或公共 Wi‑Fi 有時會擋 Google 的資料庫服務，可改用手機熱點再試一次。',
      '換另一個瀏覽器（Chrome 或 Safari）登入後台再發布。'
    ];
  }
  function adminSteps(uid) {
    return [
      '打開 console.firebase.google.com → 專案「' + projectId() + '」→ 左側「Firestore Database」→「資料」分頁。',
      '點「admins」集合（沒有的話按「開始集合」，集合 ID 填 admins）→「新增文件」。',
      '文件 ID 貼上 ' + uid + '（不要按「自動 ID」），欄位 role、類型 string、值 owner → 儲存。',
      '回到後台按 ⌘R 重新整理，再按「檢查並發布」。'
    ];
  }
  function loginSteps() { return ['按右上角「登出」，再用管理員帳號重新登入。', '登入後再按「檢查並發布」。']; }

  function stepsBox(title, steps, tone) {
    var box = el('div', 'diag-fix is-' + tone);
    box.appendChild(el('strong', 'diag-fix-title', title));
    var ol = el('ol');
    steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
    box.appendChild(ol);
    diag.text.push('', '【' + title + '】');
    steps.forEach(function (s, i) { diag.text.push((i + 1) + '. ' + s); });
    return box;
  }
  function problemsBox(problems) {
    var box = el('div', 'diag-fix is-bad');
    var title = '還不能發布：有 ' + problems.length + ' 個地方需要修正';
    box.appendChild(el('strong', 'diag-fix-title', title));
    var ul = el('ul', 'diag-problems');
    diag.text.push('', '【' + title + '】');
    problems.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('span', null, p.msg));
      var go = el('button', 'btn btn-sm btn-outline', '前往修改');
      go.type = 'button';
      go.addEventListener('click', function () { goToField(p); });
      li.appendChild(go);
      ul.appendChild(li);
      diag.text.push('・' + p.msg);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'diag-note', '改好後再按「檢查並發布」。'));
    return box;
  }

  /* 跳到需要修正的欄位（視覺化編輯或欄位編輯都可以） */
  function goToField(p) {
    var dlg = $('#diag-dialog');
    if (dlg.open) dlg.close();
    activeSection = p.section;
    var visual = !$('#panel-visual').hidden;
    if (visual) {
      vis.target = { section: p.section, field: p.field || '', index: typeof p.index === 'number' ? p.index : -1, key: p.section };
      buildPanel();
      visPostSelect(p.section);
    } else if ($('#panel-content').hidden) {
      openTab('content');
    } else {
      buildForm();
    }
    var path = [p.section, p.field].concat(p.sub && p.index >= 0 ? [p.index, p.sub] : []);
    var input = doc.getElementById((visual ? 'vis-' : 'cms-') + path.join('-'));
    if (!input) return;
    var det = input.closest('details');
    if (det) det.open = true;
    var wrap = input.closest('.cms-field') || input;
    wrap.classList.add('is-target');
    if (wrap.scrollIntoView) wrap.scrollIntoView({ block: 'center', behavior: 'auto' });
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  }

  function prepDialog(title, lead, withTools) {
    diag.running++;
    diag.text = [];
    $('#diag-dialog-title').textContent = title;
    var body = $('#diag-body');
    body.textContent = '';
    if (lead) body.appendChild(el('p', 'diag-lead', lead));
    $('#diag-run').hidden = !withTools;
    $('#diag-copy').hidden = !withTools;
    var dialog = $('#diag-dialog');
    if (!dialog.open) dialog.showModal();
    return body;
  }

  /* 發布前格式檢查沒通過：列出問題與「前往修改」 */
  function showProblems(problems) {
    diag.err = null;
    diag.fromPublish = false;
    var body = prepDialog('還不能發布', '下面這些地方修正後，就可以發布：', false);
    body.appendChild(problemsBox(problems));
  }

  var LEADS = {
    'permission-denied': '資料庫拒絕了這次發布（權限不足）。',
    'timeout': '等了 25 秒仍沒有收到資料庫回應，連線可能被擋住了。',
    'unavailable': '目前連不上資料庫。',
    'deadline-exceeded': '資料庫回應逾時。',
    'unauthenticated': '登入狀態已失效。',
    'resource-exhausted': 'Firebase 回報今天的免費使用量已用完。',
    'invalid-argument': '資料庫不接受這份內容。'
  };

  function openDiag(err, fromPublish) {
    diag.err = err || null;
    diag.fromPublish = !!fromPublish;
    var first = fromPublish ? (LEADS[err && err.code] || '發布時發生錯誤（' + codeOf(err) + '）。') : '';
    var body = prepDialog(fromPublish ? '發布沒有成功：正在找原因…' : '連線診斷：檢查中…',
      first + '正在逐項檢查網站、帳號與資料庫設定（只讀取資料，不會改動網站內容）…', true);
    var run = diag.running;
    diag.text.push('MyopiaCare 後台診斷　' + new Date().toLocaleString('zh-TW'), '網址：' + location.host);
    if (err) diag.text.push('發布錯誤代碼：' + codeOf(err));
    var out = el('div', 'diag-out');
    body.appendChild(out);
    var list = el('ol', 'diag-list');
    body.appendChild(list);
    $('#diag-run').disabled = true;
    runDiag(list, run).then(function (res) {
      if (!res || run !== diag.running) return;
      $('#diag-run').disabled = false;
      $('#diag-dialog-title').textContent = fromPublish ? '發布沒有成功：原因與解決步驟' : '連線診斷結果';
      $('.diag-lead', body).textContent = first + '檢查完成，結果與解決步驟如下（下方是每一項的檢查明細）：';
      conclude(res).forEach(function (n) { out.appendChild(n); });
      body.scrollTop = 0;
    });
  }

  function runDiag(list, run) {
    var user = currentUser;
    var res = {};
    var stop = '';
    function line(label) {
      var li = el('li', 'diag-item is-run');
      var icon = el('span', 'diag-icon', '…');
      icon.setAttribute('aria-hidden', 'true');
      li.appendChild(icon);
      li.appendChild(el('strong', 'diag-label', label));
      var detail = el('span', 'diag-detail', '檢查中…');
      li.appendChild(detail);
      list.appendChild(li);
      return function (state, text) {
        if (run !== diag.running) return;
        li.className = 'diag-item is-' + state;
        icon.textContent = { ok: '✓', warn: '!', skip: '–' }[state] || '✕';
        detail.textContent = text;
        diag.text.push(({ ok: '✓', warn: '!', skip: '–' }[state] || '✕') + ' ' + label + '：' + text);
      };
    }
    var DB_STEPS = ['admin', 'read', 'rules', 'write', 'lock'];
    var steps = [
      ['config', '網站的 Firebase 設定（config.js）', function () { return Promise.resolve(['ok', '專案 ID：' + projectId()]); }],
      ['login', '登入帳號', function () { return Promise.resolve(user ? ['ok', (user.email || '') + '（UID：' + user.uid + '）'] : ['bad', '目前沒有登入']); }],
      ['admin', '管理員名單（admins）', function () {
        return timed(fs.getDoc(fs.doc(db, 'admins', user.uid))).then(function (s) {
          return s.exists() ? ['ok', '這個帳號在管理員名單內'] : ['bad', '找不到文件 ID 等於這個 UID 的管理員文件'];
        });
      }],
      ['read', '讀取網站內容', function () {
        return timed(fs.getDoc(fs.doc(db, 'site', 'content'))).then(function (s) {
          return ['ok', s.exists() ? '可以讀取（已有發布過的內容）' : '可以讀取（還沒發布過，第一次發布會自動建立）'];
        });
      }],
      ['rules', '資料庫規則（管理員讀取權限）', function () {
        return timed(Promise.all([
          fs.getDocs(fs.query(fs.collection(db, 'siteHistory'), fs.limit(1))),
          fs.getDocs(fs.query(fs.collection(db, 'mediaIndex'), fs.limit(1)))
        ])).then(function () { return ['ok', '版本紀錄與圖片庫都可以讀取']; });
      }],
      ['write', '資料庫寫入測試（不會改動任何內容）', function () {
        return timed(fs.setDoc(fs.doc(db, 'stats', 'visits'), { count: fs.increment(0) }, { merge: true })).then(function () { return ['ok', '可以寫入']; });
      }],
      ['lock', '資料庫安全鎖（規則不是測試模式）', function () {
        return timed(fs.getDoc(fs.doc(db, 'mcDiagnostics', 'probe'))).then(function () {
          return ['warn', '規則仍是「測試模式」：任何人都能讀寫資料庫（包含客戶提問），而且建立約 30 天後會自動鎖死，屆時後台完全無法使用。'];
        }, function (err) {
          if (err && err.code === 'permission-denied') return ['ok', '已鎖好（只有管理員能修改）'];
          throw err;
        });
      }],
      ['content', '網站內容格式', function () {
        flushEditors();
        var c = contentState ? clone(contentState) : null;
        if (!c) return Promise.resolve(['skip', '內容尚未載入']);
        URL_FIELDS.forEach(function (p) { if (isObj(c[p[0]]) && typeof c[p[0]][p[1]] === 'string') c[p[0]][p[1]] = fixUrl(c[p[0]][p[1]], p[1]); });
        var probs = validateContent(c);
        var size = JSON.stringify(c).length;
        if (size > MAX_JSON) probs.push({ msg: '網站內容總長度約 ' + Math.round(size / 1000) + ' 千字元，超過上限 290 千字元，請刪減消息內文。', section: 'news', field: 'items', index: -1 });
        res.problems = probs;
        return Promise.resolve(probs.length
          ? ['bad', probs.length + ' 個地方需要修正（見下方）']
          : ['ok', '格式正確（約 ' + Math.max(1, Math.round(size / 1000)) + ' 千字元）']);
      }]
    ];
    var chain = Promise.resolve();
    steps.forEach(function (s) {
      chain = chain.then(function () {
        if (run !== diag.running) return;
        var set = line(s[1]);
        var isDb = DB_STEPS.indexOf(s[0]) !== -1;
        if (isDb && (stop === 'net' || stop === 'login')) { res[s[0]] = 'skip'; set('skip', stop === 'net' ? '連不上資料庫，略過這一項' : '沒有登入，略過這一項'); return; }
        if ((s[0] === 'rules' || s[0] === 'write') && stop === 'admin') { res[s[0]] = 'skip'; set('skip', '帳號不在管理員名單內，略過這一項'); return; }
        return s[2]().then(function (r) {
          res[s[0]] = r[0];
          set(r[0], r[1]);
        }, function (err) {
          res[s[0]] = 'bad';
          res[s[0] + 'Err'] = err;
          if (isNet(err)) { stop = 'net'; set('bad', '連不上資料庫（' + codeOf(err) + '）'); }
          else if (err && err.code === 'permission-denied') set('bad', '被資料庫規則拒絕（permission-denied）');
          else set('bad', '發生錯誤（' + codeOf(err) + '）');
        }).then(function () {
          if (s[0] === 'login' && res.login === 'bad') stop = 'login';
          if (s[0] === 'admin' && res.admin === 'bad' && !stop) stop = 'admin';
        });
      });
    });
    return chain.then(function () { return run === diag.running ? res : null; });
  }

  function conclude(res) {
    var err = diag.err;
    var uid = currentUser ? currentUser.uid : '';
    var out = [];
    var anyNet = [res.adminErr, res.readErr, res.rulesErr, res.writeErr, res.lockErr].some(isNet);
    var rulesShown = false;
    if (res.login === 'bad' || (err && err.code === 'unauthenticated')) {
      out.push(stepsBox('原因：登入狀態已失效', loginSteps(), 'bad'));
    } else if (anyNet) {
      out.push(stepsBox('原因：連不上資料庫（網路或瀏覽器外掛擋住了連線）', netSteps(), 'bad'));
    } else if (res.admin === 'bad') {
      rulesShown = !!(res.adminErr && res.adminErr.code === 'permission-denied');
      out.push(rulesShown
        ? stepsBox('原因：資料庫規則沒有正確發布', rulesSteps(), 'bad')
        : stepsBox('原因：這個帳號不在管理員名單內', adminSteps(uid), 'bad'));
    } else if (res.read === 'bad' || res.rules === 'bad' || res.write === 'bad') {
      rulesShown = true;
      out.push(stepsBox('原因：資料庫規則不是最新版（或貼到了別的 Firebase 專案）', rulesSteps(), 'bad'));
    } else if (res.content === 'bad' && res.problems && res.problems.length) {
      out.push(problemsBox(res.problems));
    } else if (err && err.code === 'permission-denied') {
      rulesShown = true;
      out.push(stepsBox('原因：資料庫規則中「網站內容」的部分不是最新版', rulesSteps(), 'bad'));
    } else if (err && err.code === 'resource-exhausted') {
      out.push(stepsBox('原因：今天的 Firebase 免費使用量已用完', ['免費方案每天約可寫入 2 萬次，台灣時間每天下午 3～4 點重新計算。', '先按工具列「下載備份」存一份內容，等重新計算後再按「檢查並發布」。'], 'warn'));
    } else if (err && err.code === 'invalid-argument') {
      out.push(stepsBox('原因：資料庫不接受這份內容', ['按工具列「下載備份」存一份內容檔。', '按下方「複製診斷結果」，連同備份檔一起交給技術人員檢查。'], 'bad'));
    } else if (err) {
      out.push(stepsBox('設定都正常，剛才可能只是連線不穩', ['按「關閉」，再按一次「檢查並發布」。', '仍然失敗時，依照下面的連線檢查處理，或按「複製診斷結果」交給技術人員。'].concat(netSteps().slice(1)), 'warn'));
    } else {
      var ok = el('div', 'diag-fix is-ok');
      ok.appendChild(el('strong', 'diag-fix-title', '全部正常：設定都正確，可以按「檢查並發布」。'));
      diag.text.push('', '【全部正常】');
      out.push(ok);
    }
    if (res.lock === 'warn' && !rulesShown) {
      out.push(stepsBox('另外建議：把資料庫規則換成正式版（保護客戶資料）', rulesSteps(), 'warn'));
    }
    return out;
  }

  function copyText(text) {
    function fallback() {
      var ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'sr-copy';
      $('#diag-dialog').appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    var done = function () { toast('診斷結果已複製，可以直接貼上傳給技術人員。'); };
    var fail = function () { if (fallback()) done(); else toast('無法自動複製，請改用截圖。'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }

  function loadHistory() {
    var list = $('#history-list');
    list.textContent = '';
    list.appendChild(el('li', 'inbox-empty', '讀取中…'));
    fs.getDocs(fs.query(fs.collection(db, 'siteHistory'), fs.orderBy('savedAt', 'desc'), fs.limit(HISTORY_KEEP))).then(function (snap) {
      list.textContent = '';
      if (!snap.docs.length) { list.appendChild(el('li', 'inbox-empty', '還沒有版本紀錄，第一次發布後就會出現。')); return; }
      snap.docs.forEach(function (d, i) {
        var v = d.data();
        var li = el('li', 'history-item');
        var info = el('div', 'history-info');
        info.appendChild(el('strong', null, fmtTime(v.savedAt) + (i === 0 ? '（目前版本）' : '')));
        info.appendChild(el('small', null, (v.savedBy || '') + ' · ' + Math.round(str(v.json).length / 1024) + ' KB'));
        li.appendChild(info);
        var load = el('button', 'btn btn-sm btn-outline', '載入到編輯器');
        load.type = 'button';
        load.addEventListener('click', function () {
          if (contentDirty && !window.confirm('目前有尚未發布的修改，載入舊版本會覆蓋它們。確定載入？')) return;
          try {
            contentState = ensureIds(MC.withDefaults(JSON.parse(v.json)));
            activeSection = 'site';
            contentReplaced();
            setDirty(true);
            openTab('content');
            setStatus($('#content-status'), '已載入 ' + fmtTime(v.savedAt) + ' 的版本。確認無誤後按「檢查並發布」即可還原。', 'warn');
          } catch (e) { toast('這個版本的資料無法讀取。'); }
        });
        li.appendChild(load);
        list.appendChild(li);
      });
    }, function (err) {
      list.textContent = '';
      list.appendChild(el('li', 'inbox-empty', '無法讀取版本紀錄（' + (err.code || '錯誤') + '），請確認已發布最新的 firestore.rules。'));
    });
  }

  function bindCmsForm(form, afterListChange) {
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset.path || !contentState) return;
      var kind = t.dataset.kind;
      if (kind === 'bool' || kind === 'radio') return;
      setIn(contentState, JSON.parse(t.dataset.path), t.value);
      setDirty(true);
    });
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.dataset.path || !contentState) return;
      var path = JSON.parse(t.dataset.path);
      if (t.dataset.kind === 'bool') setIn(contentState, path, t.checked);
      else if (t.dataset.kind === 'radio') { if (t.checked) setIn(contentState, path, t.value); }
      else setIn(contentState, path, t.value);
      setDirty(true);
    });
    form.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn || !contentState || !form.contains(btn)) return;
      e.preventDefault();
      flushEditors();
      var path = JSON.parse(btn.dataset.path);
      var arr = getIn(contentState, path);
      if (!Array.isArray(arr)) return;
      var i = parseInt(btn.dataset.index, 10);
      var action = btn.dataset.action;
      var spec = schemaFor(path[0]).fields[path[1]];
      var focus = -1;
      if (action === 'add') {
        var tpl = getIn(DEFAULTS, path);
        var blank = MC.blankOf(Array.isArray(tpl) && tpl.length ? tpl[0] : {});
        if ('icon' in blank) blank.icon = 'cloud';
        if ('id' in blank) blank.id = newId();
        if ('date' in blank) blank.date = today();
        if (spec.newestFirst) arr.unshift(blank); else arr.push(blank);
        focus = spec.newestFirst ? 0 : arr.length - 1;
      } else if (action === 'remove') {
        if (!window.confirm('確定刪除這個項目嗎？（按「檢查並發布」後才會真的生效）')) return;
        arr.splice(i, 1);
      } else if (action === 'up' && i > 0) {
        arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
        focus = i - 1;
      } else if (action === 'down' && i < arr.length - 1) {
        arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
        focus = i + 1;
      } else return;
      afterListChange(path, focus);
      setDirty(true);
    });
  }

  function initContentEditor() {
    bindCmsForm($('#content-form'), function () {
      var y = window.scrollY;
      buildForm();
      window.scrollTo(0, y);
    });
    $('#cms-nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-section]');
      if (!b || !contentState) return;
      flushEditors();
      activeSection = b.dataset.section;
      buildForm();
      var top = $('#panel-content').getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top) window.scrollTo(0, top);
    });
    $('#btn-save').addEventListener('click', startPublish);
    $('#btn-check').addEventListener('click', function () { flushEditors(); checkPending = false; showCheck(checkCompliance(), false); });
    $('#check-publish').addEventListener('click', function () { checkPending = false; $('#check-dialog').close(); publish(); });
    $('#check-dialog').addEventListener('close', function () {
      if (!checkPending) return;
      checkPending = false;
      setStatus($('#content-status'), '尚未發布：用語檢查視窗已關閉。修改用語後再按「檢查並發布」，或在視窗裡按「我已確認，仍要發布」。', 'warn');
    });
    $('#btn-diag').addEventListener('click', function () { openDiag(null, false); });
    $('#diag-run').addEventListener('click', function () { openDiag(null, false); });
    $('#diag-copy').addEventListener('click', function () { copyText(diag.text.join('\n')); });
    $('#btn-reload').addEventListener('click', function () {
      if (contentDirty && !window.confirm('要放棄尚未發布的修改嗎？')) return;
      loadContent();
    });
    $('#btn-defaults').addEventListener('click', function () {
      if (!window.confirm('要把所有欄位換回預設內容嗎？（按「檢查並發布」後才會生效）')) return;
      contentState = ensureIds(MC.withDefaults(null));
      contentReplaced();
      setDirty(true);
      setStatus($('#content-status'), '已套用預設內容，確認後請按「檢查並發布」。', 'warn');
    });
    $('#btn-backup').addEventListener('click', function () {
      if (!contentState) return;
      flushEditors();
      var d = new Date();
      download(new Blob([JSON.stringify(contentState, null, 2)], { type: 'application/json' }), 'myopiacare-content-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json');
    });
    $('#file-import').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 400000) { toast('檔案太大，請確認是網站內容備份檔。'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          if (!isObj(data)) throw new Error('bad');
          contentState = ensureIds(MC.withDefaults(data));
          contentReplaced();
          setDirty(true);
          setStatus($('#content-status'), '備份已匯入，確認內容後請按「檢查並發布」。', 'warn');
        } catch (err) { toast('無法讀取：這不是有效的網站內容備份檔。'); }
      };
      reader.readAsText(file);
    });
    window.addEventListener('beforeunload', function (e) { if (contentDirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* =========================================================
     視覺化編輯：左邊是網站即時預覽（點選任何物件），右邊是該物件的編輯面板
     預覽框只接受同網域（本後台）傳來的內容；未發布前，正式網站不會改變。
     ========================================================= */
  var DEVICES = { desktop: 1280, tablet: 820, mobile: 390 };
  var vis = { loaded: false, ready: false, target: null, timer: 0, labels: null, device: 'desktop', waitTimer: 0 };

  function visFrame() { return $('#visual-frame'); }
  function visLabels() {
    if (vis.labels) return vis.labels;
    var m = {};
    SCHEMA.forEach(function (s) {
      m[s.key] = s.label;
      Object.keys(s.fields).forEach(function (k) { m[s.key + '.' + k] = s.label + ' › ' + s.fields[k].label; });
    });
    vis.labels = m;
    return m;
  }
  function visPost(msg) {
    var f = visFrame();
    if (!vis.ready || !f || !f.contentWindow) return;
    try { f.contentWindow.postMessage(msg, window.location.origin); } catch (e) { /* ignore */ }
  }
  function visSend(now) {
    clearTimeout(vis.timer);
    if (!vis.loaded) return;
    var run = function () { if (contentState) visPost({ mc: 'content', content: contentState, labels: visLabels() }); };
    if (now) run(); else vis.timer = setTimeout(run, 180);
  }
  function visPostSelect(key) { if (key) visPost({ mc: 'select', key: key }); }

  function visTargetFromKey(key) {
    var parts = String(key || '').split('.');
    var sec = schemaFor(parts[0]);
    if (!sec || !contentState) return null;
    var t = { section: sec.key, field: '', index: -1, key: String(key) };
    var f = parts[1];
    if (f && Object.prototype.hasOwnProperty.call(sec.fields, f)) {
      t.field = f;
      if (sec.fields[f].type === 'list' && parts.length > 2) {
        var arr = (contentState[sec.key] || {})[f] || [];
        var ref = parts.slice(2).join('.');
        if (ref.charAt(0) === '@') {
          for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === ref.slice(1)) { t.index = i; break; }
        } else if (/^\d+$/.test(ref)) {
          t.index = Math.min(parseInt(ref, 10), arr.length - 1);
        }
      }
    }
    return t;
  }
  function itemKey(path, index) {
    if (index < 0) return path.join('.');
    var arr = getIn(contentState, path) || [];
    if (path.join('.') === 'news.items') return arr[index] && arr[index].id ? 'news.items.@' + arr[index].id : 'news.items';
    return path.join('.') + '.' + index;
  }

  function visIntro() {
    var box = el('section', 'cms-section vis-section');
    box.appendChild(el('h2', 'cms-section-title', '點選預覽畫面開始編輯'));
    box.appendChild(el('p', 'cms-hint cms-section-desc', '在預覽畫面中直接點選任何文字、圖片、按鈕或區塊，這裡就會出現對應的編輯欄位，修改後預覽立即更新。也可以從下面直接選擇區塊。全部改好後，按上方「檢查並發布」才會正式上線。'));
    var grid = el('div', 'vis-sections');
    SCHEMA.forEach(function (s) {
      var b = el('button', 'vis-sec-btn', s.label);
      b.type = 'button';
      b.dataset.visSection = s.key;
      grid.appendChild(b);
    });
    box.appendChild(grid);
    return box;
  }

  function buildPanel() {
    var form = $('#visual-form');
    if (!form || !contentState) return;
    flushEditors();
    vEditors = [];
    sink = vEditors;
    form.textContent = '';
    var t = vis.target;
    var sec = t ? schemaFor(t.section) : null;
    if (!sec) { form.appendChild(visIntro()); sink = editors; return; }

    var box = el('section', 'cms-section vis-section');
    var head = el('div', 'vis-panel-head');
    head.appendChild(el('h2', 'cms-section-title', sec.label));
    var back = el('button', 'btn btn-sm btn-outline vis-back', '← 所有區塊');
    back.type = 'button';
    back.dataset.visHome = '1';
    head.appendChild(back);
    box.appendChild(head);
    if (sec.desc) box.appendChild(el('p', 'cms-hint cms-section-desc', sec.desc));
    if (sec.key !== 'sections' && typeof DEFAULTS.sections[sec.key] === 'boolean') {
      var tog = buildField(T('在網站上顯示這個區塊', { type: 'bool', hint: '關閉後前台不顯示（預覽中會變成半透明，方便再打開）。' }), ['sections', sec.key], contentState.sections[sec.key], 'vis-');
      tog.classList.add('vis-toggle');
      box.appendChild(tog);
    }
    var data = contentState[sec.key] || {};
    Object.keys(sec.fields).forEach(function (k) {
      var spec = sec.fields[k];
      var node = spec.type === 'list'
        ? buildList(spec, [sec.key, k], Array.isArray(data[k]) ? data[k] : [], { prefix: 'vis-', openIndex: t.field === k ? t.index : -1 })
        : buildField(spec, [sec.key, k], data[k], 'vis-');
      if (node) box.appendChild(node);
    });
    form.appendChild(box);
    sink = editors;

    var focusEl = null, input = null;
    if (t.field) {
      var spec = sec.fields[t.field];
      if (spec.type === 'list') {
        focusEl = t.index >= 0 ? $('.cms-item.is-target', form) : $('.cms-array', form);
      } else {
        input = doc.getElementById('vis-' + sec.key + '-' + t.field) || $('[name="vis-' + sec.key + '-' + t.field + '"]', form);
        focusEl = input && input.closest('.cms-field');
      }
    }
    if (focusEl) {
      focusEl.classList.add('is-target');
      if (focusEl.scrollIntoView) focusEl.scrollIntoView({ block: 'center', behavior: 'auto' });
      if (input && MC.finePointer.matches && /^(INPUT|TEXTAREA)$/.test(input.tagName) && input.type !== 'checkbox' && input.type !== 'radio') {
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      }
    } else {
      $('#visual-panel').scrollTop = 0;
    }
  }

  function visArticles() {
    var sel = $('#visual-article');
    if (!sel || !contentState) return;
    var keep = sel.value;
    sel.textContent = '';
    var list = MC.newsList(contentState);
    list.forEach(function (it) {
      var o = el('option', null, (it.date ? MC.fmtDate(it.date) + '　' : '') + it.title);
      o.value = it.id;
      sel.appendChild(o);
    });
    if (keep && list.some(function (it) { return it.id === keep; })) sel.value = keep;
    sel.hidden = $('#visual-page').value !== 'article';
    sel.disabled = !list.length;
  }
  function visUrl() {
    var page = $('#visual-page').value;
    var url;
    if (page === 'article' && $('#visual-article').value) url = MC.href('news', $('#visual-article').value);
    else url = MC.href(page === 'news' || page === 'article' ? 'news' : (page === 'privacy' ? 'privacy' : 'home'));
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'mc-edit=1';
  }
  function visLoad() {
    var f = visFrame();
    if (!f) return;
    vis.ready = false;
    vis.loaded = true;
    $('#visual-wait').hidden = true;
    clearTimeout(vis.waitTimer);
    vis.waitTimer = setTimeout(function () { if (!vis.ready) $('#visual-wait').hidden = false; }, 9000);
    f.src = visUrl();
  }
  function visFit() {
    var stage = $('#visual-stage');
    var f = visFrame();
    if (!stage || !f || $('#panel-visual').hidden) return;
    var w = DEVICES[vis.device] || DEVICES.desktop;
    var avail = Math.max(240, stage.clientWidth - 2);
    var scale = Math.min(1, avail / w);
    var h = Math.max(360, stage.clientHeight - 2);
    f.style.width = w + 'px';
    f.style.height = Math.round(h / scale) + 'px';
    f.style.transform = scale < 1 ? 'scale(' + scale.toFixed(4) + ')' : '';
    var screen = $('.visual-screen', stage);
    screen.style.width = Math.round(w * scale) + 'px';
    screen.style.height = h + 'px';
    $('#visual-scale').textContent = DEVICES[vis.device] + 'px' + (scale < 1 ? '（縮放 ' + Math.round(scale * 100) + '%）' : '');
  }
  function visOpen() {
    if (!contentState) return;
    if (!vis.deviceChosen && window.innerWidth < 700) {
      vis.device = 'mobile';
      $all('[data-device]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.device === 'mobile')); });
    }
    visArticles();
    if (!vis.loaded) visLoad(); else visSend(true);
    buildPanel();
    visFit();
  }

  function initVisual() {
    var form = $('#visual-form');
    bindCmsForm(form, function (path, focus) {
      vis.target = { section: path[0], field: path[1], index: focus, key: itemKey(path, focus) };
      if (path.join('.') === 'news.items') visArticles();
      buildPanel();
      if (focus >= 0) visPostSelect(vis.target.key);
    });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !form.contains(b)) return;
      if (b.dataset.visSection) {
        e.preventDefault();
        vis.target = { section: b.dataset.visSection, field: '', index: -1, key: b.dataset.visSection };
        buildPanel();
        visPostSelect(b.dataset.visSection);
      } else if (b.dataset.visHome) {
        e.preventDefault();
        vis.target = null;
        buildPanel();
      } else if (b.dataset.visArticle) {
        e.preventDefault();
        flushEditors();
        $('#visual-page').value = 'article';
        visArticles();
        $('#visual-article').value = b.dataset.visArticle;
        visLoad();
      }
    });
    $('#visual-page').addEventListener('change', function () { flushEditors(); visArticles(); visLoad(); });
    $('#visual-article').addEventListener('change', function () { flushEditors(); visLoad(); });
    $('#visual-reload').addEventListener('click', function () { flushEditors(); visLoad(); });
    $('#visual-retry').addEventListener('click', function () { flushEditors(); visLoad(); });
    $all('[data-device]').forEach(function (b) {
      b.addEventListener('click', function () {
        vis.device = b.dataset.device;
        vis.deviceChosen = true;
        $all('[data-device]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        visFit();
      });
    });
    var fitTimer = 0;
    window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(visFit, 120); });
    window.addEventListener('message', function (e) {
      var f = visFrame();
      if (!f || e.source !== f.contentWindow || e.origin !== window.location.origin) return;
      var d = e.data;
      if (!isObj(d) || typeof d.mc !== 'string') return;
      if (d.mc === 'ready') {
        vis.ready = true;
        clearTimeout(vis.waitTimer);
        $('#visual-wait').hidden = true;
        visSend(true);
        if (vis.target) visPostSelect(vis.target.key);
      } else if (d.mc === 'select' && typeof d.key === 'string' && d.key.length < 200) {
        if (!contentState) return;
        var t = visTargetFromKey(d.key);
        if (!t) return;
        vis.target = t;
        buildPanel();
      }
    });
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    initTabs();
    initLogin();
    initInbox();
    initContentEditor();
    initVisual();
    $('#btn-logout').addEventListener('click', function () {
      if (contentDirty && !window.confirm('網站內容有尚未發布的修改，確定要登出嗎？')) return;
      logout();
    });
    $all('[data-logout]').forEach(function (b) { b.addEventListener('click', function () { logout(); }); });
    $('#btn-password').addEventListener('click', function () {
      if (!currentUser || !currentUser.email) return;
      fa.sendPasswordResetEmail(auth, currentUser.email).then(function () { toast('更改密碼的連結已寄到 ' + currentUser.email); }, function (err) { toast(authMsg(err)); });
    });
    $('#btn-copy-uid').addEventListener('click', function () {
      var uid = $('#denied-uid').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(uid).then(function () { toast('UID 已複製。'); }, function () { toast('請手動選取複製。'); });
    });
    if (!FB || !FB.isConfigured()) { show('setup'); return; }
    Promise.all([FB.auth(), FB.firestore()]).then(function (r) {
      auth = r[0].auth; fa = r[0].fa;
      db = r[1].db; fs = r[1].fs;
      return fa.setPersistence(auth, fa.browserSessionPersistence).catch(function () {});
    }).then(function () {
      fa.onAuthStateChanged(auth, onUser);
    }).catch(function (err) {
      $('#setup-error').textContent = '無法載入 Firebase（' + ((err && (err.code || err.message)) || '未知錯誤') + '）。請檢查網路，以及 config.js 的設定是否正確。';
      show('setup');
    });
  }

  window.MCAdminDebug = {
    schema: SCHEMA,
    check: function (c) { var keep = contentState; contentState = c; var r = checkCompliance(); contentState = keep; return r; },
    state: function () { return contentState; },
    vis: vis
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
