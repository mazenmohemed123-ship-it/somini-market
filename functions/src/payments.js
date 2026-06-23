// =============================================================
// الدفع عبر Paymob + إنشاء الطلبات + ربط الضمان
// createPaymentIntent: يبني الطلب ويعيد iframe token من Paymob.
// handlePaymobWebhook: يتحقق من HMAC، يعلّم الطلب paid، وإن كانت
// صفقة كبيرة ينشئ مستند escrowTransaction.
// =============================================================
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const axios = require('axios');
const { REGION, DEFAULTS, getSecret } = require('../lib/config');
const { db, FieldValue, Timestamp } = require('../lib/admin');
const { createEscrowForOrder } = require('./escrow');
const { sendToUser } = require('./notifications');

const PAYMOB_BASE = 'https://accept.paymob.com/api';

/**
 * createPaymentIntent — ينشئ طلباً بحالة pending ويعيد payment_key (iframe token).
 * المبالغ بالقروش (×100) كما يتطلب Paymob.
 */
const createPaymentIntent = onCall(
  { region: REGION, secrets: ['PAYMOB_API_KEY', 'PAYMOB_INTEGRATION_ID', 'PAYMOB_IFRAME_ID'] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

    const { productId, quantity = 1 } = request.data || {};
    if (!productId) throw new HttpsError('invalid-argument', 'productId مفقود.');

    // اقرأ المنتج بمصداقية من الخادم (لا تثق بسعر العميل)
    const prodSnap = await db.collection('products').doc(productId).get();
    if (!prodSnap.exists) throw new HttpsError('not-found', 'المنتج غير موجود.');
    const product = prodSnap.data();
    if (product.status !== 'active') {
      throw new HttpsError('failed-precondition', 'المنتج غير متاح للبيع.');
    }
    const qty = Math.max(1, Math.min(parseInt(quantity, 10) || 1, product.quantity || 1));
    const totalAmount = Math.round(product.price * qty * 100) / 100;
    const isEscrow = totalAmount >= DEFAULTS.escrowThreshold;

    // أنشئ الطلب pending مع TTL (يحذفه تلقائياً إن لم يُدفع خلال 24س)
    const orderRef = db.collection('orders').doc();
    const order = {
      orderId: orderRef.id,
      buyerId: uid,
      sellerId: product.sellerId,
      tenantId: product.tenantId,
      productId,
      productTitle: product.title,
      quantity: qty,
      totalAmount,
      currency: product.currency || DEFAULTS.currency,
      isEscrow,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
    };
    await orderRef.set(order);

    // --- تسلسل Paymob: auth → order → payment_key ---
    const apiKey = await getSecret('PAYMOB_API_KEY');
    const integrationId = await getSecret('PAYMOB_INTEGRATION_ID');
    const iframeId = await getSecret('PAYMOB_IFRAME_ID');

    const { data: auth } = await axios.post(`${PAYMOB_BASE}/auth/tokens`, { api_key: apiKey });
    const authToken = auth.token;

    const amountCents = Math.round(totalAmount * 100);
    const { data: pmOrder } = await axios.post(`${PAYMOB_BASE}/ecommerce/orders`, {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: order.currency,
      merchant_order_id: orderRef.id,
      items: [{ name: product.title, amount_cents: amountCents, quantity: qty }]
    });

    const userDoc = await db.collection('users').doc(uid).get();
    const u = userDoc.exists ? userDoc.data() : {};
    const { data: pmKey } = await axios.post(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: pmOrder.id,
      currency: order.currency,
      integration_id: parseInt(integrationId, 10),
      billing_data: {
        email: u.email || 'na@somni.market',
        first_name: (u.fullName || 'Somni').split(' ')[0],
        last_name: (u.fullName || 'User').split(' ').slice(1).join(' ') || 'User',
        phone_number: u.phone || '+200000000000',
        country: 'EG',
        city: 'NA',
        street: 'NA',
        building: 'NA',
        floor: 'NA',
        apartment: 'NA'
      }
    });

    await orderRef.update({ paymobOrderId: pmOrder.id });

    return {
      orderId: orderRef.id,
      isEscrow,
      paymentToken: pmKey.token,
      iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${pmKey.token}`
    };
  }
);

/**
 * handlePaymobWebhook — يستقبل تأكيد الدفع من Paymob.
 * يتحقق من HMAC ثم يحدّث الطلب وينشئ الضمان عند الحاجة.
 */
const handlePaymobWebhook = onRequest(
  { region: REGION, secrets: ['PAYMOB_HMAC_SECRET'] },
  async (req, res) => {
    try {
      const hmacSecret = await getSecret('PAYMOB_HMAC_SECRET');
      const obj = req.body?.obj;
      const receivedHmac = req.query.hmac;
      if (!obj || !receivedHmac) {
        res.status(400).send('bad request');
        return;
      }

      // ترتيب الحقول كما تحدده Paymob لحساب HMAC
      const ordered = [
        'amount_cents', 'created_at', 'currency', 'error_occured',
        'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
        'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
        'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan',
        'source_data.sub_type', 'source_data.type', 'success'
      ];
      const concatenated = ordered
        .map((path) => path.split('.').reduce((o, k) => (o ? o[k] : ''), obj))
        .join('');
      const computed = crypto
        .createHmac('sha512', hmacSecret)
        .update(concatenated)
        .digest('hex');

      if (computed !== receivedHmac) {
        console.error('Paymob HMAC mismatch');
        res.status(401).send('invalid hmac');
        return;
      }

      if (!obj.success || obj.pending) {
        res.status(200).send('ignored (not successful)');
        return;
      }

      const merchantOrderId = obj.order?.merchant_order_id;
      if (!merchantOrderId) {
        res.status(200).send('no merchant order');
        return;
      }

      const orderRef = db.collection('orders').doc(merchantOrderId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw new Error('order not found');
        const order = snap.data();
        if (order.status === 'paid' || order.status === 'closed') return; // idempotent

        tx.update(orderRef, {
          status: 'paid',
          paidAt: FieldValue.serverTimestamp(),
          paymobTxnId: obj.id,
          expiresAt: FieldValue.delete() // أزل TTL بعد الدفع
        });

        // أنقص الكمية المتاحة
        tx.update(db.collection('products').doc(order.productId), {
          quantity: FieldValue.increment(-order.quantity)
        });
      });

      // إنشاء الضمان خارج المعاملة (يقرأ الطلب المحدَّث)
      const fresh = (await orderRef.get()).data();
      if (fresh.isEscrow && !fresh.escrowId) {
        const escrowId = await createEscrowForOrder(fresh);
        await orderRef.update({ escrowId });
      }

      // إشعار البائع بطلب مدفوع جديد
      await sendToUser(
        fresh.sellerId,
        { title: '🛒 طلب جديد مدفوع', body: `${fresh.productTitle} — ${fresh.totalAmount} ${fresh.currency}` },
        { type: 'order', orderId: fresh.orderId, url: '/seller/dashboard' }
      );

      res.status(200).send('ok');
    } catch (err) {
      console.error('handlePaymobWebhook error:', err);
      res.status(500).send('error');
    }
  }
);

module.exports = { createPaymentIntent, handlePaymobWebhook };
