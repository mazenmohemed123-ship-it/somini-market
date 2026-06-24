/**
 * seed-demo.js — إنشاء بيانات تجريبية كاملة لاختبار المنصة:
 *   • حسابات: مشتري + بائع فرد + مدير شركة (companyAdmin)
 *   • منتجات حقيقية معروضة في الصفحة الرئيسية
 *   • شركة (tenant) تجريبية
 *
 * يُشغَّل محلياً بمفتاح حساب خدمة لمشروع somini-market:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   GCLOUD_PROJECT=somini-market \
 *   node scripts/seed-demo.js
 *
 * أو على الـ Emulators:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   GCLOUD_PROJECT=somini-market node scripts/seed-demo.js
 *
 * السكربت idempotent — تشغيله أكثر من مرة آمن (يحدّث بدل أن يكرّر).
 */
const admin = require('firebase-admin');

admin.initializeApp();
const auth = admin.auth();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const PASSWORD = 'Somini#2024';

// ---------- حسابات تجريبية ----------
const ACCOUNTS = [
  { email: 'buyer@somini.test',   fullName: 'مشتري تجريبي',  role: 'buyer',        tenantId: 'public' },
  { email: 'seller@somini.test',  fullName: 'بائع تجريبي',    role: 'seller',       tenantId: 'public' },
  { email: 'company@somini.test', fullName: 'مدير شركة سومني', role: 'companyAdmin', tenantId: 'tenant-demo' }
];

// ---------- منتجات تجريبية (يملكها البائع الفرد) ----------
const PRODUCTS = [
  { title: 'لابتوب Dell XPS 13', category: 'إلكترونيات', price: 32000, condition: 'new',  quantity: 5,  description: 'لابتوب نحيف بشاشة 13 بوصة ومعالج Intel i7 وذاكرة 16GB.' },
  { title: 'هاتف Samsung Galaxy S23', category: 'إلكترونيات', price: 21500, condition: 'new',  quantity: 12, description: 'هاتف بكاميرا 50MP وبطارية 5000mAh وشاشة AMOLED.' },
  { title: 'كرسي مكتب مريح', category: 'أثاث', price: 2800, condition: 'new',  quantity: 30, description: 'كرسي مكتب بمسند ظهر شبكي ودعم قطني قابل للتعديل.' },
  { title: 'دراجة هوائية جبلية', category: 'رياضة', price: 6500, condition: 'used', quantity: 3,  description: 'دراجة جبلية 27.5 بوصة، 21 سرعة، حالة ممتازة.' },
  { title: 'ساعة ذكية Apple Watch SE', category: 'إلكترونيات', price: 9900, condition: 'new',  quantity: 8,  description: 'ساعة ذكية بمتابعة اللياقة والإشعارات ومقاومة للماء.' },
  { title: 'مكنسة كهربائية روبوت', category: 'أجهزة منزلية', price: 4200, condition: 'new',  quantity: 15, description: 'مكنسة روبوت بخرائط ذكية وتحكم عبر التطبيق.' }
];

async function ensureUser(acc) {
  let user;
  try {
    user = await auth.getUserByEmail(acc.email);
    await auth.updateUser(user.uid, { password: PASSWORD, displayName: acc.fullName });
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      user = await auth.createUser({ email: acc.email, password: PASSWORD, displayName: acc.fullName });
    } else {
      throw e;
    }
  }
  // الـ Custom Claims (الدور + الشركة) — لازمة لقواعد الأمان
  await auth.setCustomUserClaims(user.uid, { role: acc.role, tenantId: acc.tenantId });
  // ملف المستخدم في Firestore
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: acc.email,
    fullName: acc.fullName,
    role: acc.role,
    tenantId: acc.tenantId,
    completedDealsCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return user;
}

(async () => {
  console.log('▶ إنشاء البيانات التجريبية على', process.env.GCLOUD_PROJECT || '(المشروع الافتراضي)');

  // 1) شركة تجريبية (tenant)
  await db.collection('tenants').doc('tenant-demo').set({
    tenantId: 'tenant-demo',
    name: 'شركة سومني التجريبية',
    plan: 'pro',
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✅ شركة تجريبية: tenant-demo');

  // 2) الحسابات
  const users = {};
  for (const acc of ACCOUNTS) {
    const u = await ensureUser(acc);
    users[acc.role] = u;
    console.log(`✅ ${acc.role.padEnd(13)} ${acc.email}  (uid: ${u.uid})`);
  }

  // 3) المنتجات (يملكها البائع الفرد)
  const seller = users.seller;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const id = `demo-product-${i + 1}`; // ثابت → idempotent
    await db.collection('products').doc(id).set({
      productId: id,
      tenantId: 'public',
      sellerId: seller.uid,
      title: p.title,
      description: p.description,
      category: p.category,
      price: p.price,
      currency: 'EGP',
      condition: p.condition,
      quantity: p.quantity,
      images: [],
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`   📦 ${p.title} — ${p.price} ج.م`);
  }

  console.log('\n──────────────────────────────────────────');
  console.log('🎉 تم إنشاء كل البيانات التجريبية بنجاح.');
  console.log('بيانات الدخول (كلمة المرور للجميع): ' + PASSWORD);
  ACCOUNTS.forEach(a => console.log(`   • ${a.role.padEnd(13)} → ${a.email}`));
  console.log('ملاحظة: الأدمن الأساسي = mazenmohemed123@gmail.com (عبر set-admin.js)');
  console.log('──────────────────────────────────────────');
  process.exit(0);
})().catch((err) => {
  console.error('❌ فشل:', err.message);
  process.exit(1);
});
