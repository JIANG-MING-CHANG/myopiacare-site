/*
 * Firebase 連線設定（部署指南第 3 步會教你填）
 * ------------------------------------------------------------
 * 到 Firebase 主控台 →（齒輪）專案設定 → 一般 → 你的應用程式 → 網頁應用程式
 * →「SDK 設定和配置」選「設定 (Config)」，把對應的值貼到下面的引號裡。
 *
 * 這些值本來就會公開在每個 Firebase 網站上，不是密碼；
 * 真正的安全防線是 firestore.rules（只有管理員能讀取客戶提問）。
 *
 * 全部留空時，網站會以「示範模式」運作：畫面正常，但表單不會送出。
 */
window.MC_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
