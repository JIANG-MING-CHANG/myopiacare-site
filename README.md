# MyopiaCare｜豪智慧有限公司 官方網站 v17

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
| `firestore.rules` | 資料庫安全規則 v4（貼到 Firebase 主控台並發布） |
| `assets/js/config.js` | **Firebase 連線設定（部署時必填）** |
| `assets/js/content.js` | 網站預設文字（平常請改用後台） |
| `assets/js/core.js` | 共用核心：內容載入、白名單過濾、路由、互動效果、瀏覽人次、視覺化編輯模式 |
| `assets/js/main.js` / `page.js` | 首頁／內頁程式 |
| `assets/js/admin.js` / `admin-editor.js` | 後台、視覺化編輯、圖片庫、格式文字編輯器 |
| `assets/js/protect.js` | 防止複製（v17 起）：公開網頁擋右鍵、選取、複製、拖曳圖片、快捷鍵與列印 |
| `assets/vendor/firebase-12.19.0/` | Firebase 官方 SDK（自家主機，不依賴第三方 CDN） |
| `assets/css/style.css` | 樣式；最上方 `:root` 是色彩變數 |

## 公司資料（預設內容）

- 創辦人：王志盟 Jyh-Meng Wang 醫師（眼專醫字第000810號）
- 電話：+886-926-016-016
- Email：excellence_intelligence@myopiacare.site
- 地址：苗栗縣苗栗市國際二巷4之1號
- 統編：61954117（頁尾地址下方）
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
- **眼球寶寶（浮動提問）**：右下角的吉祥物跟著訪客捲動，後台可選男生（`assets/img/mascot.webp`）、女生（`assets/img/mascot-girl.webp`）或每次進站隨機、桌機會轉向游標；點一下周圍出現特效並直接前往「線上提問」表單（內頁會回到首頁表單）。進到聯絡我們區塊或打開手機選單時自動收起。後台「眼球寶寶」可開關、改對話泡泡文字、換圖片
- LINE 加好友：聯絡我們區塊顯示 LINE 行動條碼（`assets/img/line-qr.png`，掃描後為 https://lin.ee/yIJmlII）與品牌綠漸層動態按鈕；電話、Email、地址、服務時間改只顯示在頁尾。後台「聯絡我們」可改行動條碼圖片、標題、說明與按鈕文字
- LINE：頁首深淺模式按鈕左邊的 LINE 圖示（淺色模式黑色 `line-black.png`、深色模式綠色 `line-green.png`）與「聯絡我們」的 LINE 按鈕，都連到 @892zqqxn；後台可改連結或關閉
- **瀏覽人次**：頁尾顯示累計瀏覽人次（同一瀏覽器 30 分鐘內只算 1 次，不記錄個人資料）；可開關、改文字、歸零或設定數字
- 發布前自動做「醫療法規用語檢查」
- 每次發布自動保存版本（最近 20 份），可載入舊版本還原
- 客戶提問收件匣：回覆、封存、刪除、匯出 CSV、刪除超過 2 年的資料；每則提問記錄送出時的 IP 位址與瀏覽器／裝置（可依 IP 搜尋、一鍵查詢來源，CSV 也包含），寫入後無法被修改
- 關於我們：醫師形象照（`assets/img/doctor-portrait-600.webp`、`-960.webp`），3D 傾斜、光澤、流動光暈；後台「關於我們」可開關、換照片（v15 起照片下方不再顯示標籤）
- 上方選單：服務項目、使用流程、最新消息、關於我們、隱私政策、聯絡我們（v16 起「隱私政策」從頁尾移到選單，文字可在後台「選單與頁面名稱」→「「隱私政策」選單名稱」修改；隱私權政策頁面本身的標題不變）
- 頁尾：公司名稱與聯絡資料、聲明、瀏覽人次（v16 起不再有頁尾連結列）
- 防止複製（v17 起，預設開啟）：首頁、最新消息、隱私權政策、404 頁不能按右鍵、選取或複製文字、拖曳圖片、使用複製／全選／存檔／列印／檢視原始碼／開發者工具快捷鍵，列印只會印出版權提示。提問表單的欄位照常可以輸入、選取、複製、貼上；LINE 行動條碼仍可長按或右鍵儲存；後台與視覺化編輯不受影響。後台「網站設定」→「防止複製網頁內容」可關閉，「訪客嘗試複製時的提示文字」可修改或留空。限制：截圖、拍照、關閉 JavaScript 或從瀏覽器選單打開開發者工具仍無法阻擋，這是所有網站共同的限制

## 發布失敗怎麼辦（v10 起會自動找原因）

按「檢查並發布」沒有成功時，後台會自動跳出「發布沒有成功：原因與解決步驟」視窗，逐項檢查 8 個設定並用白話說明要修正哪一步。也可以隨時按工具列的「連線診斷」自行檢查（只讀取資料，不會改動網站內容）。

| 視窗顯示的原因 | 怎麼修 |
| --- | --- |
| 還不能發布：有 N 個地方需要修正 | 按每一行的「前往修改」，改好再發布（例如消息沒有標題、軸度不是 0–180） |
| 資料庫規則不是最新版／「網站內容」的部分不是最新版 | 到 GitHub 打開 `firestore.rules` → Copy raw file → Firebase → Firestore → 規則 → 全選貼上 → 發布（專案 ID 要與視窗顯示的一樣） |
| 這個帳號不在管理員名單內 | Firestore → admins → 新增文件，文件 ID 貼上視窗顯示的 UID |
| 連不上資料庫 | 確認網路；對 myopiacare.site 關閉廣告阻擋／內容阻擋器；換網路或瀏覽器 |
| 規則仍是「測試模式」 | 重新貼上 `firestore.rules` 並發布（測試模式約 30 天後會鎖死，且任何人都能讀取客戶資料） |

Facebook、X、Instagram、App 商店與 LINE 連結少打 `https://`、打成 `http://`，或 LINE 只填 `@ID` 時，發布時會自動補成完整網址。仍無法解決時，按視窗的「複製診斷結果」，把文字貼給技術人員。

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
2. 從 v2 升級：**把新的 `firestore.rules` 重新貼上並發布**（v3 起新增瀏覽人次 `stats` 的權限）。v3–v13 規則相同；**v14 起規則升級為 v4（提問可記錄 IP），請重新貼上 `firestore.rules` 並發布**。v15、v16、v17 規則與 v14 相同，不需重貼。
3. 若後台曾經發布過內容，裡面仍是舊的佔位文字（○○○ 醫師、04-0000-0000、service@myopiacare.site、請於管理後台填寫公司地址）或 v3 的英文地址、v8 以前的「MyopiaCare／MYOPIACARE APP」標題時，網站會自動改為新的公司資料與「Myopia Care」寫法；其他你改過的內容維持不變。

## 修改程式後

改過 CSS 或 JS，請把所有 HTML 裡的 `?v=17` 改成 `?v=18`，訪客才不會看到舊的快取版本。
