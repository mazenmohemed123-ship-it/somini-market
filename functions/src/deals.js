// =============================================================
// المرحلة 3: نظام صفقات الشركات (Company Deals)
// مفاوضة متعددة الأطراف + مراحل دفع + موافقة الأدمن
// الحالات: negotiation → terms_agreed → milestones_created →
//          awaiting_admin → approved → in_progress → completed
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');
const { sendToUser } = require('./notifications');

/**
 * initiateDeal — المشتري يفتح صفقة مع بائع
 * الشروط: كلا الطرفين KYC-approved
 */
const initiateDeal = onCall({ region: REGION }, async (request) => {
  const buyerId = request.auth?.uid;
  if (!buyerId) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { sellerId, productId, quantity, proposedPrice, description, incoterm } = request.data || {};
  if (!sellerId || !productId || !quantity || !proposedPrice) {
    throw new HttpsError('invalid-argument', 'مطلوب: sellerId, productId, quantity, proposedPrice.');
  }

  // شرط التسليم التجاري (اختياري للبيع المحلي، مهم لصفقات التصدير: FOB/CIF...)
  const ALLOWED_INCOTERMS = ['EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', ''];
  const dealIncoterm = incoterm && ALLOWED_INCOTERMS.includes(incoterm) ? incoterm : '';

  // التحقق من KYC للمشتري
  const buyerDoc = await db.collection('users').doc(buyerId).get();
  if (!buyerDoc.exists || buyerDoc.data().kyc_status !== 'approved') {
    throw new HttpsError('permission-denied', 'يجب إكمال التحقق من الهوية (KYC).');
  }

  // التحقق من KYC للبائع
  const sellerDoc = await db.collection('users').doc(sellerId).get();
  if (!sellerDoc.exists || sellerDoc.data().kyc_status !== 'approved') {
    throw new HttpsError('permission-denied', 'البائع لم يكمل التحقق من الهوية.');
  }

  // التحقق من المنتج والمخزون
  const productDoc = await db.collection('products').doc(productId).get();
  if (!productDoc.exists) {
    throw new HttpsError('not-found', 'المنتج غير موجود.');
  }

  const product = productDoc.data();
  if (product.sellerId !== sellerId) {
    throw new HttpsError('permission-denied', 'هذا المنتج لا يخص هذا البائع.');
  }

  if (!product.quantity || product.quantity < quantity) {
    throw new HttpsError('unavailable', 'الكمية المطلوبة غير متاحة.');
  }

  // إنشاء مستند الصفقة
  const dealRef = db.collection('deals').doc();
  const dealId = dealRef.id;

  const dealData = {
    dealId,
    buyerId,
    sellerId,
    productId,
    productTitle: product.title,
    quantity,
    proposedPrice,
    agreedPrice: null,
    totalAmount: null,
    platformFee: null,
    description: description || '',
    incoterm: dealIncoterm,
    status: 'negotiation', // negotiation → terms_agreed → milestones_created → awaiting_admin → approved → in_progress → completed
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastNegotiationAt: FieldValue.serverTimestamp(),
    adminApprovedAt: null,
    completedAt: null
  };

  await dealRef.set(dealData);

  // إنشاء تسجيل مفاوضة أول
  const negRef = db.collection('dealNegotiations').doc();
  await negRef.set({
    negotiationId: negRef.id,
    dealId,
    proposedBy: buyerId,
    quantity,
    price: proposedPrice,
    notes: description || '',
    createdAt: FieldValue.serverTimestamp()
  });

  // إخطار البائع
  await sendToUser(
    sellerId,
    { title: '💼 صفقة جديدة', body: `المشتري يقترح شراء ${quantity} وحدة من "${product.title}"` },
    { type: 'deal', dealId, url: '/seller/deals' }
  );

  // تسجيل في audit log
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'deal_initiated',
    actor: buyerId,
    target: 'deal',
    targetId: dealId,
    details: { sellerId, productId, quantity, proposedPrice },
    evidence: null
  });

  return { ok: true, dealId, status: 'negotiation', message: 'تم إرسال الاقتراح للبائع' };
});

