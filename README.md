# MyopiaCare｜豪智慧有限公司 官方網站 v9

純靜態網站（HTML／CSS／JavaScript，免建置工具），架設於 **GitHub Pages**，客戶提問、網站內容、圖片與瀏覽人次存放於 **Firebase Firestore**（免費 Spark 方案）。

## 網址（全部以 myopiacare.site/ 為根目錄）

| 頁面 | 網址 |
| --- | --- |
| 首頁 | https://myopiacare.site/ |
| 最新消息列表 | https://myopiacare.site/news/ |
| 單則消息 | https://myopiacare.site/news/?id=代號 |
| 隱私權政策 | https://myopiacare.site/privacy/ |
| 管理後台 | https://myopiacare.site/admin/（正式網站不放按鈕，請直接輸入網址或加入書籤） |

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

## 公司資料（預設內容）

- 創辦人：王志盟 Jyh-Meng Wang 醫師（眼專醫字第000810號）
- 電話：+886-926-016-016
- Email：excellence_intelligence@myopiacare.site
- 地址：苗栗縣苗栗市國際二巷4之1號
- LINE 官方帳號：@892zqqxn（https://line.me/R/ti/p/%40892zqqxn）

以上都可以在後台修改。首頁原始碼裡給 Google 看的結構化資料（`index.html` 的 JSON-LD）是固定文字，若日後電話、地址變更，請一併修改。

## 怎麼「執行」

這是純靜態網站，不需要安裝任何軟體、也不用下指令執行。檔案上傳到 GitHub 並開啟 Pages 後，GitHub 會在 1–2 分鐘內自動發布；之後每次上傳新檔案（Commit）也會自動更新。平常改文字、圖片只要到後台按「檢查並發布」。

## 本機預覽

解壓縮後直接雙擊 `index.html` 就能在電腦上預覽整個網站（版面、Logo、連結都正常）。本機預覽是「示範模式」：表單不會送出、後台不能登入、沒有瀏覽人次；這些功能要上傳到 GitHub、用 https://myopiacare.site 開啟才會運作。

## 後台可以做的事

- **視覺化編輯**：在即時預覽畫面（桌機／平板／手機）直接點選任何文字、圖片、按鈕或區塊，右側面板立即修改，預覽同步更新
- **網站內容（欄位）**：以表單方式逐區塊修改所有文字、選單名稱、區塊名稱、網頁標題與網站描述
- **最新消息**：新增、刪除、排序，上傳封面圖片，內文可加入標題、粗體、清單、圖片與連結
- 插入與管理圖片（自動壓縮；Logo、主視覺背景、服務卡片、消息封面、醫師照片、內文圖片）
- 開關首頁各區塊、切換背景色系（晨霧／晴空／暖陽）
- 首頁主視覺：4 張示意數據卡（眼軸長度、屈光度、紀錄趨勢、散光軸度；散光軸度示意圖會依 0–180° 的數值自動轉動）
- App 下載區：手機示意圖（App 圖示、名稱、副標可改），下方 Dock 是 Facebook、X、Instagram 圖示（`assets/img/social-*.png`），後台填入連結；未填時點擊會提示「即將開放」
- LINE：頁首深淺模式按鈕左邊的 LINE 圖示（淺色模式黑色 `line-black.png`、深色模式綠色 `line-green.png`）與「聯絡我們」的 LINE 按鈕，都連到 @892zqqxn；後台可改連結或關閉
- **瀏覽人次**：頁尾顯示累計瀏覽人次（同一瀏覽器 30 分鐘內只算 1 次，不記錄個人資料）；可開關、改文字、歸零或設定數字
- 發布前自動做「醫療法規用語檢查」
- 每次發布自動保存版本（最近 20 份），可載入舊版本還原
- 客戶提問收件匣：回覆、封存、刪除、匯出 CSV、刪除超過 2 年的資料

## 部署（摘要，完整步驟見部署指南文件）

1. GitHub 建立公開 repository → 上傳本資料夾「裡面」的所有檔案。
2. Settings → Pages → Deploy from a branch → `main` / `(root)`；Custom domain 填 `myopiacare.site`。
3. Firebase 建立專案與網頁應用程式 → 設定值貼到 `assets/js/config.js`。
4. Firestore（位置 `asia-east1`）→ 規則分頁貼上 `firestore.rules` → 發布。
5. Authentication 啟用「電子郵件/密碼」→ 新增管理員 → 把 UID 加到 Firestore 的 `admins` 集合。
6. 網域 DNS：4 筆 A、4 筆 AAAA 指向 GitHub Pages，`www` CNAME 指向 `你的帳號.github.io`；生效後勾選 Enforce HTTPS。
7. Authentication → 設定 → 已授權網域加入 `myopiacare.site`。

## 從舊版升級

1. 上傳前先從資料夾刪掉 `assets/js/config.js`，再用新檔案覆蓋 repository 裡的舊檔案（GitHub 上已填好的 config.js 會保留）。
2. 從 v2 升級：**把新的 `firestore.rules` 重新貼上並發布**（v3 起新增瀏覽人次 `stats` 的權限）。v3 之後（v4–v9）規則沒有變動，不必重貼。
3. 若後台曾經發布過內容，裡面仍是舊的佔位文字（○○○ 醫師、04-0000-0000、service@myopiacare.site、請於管理後台填寫公司地址）或 v3 的英文地址、v8 以前的「MyopiaCare／MYOPIACARE APP」標題時，網站會自動改為新的公司資料與「Myopia Care」寫法；其他你改過的內容維持不變。

## 修改程式後

改過 CSS 或 JS，請把所有 HTML 裡的 `?v=9` 改成 `?v=10`，訪客才不會看到舊的快取版本。
