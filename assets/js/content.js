/*
 * 網站預設內容（Default content）
 * ------------------------------------------------------------
 * 平常請到「管理後台 myopiacare.site/admin/ → 網站內容」修改，存檔後立即生效。
 * 這裡是預設值：資料庫還沒有內容、或讀取失敗時，網站會顯示這些文字。
 *
 * 文案已依《醫療法》第 84、87 條與《醫療器材管理法》第 46 條撰寫：
 * 定位為「資料紀錄與整理工具」，不宣稱診斷、治療、預防或療效。
 * 欄位說明：一般欄位是純文字；名稱以 body 結尾的欄位可放格式與圖片（後台的編輯器）。
 */
window.MC_DEFAULT_CONTENT = {
  site: {
    title: '豪智慧有限公司｜MyopiaCare 眼科數據紀錄',
    description: '豪智慧有限公司由醫師創立，提供 MyopiaCare 眼科數據雲端紀錄、AI 數據趨勢圖表與回診提醒，協助醫師與家長清楚溝通。',
    palette: 'mist'
  },
  brand: {
    nameZh: '豪智慧有限公司',
    nameEn: 'Myopia Care',
    tagline: '眼科數據紀錄 · AI 智慧照護管理',
    logo: ''
  },
  nav: {
    services: '服務項目',
    flow: '使用流程',
    news: '最新消息',
    about: '關於我們',
    contact: '聯絡我們',
    cta: '線上提問'
  },
  sections: {
    services: true,
    flow: true,
    news: true,
    about: true,
    contact: true,
    app: true
  },
  hero: {
    eyebrow: 'OPHTHALMIC DATA × AI CARE',
    title: 'Myopia Care',
    subtitle: '眼科數據紀錄 · AI 智慧照護管理',
    lead: '由醫師創立的眼科數據服務。我們把每一次檢查紀錄整理成看得見的成長曲線，讓醫師與家長溝通更清楚。',
    ctaPrimary: '探索服務',
    ctaSecondary: '線上提問',
    image: '',
    showCards: true,
    card1Label: '眼軸長度',
    card1Value: '23.86',
    card1Unit: 'mm',
    card1Meta: '與前次紀錄 +0.12',
    card2Label: '屈光度',
    card2Value: '−2.25',
    card2Unit: 'D',
    card2Meta: '右眼 · 檢查紀錄',
    card3Label: '紀錄趨勢',
    card3Meta: '歷次紀錄 · 圖表呈現',
    card4Label: '散光軸度',
    card4Value: '180',
    card4Unit: '°',
    card4Meta: '右眼 · 散光 −0.75 D'
  },
  services: {
    kicker: 'SERVICES',
    title: '服務項目',
    intro: '從檢查紀錄的保存、整理到回診提醒，一站整合眼科數據管理所需的數位工具。',
    items: [
      { icon: 'cloud', image: '', title: '眼科數據雲端紀錄', desc: '視力、屈光度、眼軸長度等檢查紀錄集中保存，每次回診都能完整回顧。' },
      { icon: 'ai', image: '', title: 'AI 數據趨勢整理', desc: '以 AI 協助整理歷次檢查紀錄，繪製成易讀的趨勢圖表，供醫師說明時參考。' },
      { icon: 'axis', image: '', title: '眼軸數據圖表', desc: '依年齡與時間記錄眼軸長度，變化一目了然，醫病溝通更有依據。' },
      { icon: 'bell', image: '', title: '回診與生活提醒', desc: '依醫囑設定回診、點藥與戶外活動提醒，日常照護不遺漏。' },
      { icon: 'report', image: '', title: '醫病溝通報告', desc: '將檢查紀錄整理成圖表報告，協助醫師向家長說明。' },
      { icon: 'clinic', image: '', title: '院所數據整合', desc: '協助眼科院所整合檢查紀錄流程，資料格式一致、權限分級管理。' }
    ]
  },
  flow: {
    kicker: 'HOW IT WORKS',
    title: '使用流程',
    intro: '四個步驟，把每一次的檢查紀錄串成清楚的資料。',
    steps: [
      { title: '院所上傳數據', desc: '合作眼科院所於檢查後，將紀錄上傳至 MyopiaCare。' },
      { title: '雲端安全保存', desc: '依權限分級管理，保護個人資料。' },
      { title: 'AI 整理圖表', desc: '將歷次數據整理成趨勢圖表，標示與前次紀錄的差異。' },
      { title: '醫師說明，家長查看', desc: '由您的眼科醫師解讀與說明；家長可在 App 查看紀錄與提醒。' }
    ]
  },
  news: {
    kicker: 'NEWS',
    title: '最新消息',
    intro: '公司動態與護眼衛教資訊。',
    moreLabel: '查看全部消息',
    items: [
      {
        id: 'site-launch', date: '2026-10-25', title: '豪智慧官方網站正式上線', cover: '',
        summary: '歡迎透過網站了解 MyopiaCare 眼科數據紀錄服務，也可以在「聯絡我們」線上提問。',
        body: '<p>豪智慧有限公司官方網站正式上線。網站提供 MyopiaCare 服務介紹、最新消息與線上提問表單。</p><p>如對服務內容、院所合作或 App 使用有任何疑問，歡迎透過<a href="/#contact">線上提問</a>與我們聯繫，我們將以 Email 回覆。</p>'
      },
      {
        id: 'clinic-partner', date: '2026-10-01', title: 'MyopiaCare 開放眼科院所合作洽詢', cover: '',
        summary: '歡迎眼科院所留下聯絡方式，我們將安排專人說明系統導入流程。',
        body: '<p>MyopiaCare 協助眼科院所整理檢查紀錄，並以圖表呈現歷次數據的變化，方便醫師向家長說明。</p><p>歡迎院所透過<a href="/#contact">線上提問</a>留下聯絡方式，身分請選擇「眼科院所」，我們將安排專人說明導入流程。</p>'
      },
      {
        id: 'eye-care-3010120', date: '2026-09-15', title: '護眼小知識：國健署建議「3010120」', cover: '',
        summary: '用眼 30 分鐘休息 10 分鐘、每天戶外活動 120 分鐘以上，並定期由眼科醫師檢查。',
        body: '<p>衛生福利部國民健康署推動「3010120」護眼原則，建議家長協助孩子：</p><ul><li>近距離用眼 30 分鐘，休息 10 分鐘。</li><li>每天戶外活動 120 分鐘以上。</li><li>從 3、4 歲起，每年定期 1 至 2 次由眼科醫師進行視力檢查。</li></ul><p>本文為衛教資訊，個人狀況請諮詢您的眼科醫師。</p><p class="tc-muted">資料來源：<a href="https://www.mohw.gov.tw/fp-16-70420-1.html">衛生福利部國民健康署</a></p>'
      }
    ]
  },
  about: {
    kicker: 'ABOUT US',
    title: '關於我們',
    body: '<p>豪智慧有限公司由醫師創立，專注於眼科數據紀錄與 AI 照護資訊管理。我們相信，清楚的紀錄是良好溝通的起點：把分散在每一次檢查裡的數字，整理成看得懂、用得上的資訊。</p><p>MyopiaCare 是資料紀錄與整理工具，不提供醫療診斷；所有醫療判斷與建議，均由您的醫師親自說明。</p>',
    doctorName: '王志盟 Jyh-Meng Wang 醫師',
    doctorLicense: '眼專醫字第000810號',
    doctorTitle: '創辦人',
    doctorQuote: '孩子的視力變化需要長期記錄與耐心溝通。我們希望讓醫師與家長看著同一張圖，說同一種語言。',
    doctorPhoto: '',
    showPortrait: true,
    portrait: ''
  },
  contact: {
    kicker: 'CONTACT',
    title: '聯絡我們',
    intro: '對服務內容、院所合作或 App 使用有任何問題，歡迎留言，我們會以 Email 回覆。本表單不提供醫療諮詢。',
    formTitle: '線上提問',
    submitLabel: '送出提問',
    formNote: '本表單不提供醫療諮詢或診斷。請勿填寫病歷、檢查報告或身分證字號等敏感資料；如有急症請立即就醫。',
    phone: '+886-926-016-016',
    email: 'excellence_intelligence@myopiacare.site',
    address: '苗栗縣苗栗市國際二巷4之1號',
    taxId: '61954117',
    hours: '週一至週五 09:00–18:00',
    showLine: true,
    lineUrl: 'https://line.me/R/ti/p/%40892zqqxn',
    lineQr: '',
    lineQrTitle: '掃描行動條碼加入好友',
    lineQrText: '請使用智慧手機版 LINE 掃描行動條碼來加入好友。',
    lineLabel: '加入 LINE 官方帳號'
  },
  app: {
    kicker: 'Myopia Care App',
    title: '下載 MyopiaCare App',
    desc: '隨時查看檢查紀錄、成長曲線與回診提醒，iOS 與 Android 皆可使用。',
    image: '',
    screenTitle: 'MyopiaCare',
    screenText: '眼科數據紀錄 · AI 智慧照護',
    appStoreUrl: '',
    googlePlayUrl: '',
    facebookUrl: '',
    xUrl: '',
    instagramUrl: ''
  },
  privacy: {
    kicker: 'PRIVACY POLICY',
    title: '隱私權政策',
    body: '<p class="tc-muted">最後更新：2026 年 10 月 30 日</p><p>豪智慧有限公司（以下稱「本公司」）重視您的隱私。依據《個人資料保護法》第 8 條，當您透過本網站「線上提問」表單提供個人資料時，本公司告知您下列事項。</p><h3>一、蒐集目的</h3><p>（〇九〇）消費者、客戶管理與服務：用於回覆您的提問、提供服務說明與聯繫。（一三六）資（通）訊與資料庫管理：記錄送出提問時的連線資訊，用於防止垃圾訊息與不當使用、維護網站資訊安全，並於司法或主管機關依法要求時提供。本公司不會將您的資料用於行銷，也不會出售或出租給任何人。</p><h3>二、蒐集的個人資料類別</h3><ul><li>識別類：姓名、電子郵件、電話（選填）。</li><li>其他：您填寫的身分類別、主旨與提問內容，以及送出時間。</li><li>連線紀錄：送出提問時的 IP 位址，以及瀏覽器與裝置類型。</li></ul><p>請勿在表單中填寫病歷、檢查報告、身分證字號等敏感資料。本網站表單並非醫療諮詢管道，如有急症請立即就醫。</p><h3>三、利用期間、地區、對象及方式</h3><ul><li>期間：自蒐集之日起，至提問處理完畢後二年，或法令規定的保存期間屆滿為止，期滿後刪除。</li><li>地區：資料儲存於 Google Firebase（Google Cloud）雲端資料庫。</li><li>對象：僅限本公司經授權的管理人員；除法律另有規定或經您同意外，不會提供給第三人。</li><li>方式：以電子郵件或電話回覆您的提問。</li></ul><h3>四、您的權利</h3><p>依《個人資料保護法》第 3 條，您可以就您的個人資料向本公司請求：查詢或閱覽、製給複製本、補充或更正、停止蒐集處理或利用、刪除。請以本頁下方的聯絡方式與我們聯繫，本公司將於確認身分後儘速處理。</p><h3>五、不提供資料的影響</h3><p>您可以自由選擇是否提供個人資料；若未提供必填欄位，本公司將無法回覆您的提問。</p><h3>六、資料安全</h3><p>本網站全程以 HTTPS 加密傳輸；客戶提問存放於設有存取權限控管的資料庫，網站訪客無法讀取，只有經授權的管理員帳號可以查看。</p><h3>七、Cookie 與瀏覽器儲存</h3><p>本網站不使用追蹤型 Cookie，也不使用第三方廣告或行為分析工具。網站只會在您的瀏覽器本機儲存深／淺色模式偏好、網站內容暫存、表單送出時間（避免重複送出），以及最近一次瀏覽時間（用於瀏覽人次統計，避免重複計算）。頁尾的瀏覽人次只累計總次數，不記錄 IP 位址或任何可識別個人的資料。送出提問時，網站會透過 ipify 服務（api64.ipify.org）查詢您的對外 IP 位址，並與提問一併保存。網站字型由 Google Fonts 提供，載入字型時您的瀏覽器會連線至 Google 伺服器。</p><h3>八、政策修訂</h3><p>本公司得視需要修訂本政策，修訂後將公布於本頁面。</p>'
  },
  mascot: {
    show: true,
    style: 'boy',
    bubble: '有問題嗎？點我線上提問',
    image: ''
  },
  footer: {
    privacyLabel: '隱私政策',
    showCounter: true,
    counterLabel: '累計瀏覽人次',
    note: '豪智慧有限公司非醫療機構。本網站與 MyopiaCare 提供資料紀錄與整理工具，不提供醫療診斷、治療或醫療諮詢；網站資訊僅供參考，如有眼睛不適，請儘速就醫。'
  }
};