/**
 * respondToNegotiation — أحد الطرفين يرد على المفاوضة
 * البائع قد يرفع السعر أو يقبل، والمشتري قد يقبل أو يرفع
 */
const respondToNegotiation = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { dealId, quantity, price, notes, action } = request.data || {};
  if (!dealId || !action || !['counter', 'accept', 'reject'].includes(action)) {
    throw new HttpsError('invalid-argument', 'مطلوب: dealId, action (counter/accept/reject).');
  }

  const dealDoc = await db.collection('deals').doc(dealId).get();
  if (!dealDoc.exists) throw new HttpsError('not-found', 'الصفقة غير موجودة.');

  const deal = dealDoc.data();
  const isBuyer = uid === deal.buyerId;
  const isSeller = uid === deal.sellerId;

  if (!isBuyer && !isSeller) {
    throw new HttpsError('permission-denied', 'أنت لست طرفاً في هذه الصفقة.');
  }

  if (deal.status !== 'negotiation') {
    throw new HttpsError('failed-precondition', 'لا يمكن التفاوض على هذه الصفقة في الحالة الحالية.');
  }

  if (action === 'counter') {
    if (!quantity || !price) {
      throw new HttpsError('invalid-argument', 'مطلوب: quantity, price للرد المقابل.');
    }

    // إنشاء تسجيل مفاوضة جديد
    const negRef = db.collection('dealNegotiations').doc();
    await negRef.set({
      negotiationId: negRef.id,
      dealId,
      proposedBy: uid,
      quantity,
      price,
      notes: notes || '',
      createdAt: FieldValue.serverTimestamp()
    });

    await db.collection('deals').doc(dealId).update({
      updatedAt: FieldValue.serverTimestamp(),
      lastNegotiationAt: FieldValue.serverTimestamp()
    });

    const otherParty = isBuyer ? deal.sellerId : deal.buyerId;
    await sendToUser(
      otherParty,
      { title: '💬 رد على المفاوضة', body: `${isSeller ? 'البائع' : 'المشتري'} يقترح ${quantity} وحدة بسعر ${price}` },
      { type: 'deal', dealId, url: '/buyer/deals' }
    );

    return { ok: true, status: 'negotiation', message: 'تم إرسال الرد' };
  } else if (action === 'accept') {
    // الموافقة على آخر عرض (نحتاج إلى استدعاء أخير)
    const lastNeg = await db.collection('dealNegotiations')
      .where('dealId', '==', dealId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (lastNeg.empty) {
      throw new HttpsError('invalid-argument', 'لا توجد مفاوضات لقبولها.');
    }

    const negotiation = lastNeg.docs[0].data();
    const totalAmount = negotiation.quantity * negotiation.price;
    const platformFee = Math.ceil(totalAmount * 0.05); // 5% عمولة
    const total = totalAmount + platformFee;

    await db.collection('deals').doc(dealId).update({
      status: 'terms_agreed',
      agreedPrice: negotiation.price,
      quantity: negotiation.quantity,
      totalAmount,
      platformFee,
      total,
      updatedAt: FieldValue.serverTimestamp()
    });

    const otherParty = isBuyer ? deal.sellerId : deal.buyerId;
    await sendToUser(
      otherParty,
      { title: '✅ تم قبول الشروط', body: `الطرف الآخر وافق على ${negotiation.quantity} وحدة بسعر ${negotiation.price}` },
      { type: 'deal', dealId, url: '/seller/deals' }
    );

    // تسجيل في audit log
    const auditRef = db.collection('audit_log').doc();
    await auditRef.set({
      timestamp: FieldValue.serverTimestamp(),
      action: 'deal_terms_agreed',
      actor: uid,
      target: 'deal',
      targetId: dealId,
      details: { quantity: negotiation.quantity, price: negotiation.price, total },
      evidence: null
    });

    return { ok: true, status: 'terms_agreed', message: 'تم قبول الشروط', total };
  } else if (action === 'reject') {
    await db.collection('deals').doc(dealId).update({
      status: 'rejected',
      updatedAt: FieldValue.serverTimestamp()
    });

    const otherParty = isBuyer ? deal.sellerId : deal.buyerId;
    await sendToUser(
      otherParty,
      { title: '❌ تم رفض الصفقة', body: 'قرر الطرف الآخر عدم المتابعة' },
      { type: 'deal', dealId, url: '/seller/deals' }
    );

    return { ok: true, status: 'rejected', message: 'تم رفض الصفقة' };
  }
});

