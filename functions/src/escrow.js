// =============================================================
// نظام الضمان (Escrow) — الميزة الفارقة
// إنشاء/تحرير/استرجاع أموال الضمان + فتح وحل النزاعات + التحرير
// التلقائي اليومي عبر Cloud Scheduler.
// كل التعديلات تتم داخل معاملات (transactions) لضمان الاتساق.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { REGION, DEFAULTS } = require('../lib/config');
const { db, FieldValue, Timestamp } = require('../lib/admin');
const { sendToUser } = require('./notifications');

/**
 * ينشئ مستند ضمان من طلب مدفوع (يُستدعى داخلياً من webhook الدفع).
 * يحجز المبلغ بحالة held ويحدد تاريخ التحرير التلقائي.
 * @returns {Promise<string>} escrowId
 */
async function createEscrowForOrder(order, commissionRate = DEFAULTS.commissionRate) {
  const escrowRef = db.collection('escrowTransactions').doc();
  const autoReleaseDate = Timestamp.fromMillis(
    Date.now() + DEFAULTS.autoReleaseDays * 24 * 60 * 60 * 1000
  );

  const commission = Math.round(order.totalAmount * commissionRate * 100) / 100;
  const sellerPayout = Math.round((order.totalAmount - commission) * 100) / 100;

  await escrowRef.set({
    escrowId: escrowRef.id,
    orderId: order.orderId,
    tenantId: order.tenantId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    amount: order.totalAmount,
    commission,
    sellerPayout,
    currency: order.currency || DEFAULTS.currency,
    status: 'held',
    releaseType: 'auto',
    autoReleaseDate,
    releasedBy: null,
    disputeReason: null,
    createdAt: FieldValue.serverTimestamp()
  });

  return escrowRef.id;
}

/**
 * releaseEscrow — تحرير الأموال للبائع.
 * يسمح به: المشتري (بعد تأكيد الاستلام) أو الأدمن. ليس البائع.
 */
const releaseEscrow = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const role = request.auth?.token?.role;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const escrowId = request.data?.escrowId;
  if (!escrowId) throw new HttpsError('invalid-argument', 'escrowId مفقود.');

  const escrowRef = db.collection('escrowTransactions').doc(escrowId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(escrowRef);
    if (!snap.exists) throw new HttpsError('not-found', 'مستند الضمان غير موجود.');
    const e = snap.data();

    const isAdmin = role === 'superAdmin';
    const isBuyer = uid === e.buyerId;
    if (!isAdmin && !isBuyer) {
      throw new HttpsError('permission-denied', 'فقط المشتري أو الأدمن يحرّر الأموال.');
    }
    if (e.status !== 'held') {
      throw new HttpsError('failed-precondition', `لا يمكن التحرير، الحالة: ${e.status}`);
    }

    tx.update(escrowRef, {
      status: 'released',
      releaseType: 'manual',
      releasedBy: uid,
      releasedAt: FieldValue.serverTimestamp()
    });
    tx.update(db.collection('orders').doc(e.orderId), {
      status: 'closed',
      updatedAt: FieldValue.serverTimestamp()
    });

    // تسجيل دفعة مستحقة للبائع (تُعالَج خارجياً/يدوياً للتحويل البنكي)
    tx.set(db.collection('payouts').doc(), {
      escrowId,
      sellerId: e.sellerId,
      tenantId: e.tenantId,
      amount: e.sellerPayout,
      currency: e.currency,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });

    return { ok: true, status: 'released', payout: e.sellerPayout, sellerId: e.sellerId, currency: e.currency };
  });

  await sendToUser(
    result.sellerId,
    { title: '💰 تم تحرير مبلغ الضمان', body: `${result.payout} ${result.currency} في طريقها إليك` },
    { type: 'escrow', escrowId, url: '/seller/dashboard' }
  );
  return { ok: true, status: result.status, payout: result.payout };
});

/**
 * openDispute — المشتري يفتح نزاعاً خلال مدة الحجز.
 * يجمّد الأموال ويحوّل الطلب إلى disputed.
 */
const openDispute = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const { escrowId, reason } = request.data || {};
  if (!escrowId || !reason || reason.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'سبب النزاع مطلوب.');
  }

  const escrowRef = db.collection('escrowTransactions').doc(escrowId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(escrowRef);
    if (!snap.exists) throw new HttpsError('not-found', 'مستند الضمان غير موجود.');
    const e = snap.data();

    if (uid !== e.buyerId) {
      throw new HttpsError('permission-denied', 'فقط المشتري يفتح نزاعاً.');
    }
    if (e.status !== 'held') {
      throw new HttpsError('failed-precondition', 'لا يمكن فتح نزاع على هذه الحالة.');
    }

    tx.update(escrowRef, {
      status: 'disputed',
      disputeReason: reason.trim(),
      disputedAt: FieldValue.serverTimestamp()
    });
    tx.update(db.collection('orders').doc(e.orderId), {
      status: 'disputed',
      updatedAt: FieldValue.serverTimestamp()
    });

    return { ok: true, status: 'disputed', sellerId: e.sellerId };
  });

  // أعلم البائع بفتح النزاع (الأدمن يراه في لوحة النزاعات)
  await sendToUser(
    result.sellerId,
    { title: '⚖️ تم فتح نزاع', body: 'فتح المشتري نزاعاً على إحدى صفقاتك. الأموال مجمّدة حتى الحل.' },
    { type: 'dispute', escrowId, url: '/orders' }
  );
  return { ok: true, status: result.status };
});

