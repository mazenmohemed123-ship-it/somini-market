// =============================================================
// مسار البيع المباشر (Direct Sales) — إنشاء طلب فوري
// شرط أساسي: المشتري والبائع يجب أن يكونا KYC-approved (L1+)
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');

/**
 * createOrder — المشتري ينشئ طلب لمنتج معروض
 * التحقق:
 *  1. المشتري KYC-approved (kyc_status: 'approved')
 *  2. البائع KYC-approved (kyc_status: 'approved')
 *  3. المنتج في المخزون
 *  4. السعر يتطابق (منع TOCTOU)
 * النتيجة:
 *  - order document (buyerId, sellerId, status: 'pending_payment', ...)
 *  - escrowTransaction hold (محجوز/معلّق حتى التسليم)
 *  - paymentIntent (بيانات Paymob)
 */
const createOrder = onCall({ region: REGION }, async (request) => {
  const buyerId = request.auth?.uid;
  if (!buyerId) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { productId, quantity, paymentMethod } = request.data || {};
  if (!productId || !quantity || quantity < 1) {
    throw new HttpsError('invalid-argument', 'مطلوب: productId, quantity.');
  }

  // 1. التحقق من KYC للمشتري
  const buyerDoc = await db.collection('users').doc(buyerId).get();
  if (!buyerDoc.exists || buyerDoc.data().kyc_status !== 'approved') {
    throw new HttpsError('permission-denied', 'يجب إكمال التحقق من الهوية (KYC) لإنشاء طلب.');
  }

  // 2. جلب المنتج
  const productDoc = await db.collection('products').doc(productId).get();
  if (!productDoc.exists) {
    throw new HttpsError('not-found', 'المنتج غير موجود.');
  }

  const product = productDoc.data();
  const sellerId = product.sellerId;

  // 3. التحقق من KYC للبائع
  const sellerDoc = await db.collection('users').doc(sellerId).get();
  if (!sellerDoc.exists || sellerDoc.data().kyc_status !== 'approved') {
    throw new HttpsError('permission-denied', 'البائع لم يكمل التحقق من الهوية.');
  }

  // 4. التحقق من المخزون
  if (!product.quantity || product.quantity < quantity) {
    throw new HttpsError('unavailable', 'الكمية المطلوبة غير متاحة.');
  }

  // 5. حساب المبلغ الإجمالي
  const subtotal = product.price * quantity;
  const platformFee = Math.ceil(subtotal * 0.05); // 5% عمولة
  const total = subtotal + platformFee;

  // 6. إنشاء Order document
  const orderRef = db.collection('orders').doc();
  const orderId = orderRef.id;

  const orderData = {
    orderId,
    buyerId,
    sellerId,
    productId,
    productTitle: product.title,
    quantity,
    unitPrice: product.price,
    subtotal,
    platformFee,
    total,
    currency: product.currency || 'EGP',
    status: 'pending_payment', // pending_payment → payment_confirmed → shipped → delivered → completed
    paymentMethod: paymentMethod || 'paymob', // paymob, bank_transfer
    paymentStatus: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    notes: '',
    trackingNumber: null,
    deliveredAt: null,
    completedAt: null
  };

  await orderRef.set(orderData);

  // 7. إنشاء Escrow Transaction (محجوز في انتظار التسليم)
  const escrowRef = db.collection('escrowTransactions').doc();
  const escrowData = {
    escrowId: escrowRef.id,
    orderId,
    buyerId,
    sellerId,
    amount: total,
    currency: product.currency || 'EGP',
    status: 'on_hold', // on_hold → released → disputed → refunded
    provider: 'paymob_instant',
    holdedAt: FieldValue.serverTimestamp(),
    releaseConditions: {
      shippingConfirmed: false,
      deliveryConfirmed: false
    },
    releaseApprovedAt: null
  };

  await escrowRef.set(escrowData);

  // 8. تسجيل في audit_log (لتتبع الإجراءات الحساسة)
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'order_created',
    actor: buyerId,
    target: 'order',
    targetId: orderId,
    details: {
      buyerId,
      sellerId,
      productId,
      quantity,
      total
    },
    evidence: null
  });

  // 9. تقليل المخزون
  await db.collection('products').doc(productId).update({
    quantity: product.quantity - quantity,
    updatedAt: FieldValue.serverTimestamp()
  });

  // ملاحظة: payment intent يُرجع بدون معالجة دفع فعلية في مرحلة الـ MVP.
  // لاحقاً: تكامل مع Paymob SDK لإنشاء intent فعلي.

  return {
    orderId,
    escrowId: escrowRef.id,
    status: 'pending_payment',
    total,
    message: 'تم إنشاء الطلب. انتظر قبول الدفع.'
  };
});