/**
 * createMilestones — بعد قبول الشروط، إنشاء مراحل الدفع
 * المراحل: عربون (down payment) → تجهيز → فحص → إفراج
 */
const createMilestones = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { dealId, milestones } = request.data || {};
  if (!dealId || !milestones || !Array.isArray(milestones) || milestones.length < 2) {
    throw new HttpsError('invalid-argument', 'مطلوب: dealId, مصفوفة مراحل (أقل من 2).');
  }

  const dealDoc = await db.collection('deals').doc(dealId).get();
  if (!dealDoc.exists) throw new HttpsError('not-found', 'الصفقة غير موجودة.');

  const deal = dealDoc.data();
  if (deal.status !== 'terms_agreed') {
    throw new HttpsError('failed-precondition', 'الصفقة يجب أن تكون في حالة terms_agreed.');
  }

  if (uid !== deal.buyerId && uid !== deal.sellerId) {
    throw new HttpsError('permission-denied', 'أنت لست طرفاً في هذه الصفقة.');
  }

  // التحقق من المراحل
  let totalPercentage = 0;
  for (const m of milestones) {
    if (!m.title || !m.percentage || m.percentage <= 0 || m.percentage > 100) {
      throw new HttpsError('invalid-argument', 'كل مرحلة يجب أن تكون لها نسبة مئوية صحيحة.');
    }
    totalPercentage += m.percentage;
  }

  if (totalPercentage !== 100) {
    throw new HttpsError('invalid-argument', 'مجموع النسب المئوية يجب أن يساوي 100%.');
  }

  // إنشاء المراحل
  const milestoneIds = [];
  const batch = db.batch();

  for (const m of milestones) {
    const milestoneRef = db.collection('dealMilestones').doc();
    const amount = Math.round((deal.totalAmount * m.percentage) / 100);

    batch.set(milestoneRef, {
      milestoneId: milestoneRef.id,
      dealId,
      title: m.title,
      description: m.description || '',
      percentage: m.percentage,
      amount,
      status: 'pending', // pending → in_progress → completed → released
      createdAt: FieldValue.serverTimestamp(),
      startedAt: null,
      completedAt: null,
      releasedAt: null
    });

    milestoneIds.push(milestoneRef.id);
  }

  // تحديث حالة الصفقة
  batch.update(db.collection('deals').doc(dealId), {
    status: 'milestones_created',
    updatedAt: FieldValue.serverTimestamp()
  });

  await batch.commit();

  const otherParty = uid === deal.buyerId ? deal.sellerId : deal.buyerId;
  await sendToUser(
    otherParty,
    { title: '📋 تم إنشاء مراحل الدفع', body: `تم تقسيم الصفقة إلى ${milestones.length} مراحل` },
    { type: 'deal', dealId, url: '/seller/deals' }
  );

  return { ok: true, status: 'milestones_created', message: 'تم إنشاء المراحل بنجاح', milestoneIds };
});

/**
 * startMilestone — بدء تنفيذ مرحلة
 */
