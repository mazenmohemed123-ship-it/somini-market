/**
 * منح صلاحية superAdmin لحساب عبر بريده (الطريقة الآمنة لتهيئة الأدمن).
 *
 * الاستخدام (محلياً، بمفتاح حساب خدمة):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   GCLOUD_PROJECT=somni-market \
 *   node scripts/set-admin.js mazenmohemed123@gmail.com
 *
 * أو على الـ Auth Emulator:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo \
 *   node scripts/set-admin.js you@example.com
 *
 * بعد التشغيل يجب أن يسجّل الحساب الخروج والدخول مجدداً لتفعيل الصلاحية.
 */
const admin = require('firebase-admin');

const email = process.argv[2] || 'mazenmohemed123@gmail.com';

admin.initializeApp();

(async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, {
    role: 'superAdmin',
    tenantId: '*'
  });
  await admin.firestore().collection('users').doc(user.uid).set(
    {
      uid: user.uid,
      email,
      role: 'superAdmin',
      tenantId: '*',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  console.log(`✅ ${email} أصبح superAdmin (uid: ${user.uid}).`);
  console.log('اطلب منه إعادة تسجيل الدخول لتفعيل الصلاحية.');
  process.exit(0);
})().catch((err) => {
  console.error('❌ فشل:', err.message);
  process.exit(1);
});
