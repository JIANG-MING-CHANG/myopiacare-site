# MyopiaCare｜豪智慧有限公司 官方網站 v9

## 網址

| 頁面 | 網址 |
| --- | --- |
| 首頁 | https://myopiacare.site/ |
| 最新消息列表 | https://myopiacare.site/news/ |
| 單則消息 | https://myopiacare.site/news/?id=代號 |
| 隱私權政策 | https://myopiacare.site/privacy/ |
| 管理後台 | https://myopiacare.site/admin/ |

## 檔案說明

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 首頁 |
| `news/index.html`、`privacy/index.html` | 內頁 |
| `admin/index.html` | 管理後台 |
| `404.html` | 找不到頁面 |
| `CNAME` | 自訂網域 `myopiacare.site` |
| `firestore.rules` | 資料庫安全規則 v3（貼到 Firebase 主控台並發布） |
| `assets/js/config.js` | **Firebase 連線設定（部署時必填）** |
| `assets/js/content.js` | 網站預設文字（平常請改用後台） |
| `assets/js/core.js` | 共用核心：內容載入、白名單過濾、路由、互動效果、瀏覽人次、視覺化編輯模式 |
| `assets/js/main.js` / `page.js` | 首頁／內頁程式 |
| `assets/js/admin.js` / `admin-editor.js` | 後台、視覺化編輯、圖片庫、格式文字編輯器 |
| `assets/vendor/firebase-12.19.0/` | Firebase 官方 SDK（自家主機，不依賴第三方 CDN） |
| `assets/css/style.css` | 樣式；最上方 `:root` 是色彩變數 |
