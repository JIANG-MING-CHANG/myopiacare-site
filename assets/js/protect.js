/* 防止複製（v17 起）
   只作用在公開網頁：首頁、最新消息、隱私權政策、404（這些頁面的 <html> 帶有 class="mc-protect"）。
   管理後台沒有這個 class，視覺化編輯器（網址帶 mc-edit=1 並嵌在後台裡）也會自動關閉，所以不受影響。
   擋住：右鍵選單、選取文字、複製／剪下、拖曳圖片與連結、常用快捷鍵（複製、全選、存檔、列印、檢視原始碼、開發者工具）。
   提問表單的輸入欄位照常可以選取、複製、貼上；LINE 行動條碼（data-allow-save）可長按或右鍵儲存。
   後台「網站設定」→「防止複製」可以關閉。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var DEFAULT_MSG = '本網站內容受著作權保護，請勿複製。';
  var PUBLIC = root.classList.contains('mc-protect');
  if (!PUBLIC) return;

  var EDIT = (function () {
    try {
      if (window.parent === window) return false;
      if (new URLSearchParams(window.location.search).get('mc-edit') !== '1') return false;
      return window.parent.location.origin === window.location.origin;
    } catch (e) { return false; }
  })();
  if (EDIT) root.classList.remove('mc-protect');

  var msg = DEFAULT_MSG;
  var last = 0;

  function on() { return root.classList.contains('mc-protect'); }
  function elOf(t) { return t && t.nodeType === 1 ? t : (t && t.parentElement) || null; }
  function inField(t) {
    var el = elOf(t);
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
  }
  function allowSave(t) {
    var el = elOf(t);
    return !!(el && el.closest && el.closest('[data-allow-save]'));
  }
  function tip() {
    if (!msg) return;
    var now = Date.now();
    if (now - last < 2500) return;
    last = now;
    if (window.MC && typeof window.MC.toast === 'function') window.MC.toast(msg);
  }
  function stop(e, showTip) {
    e.preventDefault();
    e.stopPropagation();
    if (showTip) tip();
  }

  document.addEventListener('contextmenu', function (e) {
    if (on() && !inField(e.target) && !allowSave(e.target)) stop(e, true);
  }, true);
  ['copy', 'cut'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (on() && !inField(e.target)) stop(e, true);
    }, true);
  });
  document.addEventListener('selectstart', function (e) {
    if (on() && !inField(e.target)) e.preventDefault();
  }, true);
  document.addEventListener('dragstart', function (e) {
    if (on() && !inField(e.target) && !allowSave(e.target)) e.preventDefault();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!on()) return;
    var k = String(e.key || '').toLowerCase();
    var code = String(e.code || '');
    var mod = e.ctrlKey || e.metaKey;
    function is(letter) { return k === letter || code === 'Key' + letter.toUpperCase(); }
    // 開發者工具：F12、Ctrl+Shift+I/J/C、⌘+⌥+I/J/C
    if (k === 'f12' || code === 'F12') return stop(e, false);
    if (((mod && e.shiftKey) || (e.metaKey && e.altKey)) && (is('i') || is('j') || is('c'))) return stop(e, false);
    // 檢視原始碼：⌘+⌥+U
    if (e.metaKey && e.altKey && is('u')) return stop(e, true);
    if (!mod || e.altKey) return;
    // 檢視原始碼、另存網頁、列印：任何地方都擋
    if (is('u') || is('s') || is('p')) return stop(e, true);
    // 複製、剪下、全選：表單欄位以外才擋
    if (!inField(e.target) && (is('c') || is('x') || is('a'))) return stop(e, is('c') || is('x'));
  }, true);

  // 由 core.js 依後台設定開關（後台「網站設定」→「防止複製」與提示文字）
  window.MCProtect = {
    configure: function (enabled, message) {
      root.classList.toggle('mc-protect', !!enabled && !EDIT);
      msg = typeof message === 'string' ? message.trim() : DEFAULT_MSG;
    },
    enabled: on
  };
})();
