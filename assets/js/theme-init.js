/* 在畫面繪製前套用使用者選過的深/淺色主題，避免閃爍。 */
(function () {
  try {
    var t = localStorage.getItem('mc-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* 隱私模式等情況下 localStorage 可能無法使用，忽略即可 */ }
  document.documentElement.classList.add('js');
})();
