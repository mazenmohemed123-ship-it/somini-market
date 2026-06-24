# 🚀 دليل النشر والتشغيل — Somini Market

> **مهم:** بيئة Claude اللي بتطوّر فيها محجوب عنها الوصول لخدمات Google/Firebase
> (سياسة شبكة)، فالـ **Cloud Functions + قواعد الأمان + بيانات الـ seed** لازم
> تتنشر من **جهازك أنت** بالأوامر اللي تحت. أما **الموقع نفسه (الواجهة)** فبيتنشر
> تلقائياً على Firebase Hosting عن طريق GitHub Actions مع كل `git push`.

---

## 0) متطلبات لمرة واحدة

```bash
npm install -g firebase-tools      # لو مش متثبّت
firebase login                     # سجّل دخول بحساب جوجل اللي عليه المشروع
cd /path/to/somini-market
```

---

## 1) نشر الواجهة (Hosting)

يتم **تلقائياً** عند الـ push للفرع `claude/lucid-bardeen-qf16bg` أو `main`
(راجع `.github/workflows/firebase-deploy.yml`). لو عايز تنشر يدوياً:

```bash
cd web && npm ci && npm run build && cd ..
firebase deploy --only hosting --project somini-market
```

الرابط المباشر: **https://somini-market.web.app**

---

## 2) نشر الدوال وقواعد الأمان (Functions + Rules)

```bash
cd functions && npm ci && cd ..

firebase deploy --only functions,firestore:rules,storage --project somini-market
```

> ملاحظة: دالة `onUserCreate` من نوع **Blocking (beforeUserCreated)** وتحتاج
> تفعيل **Identity Platform** من Firebase Console → Authentication → Settings.
> لو مش مفعّل، فعّله أو احذف تسجيلها من `functions/index.js` مؤقتاً.

---

## 3) تعيين حساب الأدمن (مرة واحدة)

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
GCLOUD_PROJECT=somini-market \
node functions/scripts/set-admin.js mazenmohemed123@gmail.com
```

> `serviceAccount.json` = مفتاح حساب خدمة من:
> Firebase Console → ⚙️ Project Settings → Service accounts → Generate new private key.

---

## 4) إنشاء البيانات التجريبية (الحسابات + المنتجات)

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
GCLOUD_PROJECT=somini-market \
node functions/scripts/seed-demo.js
```

ده هينشئ:

| الدور          | البريد                | كلمة المرور   |
|----------------|-----------------------|---------------|
| مشتري          | `buyer@somini.test`   | `Somini#2024` |
| بائع فرد       | `seller@somini.test`  | `Somini#2024` |
| مدير شركة      | `company@somini.test` | `Somini#2024` |
| الأدمن الأساسي | `mazenmohemed123@gmail.com` | (حسابك) |

بالإضافة لـ **6 منتجات حقيقية** تظهر في الصفحة الرئيسية فوراً.

> بعد الـ seed، اعمل تسجيل خروج/دخول للحسابات عشان تتفعّل صلاحيات الـ Custom Claims.

---

## ✅ بعد الخطوات دي

1. افتح https://somini-market.web.app
2. هتلاقي **خلفية الغابة** (الثيم الافتراضي بقى forest).
3. هتلاقي **المنتجات** في الصفحة الرئيسية.
4. سجّل دخول بأي حساب تجريبي وجرّب: الصفقات، التقسيط، KYC، لوحة البائع.