const startMilestone = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { milestoneId } = request.data || {};
  if (!milestoneId) throw new HttpsError('invalid-argument', 'مطلوب: milestoneId.');

  const milestoneDoc = await db.collection('dealMilestones').doc(milestoneId).get();
  if (!milestoneDoc.exists) throw new HttpsError('not-found', 'المرحلة غير موجودة.');

  const milestone = milestoneDoc.data();
  const dealDoc = await db.collection('deals').doc(milestone.dealId).get();
  const deal = dealDoc.data();

  // فقط البائع يبدأ تنفيذ المرحلة
  if (uid !== deal.sellerId) {
    throw new HttpsError('permission-denied', 'فقط البائع يمكنه بدء المرحلة.');
  }

  if (milestone.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'المرحلة يجب أن تكون pending.');
  }

  await db.collection('dealMilestones').doc(milestoneId).update({
    status: 'in_progress',
    startedAt: FieldValue.serverTimestamp()
  });

  await sendToUser(
    deal.buyerId,
    { title: '🚀 بدأ البائع مرحلة جديدة', body: `${milestone.title} قيد التنفيذ` },
    { type: 'deal', dealId: deal.dealId, url: '/buyer/deals' }
  );

  return { ok: true, status: 'in_progress', message: 'بدأت المرحلة' };
});

/**
 * completeMilestone — البائع ينهي المرحلة، والمشتري يؤكد الاستكمال
 */
const completeMilestone = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { milestoneId, completedBy, evidenceUrl, evidenceNote } = request.data || {};
  if (!milestoneId || !['seller', 'buyer'].includes(completedBy)) {
    throw new HttpsError('invalid-argument', 'مطلوب: milestoneId, completedBy (seller/buyer).');
  }

  // جوهر منع النصب (المستند §3.2 و§5.3): لا إفراج/إنهاء لأي مرحلة دون دليل فعلي مرفوع.
  // البائع ملزم برفع دليل (مستند شحن/صورة تسليم/تأكيد ميناء) عند إنهاء المرحلة — لا تأكيد كلامي.
  if (completedBy === 'seller' && (!evidenceUrl || typeof evidenceUrl !== 'string')) {
    throw new HttpsError('failed-precondition', 'يجب رفع دليل (مستند/صورة) لإنهاء المرحلة. لا يُقبل تأكيد بدون دليل.');
  }

  const milestoneDoc = await db.collection('dealMilestones').doc(milestoneId).get();
  if (!milestoneDoc.exists) throw new HttpsError('not-found', 'المرحلة غير موجودة.');

  const milestone = milestoneDoc.data();
  const dealDoc = await db.collection('deals').doc(milestone.dealId).get();
  const deal = dealDoc.data();

  if (completedBy === 'seller' && uid !== deal.sellerId) {
    throw new HttpsError('permission-denied', 'البائع فقط يمكنه تعليم الانتهاء.');
  }

  if (completedBy === 'buyer' && uid !== deal.buyerId) {
    throw new HttpsError('permission-denied', 'المشتري فقط يمكنه تأكيد الاستكمال.');
  }

  // المشتري لا يؤكد مرحلة إلا بعد أن يرفع البائع دليلها (يمنع التأكيد قبل وجود إثبات)
  if (completedBy === 'buyer' && milestone.status !== 'completed_by_seller') {
    throw new HttpsError('failed-precondition', 'لا يمكن التأكيد قبل أن ينهي البائع المرحلة ويرفع دليلها.');
  }

  const newStatus = completedBy === 'seller' ? 'completed_by_seller' : 'completed';

  const updatePayload = {
    status: newStatus,
    completedAt: newStatus === 'completed' ? FieldValue.serverTimestamp() : milestone.completedAt
  };

  // حفظ الدليل ضمن المرحلة (append سجل في مصفوفة الأدلة)
  if (completedBy === 'seller') {
    updatePayload.evidence = {
      url: evidenceUrl,
      note: evidenceNote || '',
      uploadedBy: uid,
      uploadedAt: Date.now()
    };
  }

  await db.collection('dealMilestones').doc(milestoneId).update(updatePayload);

  // سجل غير قابل للحذف لكل خطوة دليل/تأكيد (audit log append-only)
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: completedBy === 'seller' ? 'milestone_evidence_submitted' : 'milestone_confirmed_by_buyer',
    actor: uid,
    target: 'milestone',
    targetId: milestoneId,
    details: { dealId: deal.dealId, milestoneTitle: milestone.title, newStatus },
    evidence: completedBy === 'seller' ? { url: evidenceUrl, note: evidenceNote || '' } : null
  });

  if (completedBy === 'seller') {
    await sendToUser(
      deal.buyerId,
      { title: '✅ المرحلة منتهية', body: `البائع انتهى من: ${milestone.title}. يرجى التحقق والتأكيد.` },
      { type: 'deal', dealId: deal.dealId, url: '/buyer/deals' }
    );
  } else {
    await sendToUser(
      deal.sellerId,
      { title: '🎉 تم تأكيد المرحلة', body: `${milestone.title} موثقة ومؤكدة من المشتري` },
      { type: 'deal', dealId: deal.dealId, url: '/seller/deals' }
    );
  }

  return { ok: true, status: newStatus, message: 'تم تحديث حالة المرحلة' };
});

