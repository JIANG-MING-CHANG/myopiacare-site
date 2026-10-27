/*
 * Firebase 載入器
 * - SDK 檔案放在本網站自己的 /assets/vendor/ 內（不依賴第三方 CDN，版本固定 12.19.0）。
 * - 需要時才載入：一般瀏覽只用輕量的 REST 讀取公開內容與圖片。
 */
(function () {
  'use strict';

  var VERSION = '12.19.0';
  // SDK 位置以本檔案的網址推算（assets/js/ → assets/vendor/），任何頁面深度都正確
  var BASE = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (src) return new URL('../vendor/firebase-' + VERSION + '/', src).href;
    } catch (e) { /* ignore */ }
    return '/assets/vendor/firebase-' + VERSION + '/';
  })();
  var cfg = window.MC_FIREBASE_CONFIG || {};
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function isConfigured() {
    return !!(cfg && typeof cfg.apiKey === 'string' && cfg.apiKey.length > 10 &&
      typeof cfg.projectId === 'string' && /^[a-z0-9-]{3,40}$/.test(cfg.projectId) &&
      typeof cfg.appId === 'string' && cfg.appId.length > 5);
  }

  function makeError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  var appPromise = null;
  var firestorePromise = null;
  var authPromise = null;

  function loadApp() {
    if (!isConfigured()) return Promise.reject(makeError('not-configured', 'Firebase 尚未設定'));
    if (!appPromise) {
      appPromise = import(BASE + 'firebase-app.js').then(function (m) {
        return m.getApps().length ? m.getApp() : m.initializeApp(cfg);
      }).catch(function (err) { appPromise = null; throw err; });
    }
    return appPromise;
  }

  function firestore() {
    if (!firestorePromise) {
      firestorePromise = Promise.all([loadApp(), import(BASE + 'firebase-firestore.js')])
        .then(function (r) { return { db: r[1].getFirestore(r[0]), fs: r[1] }; })
        .catch(function (err) { firestorePromise = null; throw err; });
    }
    return firestorePromise;
  }

  function auth() {
    if (!authPromise) {
      authPromise = Promise.all([loadApp(), import(BASE + 'firebase-auth.js')])
        .then(function (r) { return { auth: r[1].getAuth(r[0]), fa: r[1] }; })
        .catch(function (err) { authPromise = null; throw err; });
    }
    return authPromise;
  }

  /* 以 REST API 讀取一份公開文件的欄位；失敗回傳 null。 */
  function restGet(path, timeoutMs) {
    if (!isConfigured() || !window.fetch) return Promise.resolve(null);
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) +
      '/databases/(default)/documents/' + path + '?key=' + encodeURIComponent(cfg.apiKey);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 6000);
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) { return d && d.fields ? d.fields : null; })
      .catch(function () { return null; })
      .then(function (r) { clearTimeout(timer); return r; });
  }

  function fetchSiteContent(timeoutMs) {
    return restGet('site/content', timeoutMs).then(function (f) {
      var raw = f && f.json && f.json.stringValue;
      if (!raw) return null;
      try {
        var data = JSON.parse(raw);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      } catch (e) { return null; }
    });
  }

  /* 讀取一張圖片（存放在 Firestore 的 media 集合，免費方案即可使用）。 */
  var mediaCache = {};
  var DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  function fetchMedia(id) {
    if (!ID_RE.test(String(id))) return Promise.resolve(null);
    if (!mediaCache[id]) {
      mediaCache[id] = restGet('media/' + id, 15000).then(function (f) {
        var data = f && f.data && f.data.stringValue;
        if (!data || !DATA_RE.test(data)) { delete mediaCache[id]; return null; }
        return { data: data, alt: (f.alt && f.alt.stringValue) || '' };
      });
    }
    return mediaCache[id];
  }

  /* 瀏覽人次：以 REST 寫入「+1」（伺服器端遞增，規則只允許每次 +1），回傳最新總數；失敗回傳 null。 */
  function restBase() {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) + '/databases/(default)/documents';
  }
  function incrementVisits(timeoutMs) {
    if (!isConfigured() || !window.fetch) return Promise.resolve(null);
    var docName = 'projects/' + cfg.projectId + '/databases/(default)/documents/stats/visits';
    var body = JSON.stringify({
      writes: [{
        update: { name: docName, fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }]
      }]
    });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 6000);
    return fetch(restBase() + ':commit?key=' + encodeURIComponent(cfg.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      signal: ctrl ? ctrl.signal : undefined,
      credentials: 'omit',
      referrerPolicy: 'strict-origin-when-cross-origin'
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        var wr = d && d.writeResults && d.writeResults[0];
        var tr = wr && wr.transformResults && wr.transformResults[0];
        var v = tr && (tr.integerValue != null ? tr.integerValue : tr.doubleValue);
        return v != null && isFinite(Number(v)) ? Number(v) : null;
      })
      .catch(function () { return null; })
      .then(function (r) { clearTimeout(timer); return r; });
  }
  function fetchVisits(timeoutMs) {
    return restGet('stats/visits', timeoutMs).then(function (f) {
      var c = f && f.count;
      var v = c && (c.integerValue != null ? c.integerValue : c.doubleValue);
      return v != null && isFinite(Number(v)) ? Number(v) : null;
    });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(makeError('timeout', '連線逾時')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  window.MC_FIREBASE = {
    VERSION: VERSION,
    isConfigured: isConfigured,
    firestore: firestore,
    auth: auth,
    fetchSiteContent: fetchSiteContent,
    fetchMedia: fetchMedia,
    incrementVisits: incrementVisits,
    fetchVisits: fetchVisits,
    withTimeout: withTimeout
  };
})();
