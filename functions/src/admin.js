// =============================================================
// لوحة الأدمن (superAdmin فقط): إحصائيات المنصة + إدارة النزاعات.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db } = require('../lib/admin');

function requireAdmin(request) {
  const role = request.auth?.token?.role;
  if (role !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'صلاحية superAdmin مطلوبة.');
  }
}

/**
 * adminStats — إحصائيات المنصة الكاملة (عدّادات تجميعية رخيصة).
 */
const adminStats = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const esc = db.collection('escrowTransactions');
  const [users, products, orders, tenants, disputes, held] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('products').count().get(),
    db.collection('orders').count().get(),
    db.collection('tenants').count().get(),
    esc.where('status', '==', 'disputed').count().get(),
    esc.where('status', '==', 'held').count().get()
  ]);
  return {
    users: users.data().count,
    products: products.data().count,
    orders: orders.data().count,
    tenants: tenants.data().count,
    openDisputes: disputes.data().count,
    heldEscrows: held.data().count
  };
});

/**
 * adminListDisputes — قائمة النزاعات المفتوحة بتفاصيلها لاتخاذ القرار.
 */
const adminListDisputes = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const snap = await db
    .collection('escrowTransactions')
    .where('status', '==', 'disputed')
    .limit(100)
    .get();

  const disputes = snap.docs.map((d) => {
    const e = d.data();
    return {
      escrowId: e.escrowId,
      orderId: e.orderId,
      amount: e.amount,
      currency: e.currency,
      buyerId: e.buyerId,
      sellerId: e.sellerId,
      disputeReason: e.disputeReason || '',
      disputedAt: e.disputedAt?.toMillis?.() || null
    };
  });
  return { disputes };
});

/**
 * adminListEscrows — كل مستندات الضمان الحديثة (للمراقبة).
 */
const adminListEscrows = onCall({ region: REGION }, async (request) => {
  requireAdmin(request);
  const status = request.data?.status; // اختياري للتصفية
  let q = db.collection('escrowTransactions');
  if (status) q = q.where('status', '==', status);
  const snap = await q.limit(100).get();
  const escrows = snap.docs.map((d) => {
    const e = d.data();
    return {
      escrowId: e.escrowId, orderId: e.orderId, status: e.status,
      amount: e.amount, currency: e.currency, buyerId: e.buyerId, sellerId: e.sellerId
    };
  });
  return { escrows };
});

module.exports = { adminStats, adminListDisputes, adminListEscrows };