/**
 * submitDealForApproval — بعد انتهاء جميع المراحل، تقديم للأدمن
 */
const submitDealForApproval = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const role = request.auth?.token?.role;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  if (role !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'فقط الأدمن يمكنه الموافقة على الصفقات.');
  }

  const { dealId } = request.data || {};
  if (!dealId) throw new HttpsError('invalid-argument', 'مطلوب: dealId.');

  const dealDoc = await db.collection('deals').doc(dealId).get();
  if (!dealDoc.exists) throw new HttpsError('not-found', 'الصفقة غير موجودة.');

  const deal = dealDoc.data();

  // التحقق من أن جميع المراحل اكتملت
  const milestonesQuery = await db.collection('dealMilestones')
    .where('dealId', '==', dealId)
    .get();

  if (milestonesQuery.empty) {
    throw new HttpsError('failed-precondition', 'لا توجد مراحل للصفقة.');
  }

  const allCompleted = milestonesQuery.docs.every(doc => doc.data().status === 'completed');
  if (!allCompleted) {
    throw new HttpsError('failed-precondition', 'جميع المراحل يجب أن تكون completed.');
  }

  await db.collection('deals').doc(dealId).update({
    status: 'awaiting_admin',
    updatedAt: FieldValue.serverTimestamp()
  });

  // إخطار الأدمن
  await sendToUser(
    'admin', // اصطلاح: الأدمن يتابع التنبيهات
    { title: '⏳ صفقة في انتظار الموافقة', body: `صفقة من ${deal.buyerId} إلى ${deal.sellerId}` },
    { type: 'deal', dealId, url: '/admin/deals' }
  );

  return { ok: true, status: 'awaiting_admin', message: 'تم تقديم الصفقة للموافقة' };
});

/**
 * approveDeal — الأدمن يوافق على الصفقة ويحررها
 */
