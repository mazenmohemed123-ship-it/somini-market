// =============================================================
// إحصائيات لوحة تحكم البائع.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, Timestamp } = require('../lib/admin');

const PAID_STATES = ['paid', 'shipped', 'delivered', 'closed'];

/**
 * sellerDashboard — يرجع إحصائيات سريعة + بيانات رسم بياني شهري.
 */
const sellerDashboard = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const token = request.auth?.token;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');
  if (!['seller', 'companyAdmin'].includes(token?.role)) {
    throw new HttpsError('permission-denied', 'مخصّص للبائعين.');
  }

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const ordersSnap = await db
    .collection('orders')
    .where('sellerId', '==', uid)
    .where('createdAt', '>=', Timestamp.fromDate(startOfMonth))
    .get();

  let todaySales = 0, monthSales = 0, todayCount = 0, monthCount = 0, pending = 0, disputes = 0;
  const productTally = {};
  const dailySeries = {}; // 'YYYY-MM-DD' → مبيعات

  ordersSnap.forEach((doc) => {
    const o = doc.data();
    const created = o.createdAt?.toDate?.() || now;
    const isPaid = PAID_STATES.includes(o.status);

    if (o.status === 'disputed') disputes++;
    if (['paid', 'shipped'].includes(o.status)) pending++;

    if (isPaid) {
      monthSales += o.totalAmount || 0;
      monthCount++;
      const key = created.toISOString().slice(0, 10);
      dailySeries[key] = (dailySeries[key] || 0) + (o.totalAmount || 0);
      productTally[o.productId] = (productTally[o.productId] || 0) + (o.quantity || 1);
      if (created >= startOfDay) {
        todaySales += o.totalAmount || 0;
        todayCount++;
      }
    }
  });

  // أكثر 5 منتجات مبيعاً
  const topProducts = Object.entries(productTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, sold]) => ({ productId, sold }));

  // سلسلة رسم بياني لأيام الشهر بالترتيب
  const chart = Object.entries(dailySeries)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total]) => ({ date, total }));

  return {
    todaySales, monthSales, todayCount, monthCount,
    pendingOrders: pending, openDisputes: disputes,
    topProducts, chart
  };
});

module.exports = { sellerDashboard };
