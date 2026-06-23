// =============================================================
// الإشعارات (Firebase Cloud Messaging).
// حفظ رموز الأجهزة + إرسال إشعارات موجّهة + تنظيف الرموز غير الصالحة.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { admin, db, FieldValue } = require('../lib/admin');

/**
 * يرسل إشعاراً لكل أجهزة مستخدم، وينظّف الرموز المنتهية.
 * آمن للاستدعاء من أي trigger — لا يرمي عند غياب الرموز.
 */
async function sendToUser(uid, notification, data = {}) {
  if (!uid) return;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return;
  const tokens = snap.data().fcmTokens || [];
  if (!tokens.length) return;

  // القيم في data يجب أن تكون نصوصاً
  const stringData = {};
  for (const [k, v] of Object.entries(data)) stringData[k] = String(v);

  let res;
  try {
    res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data: stringData,
      webpush: { fcmOptions: { link: stringData.url || '/' } }
    });
  } catch (err) {
    console.error('sendToUser failed:', err.message);
    return;
  }

  // أزل الرموز غير المسجّلة
  const invalid = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        invalid.push(tokens[i]);
      }
    }
  });
  if (invalid.length) {
    await db
      .collection('users')
      .doc(uid)
      .update({ fcmTokens: FieldValue.arrayRemove(...invalid) })
      .catch(() => {});
  }
}

/**
 * saveFcmToken — يخزّن رمز جهاز المستخدم (FCM) في ملفه.
 */
const saveFcmToken = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');
  const token = (request.data?.token || '').toString().trim();
  if (!token) throw new HttpsError('invalid-argument', 'token مفقود.');

  await db.collection('users').doc(uid).set(
    { fcmTokens: FieldValue.arrayUnion(token), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});

/**
 * removeFcmToken — يزيل رمز الجهاز (عند تسجيل الخروج).
 */
const removeFcmToken = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');
  const token = (request.data?.token || '').toString().trim();
  if (!token) return { ok: true };
  await db
    .collection('users')
    .doc(uid)
    .update({ fcmTokens: FieldValue.arrayRemove(token) })
    .catch(() => {});
  return { ok: true };
});

module.exports = { sendToUser, saveFcmToken, removeFcmToken };
