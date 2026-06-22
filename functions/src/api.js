// =============================================================
// REST API للتكاملات الخارجية (Shopify/WooCommerce وغيرها).
// محمي بمفتاح API يُخزَّن مجزّأً (hash) في apiIntegrations والمفتاح
// الخام يُحفظ في Secret Manager. يدعم: إضافة منتج، جلب طلبات،
// تحرير ضمان.
// =============================================================
const { onRequest, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const { REGION, DEFAULTS } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');
const { releaseEscrowInternal } = require('./escrowInternal');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// مصادقة المفتاح: Authorization: Bearer <apiKey>
async function authenticate(req) {
  const header = req.get('authorization') || '';
  const apiKey = header.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey) return null;

  const keyHash = hashKey(apiKey);
  const snap = await db
    .collection('apiIntegrations')
    .where('keyHash', '==', keyHash)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data(); // { tenantId, sellerId, ... }
}

function send(res, status, body) {
  res.set('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

/**
 * api — راوتر REST واحد (onRequest). يُفضّل تفعيل App Check أمامه.
 *   POST /api/products
 *   GET  /api/orders
 *   POST /api/escrow/release
 */
const api = onRequest({ region: REGION, cors: true }, async (req, res) => {
  const integration = await authenticate(req);
  if (!integration) {
    return send(res, 401, { error: 'unauthorized', message: 'مفتاح API غير صالح.' });
  }

  // المسار بعد /api
  const path = req.path.replace(/^\/api/, '') || '/';

  try {
    // POST /products — إضافة منتج
    if (req.method === 'POST' && path === '/products') {
      const d = req.body || {};
      const price = Number(d.price);
      if (!d.title || !(price >= 0)) {
        return send(res, 400, { error: 'invalid', message: 'title/price مطلوبان.' });
      }
      const ref = db.collection('products').doc();
      await ref.set({
        productId: ref.id,
        tenantId: integration.tenantId,
        sellerId: integration.sellerId,
        title: String(d.title).trim(),
        description: String(d.description || '').slice(0, 5000),
        category: d.category || 'general',
        price,
        currency: d.currency || DEFAULTS.currency,
        condition: ['new', 'used'].includes(d.condition) ? d.condition : 'new',
        quantity: Math.max(0, parseInt(d.quantity, 10) || 1),
        images: Array.isArray(d.images) ? d.images.slice(0, 10) : [],
        status: 'active',
        source: integration.platform || 'api',
        externalId: d.externalId || null,
        createdAt: FieldValue.serverTimestamp()
      });
      return send(res, 201, { ok: true, productId: ref.id });
    }

    // GET /orders — جلب طلبات البائع
    if (req.method === 'GET' && path === '/orders') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const snap = await db
        .collection('orders')
        .where('sellerId', '==', integration.sellerId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      const orders = snap.docs.map((d) => {
        const o = d.data();
        return {
          orderId: o.orderId, status: o.status, totalAmount: o.totalAmount,
          currency: o.currency, productId: o.productId, quantity: o.quantity,
          isEscrow: o.isEscrow, escrowId: o.escrowId || null
        };
      });
      return send(res, 200, { ok: true, count: orders.length, orders });
    }

    // POST /escrow/release — تحرير دفعة ضمان (يخص البائع/التكامل)
    if (req.method === 'POST' && path === '/escrow/release') {
      const escrowId = req.body?.escrowId;
      if (!escrowId) return send(res, 400, { error: 'invalid', message: 'escrowId مطلوب.' });
      const result = await releaseEscrowInternal({
        escrowId,
        actorId: integration.sellerId,
        actorRole: 'apiIntegration',
        tenantId: integration.tenantId
      });
      return send(res, 200, { ok: true, ...result });
    }

    return send(res, 404, { error: 'not_found', message: 'المسار غير موجود.' });
  } catch (err) {
    console.error('api error:', err);
    const status = err instanceof HttpsError ? 400 : 500;
    return send(res, status, { error: 'server_error', message: err.message });
  }
});

module.exports = { api };