/**
 * resolveDispute — الأدمن يحل النزاع: تحرير للبائع أو استرجاع للمشتري.
 */
const resolveDispute = onCall({ region: REGION }, async (request) => {
  const role = request.auth?.token?.role;
  const uid = request.auth?.uid;
  if (role !== 'superAdmin' && role !== 'supportAgent') {
    throw new HttpsError('permission-denied', 'صلاحية الأدمن مطلوبة.');
  }

  const { escrowId, resolution } = request.data || {}; // 'release' | 'refund'
  if (!['release', 'refund'].includes(resolution)) {
    throw new HttpsError('invalid-argument', 'القرار يجب أن يكون release أو refund.');
  }

  const escrowRef = db.collection('escrowTransactions').doc(escrowId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(escrowRef);
    if (!snap.exists) throw new HttpsError('not-found', 'مستند الضمان غير موجود.');
    const e = snap.data();
    if (e.status !== 'disputed') {
      throw new HttpsError('failed-precondition', 'لا يوجد نزاع مفتوح.');
    }

    if (resolution === 'release') {
      tx.update(escrowRef, {
        status: 'released',
        releaseType: 'manual',
        releasedBy: uid,
        releasedAt: FieldValue.serverTimestamp()
      });
      tx.update(db.collection('orders').doc(e.orderId), {
        status: 'closed',
        updatedAt: FieldValue.serverTimestamp()
      });
      tx.set(db.collection('payouts').doc(), {
        escrowId,
        sellerId: e.sellerId,
        tenantId: e.tenantId,
        amount: e.sellerPayout,
        currency: e.currency,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp()
      });
    } else {
      tx.update(escrowRef, {
        status: 'refunded',
        releasedBy: uid,
        refundedAt: FieldValue.serverTimestamp()
      });
      tx.update(db.collection('orders').doc(e.orderId), {
        status: 'closed',
        refunded: true,
        updatedAt: FieldValue.serverTimestamp()
      });
      // استرجاع المبلغ للمشتري يُنفَّذ عبر Paymob refund API (مستحق)
      tx.set(db.collection('refunds').doc(), {
        escrowId,
        buyerId: e.buyerId,
        amount: e.amount,
        currency: e.currency,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp()
      });
    }

    return { ok: true, resolution };
  });
});

/**
 * autoReleaseEscrows — مجدولة يومياً: تحرّر أي ضمان تجاوز autoReleaseDate
 * وما زال held (بلا نزاع).
 */
const autoReleaseEscrows = onSchedule(
  { region: REGION, schedule: 'every day 02:00', timeZone: 'Africa/Cairo' },
  async () => {
    const now = Timestamp.now();
    const due = await db
      .collection('escrowTransactions')
      .where('status', '==', 'held')
      .where('autoReleaseDate', '<=', now)
      .limit(200)
      .get();

    if (due.empty) {
      console.log('autoReleaseEscrows: لا توجد مستندات مستحقة.');
      return;
    }

    let released = 0;
    for (const doc of due.docs) {
      const e = doc.data();
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (fresh.data().status !== 'held') return; // تغيّرت الحالة
          tx.update(doc.ref, {
            status: 'released',
            releaseType: 'auto',
            releasedBy: 'system',
            releasedAt: FieldValue.serverTimestamp()
          });
          tx.update(db.collection('orders').doc(e.orderId), {
            status: 'closed',
            updatedAt: FieldValue.serverTimestamp()
          });
          tx.set(db.collection('payouts').doc(), {
            escrowId: e.escrowId,
            sellerId: e.sellerId,
            tenantId: e.tenantId,
            amount: e.sellerPayout,
            currency: e.currency,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp()
          });
        });
        released++;
      } catch (err) {
        console.error(`autoRelease فشل لـ ${doc.id}:`, err.message);
      }
    }
    console.log(`autoReleaseEscrows: تم تحرير ${released} مستند ضمان.`);
  }
);

module.exports = {
  createEscrowForOrder,
  releaseEscrow,
  openDispute,
  resolveDispute,
  autoReleaseEscrows
};