const approveDeal = onCall({ region: REGION }, async (request) => {
  const role = request.auth?.token?.role;
  if (role !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'فقط الأدمن يمكنه الموافقة على الصفقات.');
  }

  const { dealId } = request.data || {};
  if (!dealId) throw new HttpsError('invalid-argument', 'مطلوب: dealId.');

  const dealDoc = await db.collection('deals').doc(dealId).get();
  if (!dealDoc.exists) throw new HttpsError('not-found', 'الصفقة غير موجودة.');

  const deal = dealDoc.data();
  if (deal.status !== 'awaiting_admin') {
    throw new HttpsError('failed-precondition', 'الصفقة يجب أن تكون في انتظار الموافقة.');
  }

  // تحديث الصفقة
  await db.collection('deals').doc(dealId).update({
    status: 'approved',
    adminApprovedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  // إنشاء escrow transaction لكل المراحل
  const escrowRef = db.collection('escrowTransactions').doc();
  await escrowRef.set({
    escrowId: escrowRef.id,
    dealId,
    buyerId: deal.buyerId,
    sellerId: deal.sellerId,
    amount: deal.total,
    currency: 'EGP',
    status: 'on_hold',
    provider: 'paymob_instant',
    holdedAt: FieldValue.serverTimestamp(),
    releaseConditions: {
      allMilestonesCompleted: false
    },
    releaseApprovedAt: null
  });

  // إخطار الطرفين
  await sendToUser(
    deal.buyerId,
    { title: '✅ تم الموافقة على الصفقة', body: 'الأدمن وافق على الصفقة، جاهزة للدفع' },
    { type: 'deal', dealId, url: '/buyer/deals' }
  );

  await sendToUser(
    deal.sellerId,
    { title: '✅ تم الموافقة على الصفقة', body: 'الأدمن وافق، انتظر الدفع من المشتري' },
    { type: 'deal', dealId, url: '/seller/deals' }
  );

  // تسجيل في audit log
  const auditRef = db.collection('audit_log').doc();
  await auditRef.set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'deal_approved',
    actor: request.auth.uid,
    target: 'deal',
    targetId: dealId,
    details: { amount: deal.total },
    evidence: null
  });

  return { ok: true, status: 'approved', escrowId: escrowRef.id, message: 'تم الموافقة على الصفقة' };
});

/**
 * releaseMilestonePayment — تحرير دفعة مرحلة محددة
 */
const releaseMilestonePayment = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const role = request.auth?.token?.role;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { milestoneId } = request.data || {};
  if (!milestoneId) throw new HttpsError('invalid-argument', 'مطلوب: milestoneId.');

  const milestoneDoc = await db.collection('dealMilestones').doc(milestoneId).get();
  if (!milestoneDoc.exists) throw new HttpsError('not-found', 'المرحلة غير موجودة.');

  const milestone = milestoneDoc.data();
  const dealDoc = await db.collection('deals').doc(milestone.dealId).get();
  const deal = dealDoc.data();

  // المشتري أو الأدمن يحرر الدفعة
  const isBuyer = uid === deal.buyerId;
  const isAdmin = role === 'superAdmin';

  if (!isBuyer && !isAdmin) {
    throw new HttpsError('permission-denied', 'فقط المشتري أو الأدمن يحرر الدفعة.');
  }

  if (milestone.status !== 'completed') {
    throw new HttpsError('failed-precondition', 'المرحلة يجب أن تكون completed.');
  }

  await db.collection('dealMilestones').doc(milestoneId).update({
    status: 'released',
    releasedAt: FieldValue.serverTimestamp()
  });

  // إنشاء payout للبائع
  const commission = Math.ceil(milestone.amount * 0.05);
  const sellerPayout = milestone.amount - commission;

  const payoutRef = db.collection('payouts').doc();
  await payoutRef.set({
    payoutId: payoutRef.id,
    milestoneId,
    dealId: milestone.dealId,
    sellerId: deal.sellerId,
    amount: sellerPayout,
    currency: 'EGP',
    status: 'pending',
    createdAt: FieldValue.serverTimestamp()
  });

  await sendToUser(
    deal.sellerId,
    { title: '💰 تم تحرير دفعة', body: `${sellerPayout} EGP من "${milestone.title}"` },
    { type: 'deal', dealId: deal.dealId, url: '/seller/deals' }
  );

  return { ok: true, status: 'released', message: 'تم تحرير الدفعة' };
});

module.exports = {
  initiateDeal,
  respondToNegotiation,
  createMilestones,
  startMilestone,
  completeMilestone,
  submitDealForApproval,
  approveDeal,
  releaseMilestonePayment
};
