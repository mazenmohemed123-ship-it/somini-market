// =============================================================
// دورة حياة الطلب: تحديث الحالة (شحن/تسليم) بضوابط الدور والانتقال.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');

// الانتقالات المسموح بها لكل دور.
const TRANSITIONS = {
  seller: { paid: ['shipped'], shipped: ['delivered'] },
  buyer: { shipped: ['delivered'] } // المشتري يؤكّد الاستلام
};

// دالة نقيّة قابلة للاختبار: هل الانتقال مسموح لهذا الدور؟
function isTransitionAllowed(role, from, to) {
  return (TRANSITIONS[role]?.[from] || []).includes(to);
}

/**
 * updateOrderStatus — يحدّث حالة الطلب وفق انتقالات صارمة.
 * البائع: paid→shipped→delivered. المشتري: shipped→delivered (تأكيد).
 */
const updateOrderStatus = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const { orderId, status } = request.data || {};
  if (!orderId || !status) {
    throw new HttpsError('invalid-argument', 'orderId و status مطلوبان.');
  }

  const orderRef = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
    const o = snap.data();

    const isSeller = uid === o.sellerId;
    const isBuyer = uid === o.buyerId;
    if (!isSeller && !isBuyer) {
      throw new HttpsError('permission-denied', 'لست طرفاً في هذا الطلب.');
    }

    const actorRole = isSeller ? 'seller' : 'buyer';
    if (!isTransitionAllowed(actorRole, o.status, status)) {
      throw new HttpsError(
        'failed-precondition',
        `انتقال غير مسموح: ${o.status} → ${status} (${actorRole}).`
      );
    }

    tx.update(orderRef, {
      status,
      [`${status}At`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return { ok: true, status };
  });
});

module.exports = { updateOrderStatus, isTransitionAllowed };
