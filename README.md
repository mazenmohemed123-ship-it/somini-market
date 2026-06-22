# 🛍️ Somni Market — سومني ماركت

منصّة تجارة إلكترونية **متعددة البائعين** (Multi-Vendor Marketplace) تدعم الأفراد
والشركات الضخمة، مع:

- 🛡️ **نظام ضمان (Escrow)** للصفقات الكبيرة — حجز الأموال حتى تأكيد الاستلام.
- 💬 **شات خاص 1:1** حيّ (Realtime Database) بين المشتري/البائع والدعم.
- 🤖 **بوت مساعد قواعدي بدون LLM** يفهم النية ويستعلم Firestore مباشرة.
- 🏢 **عزل tenants كامل** عبر Identity Platform + Firestore Rules.
- 💳 دفع عبر **Paymob** (iframe + webhook موقّع بـ HMAC).

> من شركة **somniX.tech**

---

## 🧱 البنية التقنية

| الطبقة | التقنية |
|--------|---------|
| الواجهة | Next.js 15 (App Router, SSR) على Firebase Hosting |
| الخلفية | Cloud Functions 2nd gen (Node 20) |
| البيانات | Firestore + Realtime Database (شات حيّ) |
| المصادقة | Firebase Auth + Identity Platform (Multi-tenancy) |
| الأمان | App Check (reCAPTCHA v3) + Security Rules + Secret Manager |
| الدفع | Paymob (Escrow + دفع مباشر) |
| PWA | manifest.json + service worker + TWA |

---

## 📂 هيكل المشروع

```
somini-market/
├── firebase.json            # إعدادات Hosting/Functions/Firestore/RTDB/Storage
├── firestore.rules          # قواعد أمان كاملة مع عزل tenant
├── firestore.indexes.json   # الفهارس المركّبة + TTL
├── database.rules.json      # قواعد الشات الحيّ (RTDB)
├── storage.rules            # قواعد رفع الصور/الملفات
├── functions/               # Cloud Functions
│   ├── index.js             # نقطة التصدير
│   ├── lib/                 # admin + config + secrets
│   └── src/
│       ├── tenants.js       # createTenant / setUserRole / onUserCreate
│       ├── products.js      # createProduct / processBulkUpload (CSV)
│       ├── payments.js      # createPaymentIntent / handlePaymobWebhook
│       ├── escrow.js        # release / dispute / resolve / autoRelease ⭐
│       ├── bot.js           # assistantBot (قواعدي بدون LLM) ⭐
│       ├── chat.js          # openChat / onChatMessage / markChatRead ⭐
│       ├── stats.js         # sellerDashboard
│       └── api.js           # REST API للتكاملات الخارجية
└── web/                     # Next.js 15
    ├── app/                 # الصفحات (الرئيسية، منتج، طلبات، لوحة بائع، تسجيل)
    ├── components/          # Chat / AssistantBot / EscrowPanel / Navbar
    ├── lib/                 # firebase / auth / i18n
    ├── locales/             # ar.json / en.json (+ سهولة إضافة لغات)
    └── public/              # manifest.json / sw.js
```

---

## 🚀 الإعداد والتشغيل

### 1) المتطلبات
- حساب Firebase بخطة **Blaze** (مطلوبة لـ Functions 2nd gen).
- تفعيل **Identity Platform** (Multi-tenancy) و**App Check**.
- تثبيت `firebase-tools`: `npm i -g firebase-tools`

### 2) الأسرار (Secret Manager)
```bash
firebase functions:secrets:set PAYMOB_API_KEY
firebase functions:secrets:set PAYMOB_INTEGRATION_ID
firebase functions:secrets:set PAYMOB_IFRAME_ID
firebase functions:secrets:set PAYMOB_HMAC_SECRET
```

### 3) الواجهة
```bash
cd web
cp .env.local.example .env.local   # املأ مفاتيح Firebase + reCAPTCHA
npm install
npm run dev
```

### 4) الدوال
```bash
cd functions
npm install
```

### 5) التشغيل المحلي (Emulators)
```bash
firebase emulators:start
```

### 6) النشر
```bash
firebase deploy --only firestore:rules,database,storage,functions
firebase deploy --only hosting
```

---

## ⭐ الميزات الفارقة بالتفصيل

### نظام الضمان (Escrow)
- عند دفع صفقة ≥ عتبة `escrowThreshold` (افتراضي 5000) يُنشأ مستند
  `escrowTransactions` بحالة `held` داخل `handlePaymobWebhook`.
- **التحرير اليدوي:** `releaseEscrow` (المشتري بعد الاستلام أو الأدمن).
- **النزاع:** `openDispute` يجمّد الأموال → `resolveDispute` يحسمه الأدمن.
- **التحرير التلقائي:** `autoReleaseEscrows` مجدولة يومياً (Cloud Scheduler)
  تحرّر ما تجاوز `autoReleaseDate` بلا نزاع.
- كل التعديلات داخل **Firestore Transactions** لضمان الاتساق، والعمولة
  تُقتطع تلقائياً (`commissionRate`، قابلة للتعديل عبر Remote Config).

### البوت المساعد (بدون LLM)
- `assistantBot` يطبّع النص العربي ويكتشف النية بمطابقة كلمات مفتاحية:
  - «ابحث عن X» → استعلام Firestore وترتيب النتائج.
  - «كم ربحت اليوم؟» → جمع مبيعات اليوم للبائع.
  - «طلباتي المعلقة» / «كيف أرجع منتج؟» / «كيف يعمل الضمان؟».
- مكتبة `natural` مضمّنة للتوسعة المستقبلية (stemming/تصنيف).

### الشات 1:1
- الرسائل الحيّة في **Realtime Database** تحت `chats/{chatId}/messages`
  (معرّف المحادثة = `uidA_uidB` مرتّب أبجدياً → ثابت لأي اتجاه).
- `onChatMessage` (RTDB trigger) يحدّث ميتاداتا Firestore (آخر رسالة +
  عدّاد غير المقروء)، و`markChatRead` يصفّره.
- مؤشر «يكتب الآن» + حضور عبر RTDB.

---

## 🔐 ملاحظات أمان
- المستندات المالية (`orders`, `escrowTransactions`) **للقراءة فقط** من العميل؛
  كل كتابة تمرّ عبر Cloud Functions (Admin SDK).
- العزل: كل مستند يحمل `tenantId`، وتُقرأ صلاحية `tenantId/role` من
  **Custom Claims** داخل القواعد.
- مفاتيح Paymob و API في **Secret Manager** فقط، ولا تُقرأ من العميل أبداً.
- مفاتيح REST API تُخزَّن **مجزّأة (SHA-256)** في `apiIntegrations`.

---

## 🗺️ خارطة طريق (لم تُنفَّذ بعد)
- استرجاع Paymob الفعلي (`refunds` تُسجَّل كـ pending حالياً).
- تكامل FCM + Cloud Tasks لإشعارات مضمونة.
- TTL تلقائي مفعّل على `orders.expiresAt` و`botSessions.expiresAt`.
- بحث منتجات متقدّم (Algolia/Typesense) بدل المطابقة البسيطة.
- استيراد Shopify/WooCommerce الفعلي عبر `apiIntegrations`.
