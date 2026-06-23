// =============================================================
// تقييمات المنتجات: إضافة تقييم (1-5) بعد شراء موثّق + تحديث متوسط
// تقييم المنتج ذرّياً.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');

/**
 * addReview — يضيف تقييماً لمنتج اشتراه المستخدم فعلاً.
 * يمنع التكرار (تقييم واحد لكل مستخدم/منتج) ويحدّث متوسط المنتج.
 */
const addReview = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const { productId, rating, comment } = request.data || {};
  const r = parseInt(rating, 10);
  if (!productId || !(r >= 1 && r <= 5)) {
    throw new HttpsError('invalid-argument', 'التقييم يجب أن يكون من 1 إلى 5.');
  }

  // تحقّق أن المستخدم اشترى هذا المنتج (طلب مدفوع/مغلق)
  const purchased = await db
    .collection('orders')
    .where('buyerId', '==', uid)
    .where('productId', '==', productId)
    .where('status', 'in', ['paid', 'shipped', 'delivered', 'closed'])
    .limit(1)
    .get();
  if (purchased.empty) {
    throw new HttpsError('failed-precondition', 'يمكن التقييم بعد شراء المنتج فقط.');
  }

  const reviewId = `${productId}_${uid}`; // تقييم واحد لكل مستخدم/منتج
  const reviewRef = db.collection('reviews').doc(reviewId);
  const productRef = db.collection('products').doc(productId);

  return db.runTransaction(async (tx) => {
    const [existing, prodSnap] = await Promise.all([tx.get(reviewRef), tx.get(productRef)]);
    if (!prodSnap.exists) throw new HttpsError('not-found', 'المنتج غير موجود.');

    const p = prodSnap.data();
    const prevCount = p.ratingCount || 0;
    const prevSum = p.ratingSum || 0;

    let newCount = prevCount;
    let newSum = prevSum;
    if (existing.exists) {
      // تحديث تقييم سابق
      newSum = prevSum - (existing.data().rating || 0) + r;
    } else {
      newCount = prevCount + 1;
      newSum = prevSum + r;
    }

    tx.set(reviewRef, {
      reviewId,
      productId,
      userId: uid,
      rating: r,
      comment: (comment || '').toString().slice(0, 1000),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    tx.update(productRef, {
      ratingCount: newCount,
      ratingSum: newSum,
      ratingAvg: Math.round((newSum / Math.max(newCount, 1)) * 10) / 10
    });

    return { ok: true, ratingAvg: Math.round((newSum / Math.max(newCount, 1)) * 10) / 10 };
  });
});

module.exports = { addReview };