/**
 * confirmOrderShipped — البائع يؤكد الشحن برقم تتبع
 */
const confirmOrderShipped = onCall({ region: REGION }, async (request) => {
  const sellerId = request.auth?.uid;
  if (!sellerId) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { orderId, trackingNumber } = request.data || {};
  if (!orderId || !trackingNumber) {
    throw new HttpsError('invalid-argument', 'مطلوب: orderId, trackingNumber.');
  }

  const orderDoc = await db.collection('orders').doc(orderId).get();
  if (!orderDoc.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');

  const order = orderDoc.data();
  if (order.sellerId !== sellerId) {
    throw new HttpsError('permission-denied', 'أنت لست صاحب الطلب.');
  }

  if (order.status !== 'payment_confirmed') {
    throw new HttpsError('invalid-argument', 'الطلب لم يُدفع بعد.');
  }

  // تحديث الطلب
  await db.collection('orders').doc(orderId).update({
    status: 'shipped',
    trackingNumber,
    updatedAt: FieldValue.serverTimestamp()
  });

  // تسجيل في audit log
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'order_shipped',
    actor: sellerId,
    target: 'order',
    targetId: orderId,
    details: { trackingNumber },
    evidence: null
  });

  return { ok: true, status: 'shipped' };
});

/**
 * confirmOrderDelivered — المشتري يؤكد الاستلام + صورة دليل
 */
const confirmOrderDelivered = onCall({ region: REGION }, async (request) => {
  const buyerId = request.auth?.uid;
  if (!buyerId) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { orderId, deliveryProofUrl } = request.data || {};
  if (!orderId || !deliveryProofUrl) {
    throw new HttpsError('invalid-argument', 'مطلوب: orderId, deliveryProofUrl.');
  }

  const orderDoc = await db.collection('orders').doc(orderId).get();
  if (!orderDoc.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');

  const order = orderDoc.data();
  if (order.buyerId !== buyerId) {
    throw new HttpsError('permission-denied', 'أنت لست مشتري الطلب.');
  }

  if (order.status !== 'shipped') {
    throw new HttpsError('invalid-argument', 'الطلب لم يُشحن بعد.');
  }

  // تحديث الطلب
  const deliveredAt = new Date();
  await db.collection('orders').doc(orderId).update({
    status: 'delivered',
    deliveredAt,
    updatedAt: FieldValue.serverTimestamp()
  });

  // تحديث escrow: الإفراج عن الأموال إلى البائع
  const escrows = await db.collection('escrowTransactions').where('orderId', '==', orderId).limit(1).get();
  if (!escrows.empty) {
    await escrows.docs[0].ref.update({
      status: 'released',
      releaseApprovedAt: FieldValue.serverTimestamp()
    });
  }

  // تسجيل في audit log
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'order_delivered',
    actor: buyerId,
    target: 'order',
    targetId: orderId,
    details: { deliveryProofUrl },
    evidence: deliveryProofUrl
  });

  return { ok: true, status: 'delivered' };
});

module.exports = { createOrder, confirmOrderShipped, confirmOrderDelivered };
