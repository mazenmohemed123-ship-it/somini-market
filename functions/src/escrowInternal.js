// =============================================================
// منطق تحرير الضمان القابل لإعادة الاستخدام (يستدعيه REST API).
// =============================================================
const { db, FieldValue } = require('../lib/admin');

/**
 * releaseEscrowInternal — تحرير ضمان من خارج طبقة onCall (مثل REST API).
 * يفرض أن المُحرِّر ضمن نفس tenant وأن الحالة held.
 */
async function releaseEscrowInternal({ escrowId, actorId, actorRole, tenantId }) {
  const escrowRef = db.collection('escrowTransactions').doc(escrowId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(escrowRef);
    if (!snap.exists) throw new Error('مستند الضمان غير موجود.');
    const e = snap.data();

    if (tenantId && e.tenantId !== tenantId) {
      throw new Error('الضمان خارج نطاق الـ tenant.');
    }
    if (e.status !== 'held') {
      throw new Error(`لا يمكن التحرير، الحالة: ${e.status}`);
    }

    tx.update(escrowRef, {
      status: 'released',
      releaseType: 'manual',
      releasedBy: actorId,
      releasedVia: actorRole,
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

    return { status: 'released', payout: e.sellerPayout };
  });
}

module.exports = { releaseEscrowInternal };
