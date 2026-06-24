// =============================================================
// التقسيط الداخلي (Pay Later) — المستند §4.3
// المنصة تنشئ جدول دفعات وتتابع كل دفعة، لكنها لا تضمن ولا تموّل.
// التأخر يُعلَّم ويُنبَّه له فقط — لا تغطية مالية من المنصة.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { REGION } = require('../lib/config');
const { db, FieldValue } = require('../lib/admin');
const { sendToUser } = require('./notifications');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * createInstallmentPlan — المشتري يقسّم قيمة طلب/صفقة على دفعات شهرية
 * data: { parentType: 'order'|'deal', parentId, count }
 */
const createInstallmentPlan = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { parentType, parentId, count } = request.data || {};
  if (!['order', 'deal'].includes(parentType) || !parentId) {
    throw new HttpsError('invalid-argument', 'مطلوب: parentType (order/deal), parentId.');
  }
  const n = parseInt(count, 10);
  if (!n || n < 2 || n > 24) {
    throw new HttpsError('invalid-argument', 'عدد الدفعات يجب أن يكون بين 2 و 24.');
  }

  // قراءة المستند الأصلي (order أو deal)
  const parentRef = db.collection(parentType === 'order' ? 'orders' : 'deals').doc(parentId);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) throw new HttpsError('not-found', 'المستند الأصلي غير موجود.');
  const parent = parentSnap.data();

  const buyerId = parent.buyerId;
  const sellerId = parent.sellerId;
  const totalAmount = parent.total || parent.totalAmount || parent.amount;

  if (uid !== buyerId) {
    throw new HttpsError('permission-denied', 'فقط المشتري يمكنه إنشاء خطة تقسيط.');
  }
  if (!totalAmount || totalAmount <= 0) {
    throw new HttpsError('failed-precondition', 'قيمة المعاملة غير محددة بعد.');
  }

  // منع تكرار خطة لنفس المعاملة
  const existing = await db.collection('installment_plans')
    .where('parentType', '==', parentType)
    .where('parentId', '==', parentId)
    .limit(1).get();
  if (!existing.empty) {
    throw new HttpsError('already-exists', 'يوجد خطة تقسيط لهذه المعاملة بالفعل.');
  }

  // توليد الجدول: دفعات متساوية مع تسوية الفرق في الأخيرة، استحقاق شهري
  const base = Math.floor(totalAmount / n);
  const now = Date.now();
  const installments = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? totalAmount - allocated : base;
    allocated += amount;
    installments.push({
      index: i,
      amount,
      dueDate: new Date(now + (i + 1) * 30 * MS_PER_DAY).toISOString(),
      status: 'pending', // pending | paid | overdue
      paidAt: null
    });
  }

  const planRef = db.collection('installment_plans').doc();
  await planRef.set({
    planId: planRef.id,
    parentType,
    parentId,
    buyerId,
    sellerId,
    totalAmount,
    count: n,
    installments,
    status: 'active', // active | completed | defaulted
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await sendToUser(
    sellerId,
    { title: '🗓️ خطة تقسيط جديدة', body: `المشتري اختار الدفع على ${n} دفعات شهرية` },
    { type: 'installment', planId: planRef.id, url: '/installments' }
  );

  // سجل غير قابل للحذف
  await db.collection('audit_log').doc().set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'installment_plan_created',
    actor: uid,
    target: parentType,
    targetId: parentId,
    details: { count: n, totalAmount },
    evidence: null
  });

  return { ok: true, planId: planRef.id, count: n, message: 'تم إنشاء خطة التقسيط' };
});

/**
 * markInstallmentPaid — تعليم دفعة كمدفوعة (المشتري بعد الدفع، أو الأدمن)
 * data: { planId, index }
 */
const markInstallmentPaid = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const role = request.auth?.token?.role;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const { planId, index } = request.data || {};
  if (!planId || index === undefined || index === null) {
    throw new HttpsError('invalid-argument', 'مطلوب: planId, index.');
  }

  const planRef = db.collection('installment_plans').doc(planId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(planRef);
    if (!snap.exists) throw new HttpsError('not-found', 'خطة التقسيط غير موجودة.');
    const plan = snap.data();

    if (uid !== plan.buyerId && role !== 'superAdmin') {
      throw new HttpsError('permission-denied', 'فقط المشتري أو الأدمن.');
    }

    const idx = parseInt(index, 10);
    const installments = [...plan.installments];
    if (!installments[idx]) throw new HttpsError('invalid-argument', 'دفعة غير موجودة.');
    if (installments[idx].status === 'paid') {
      throw new HttpsError('failed-precondition', 'الدفعة مدفوعة بالفعل.');
    }

    installments[idx] = { ...installments[idx], status: 'paid', paidAt: new Date().toISOString() };
    const allPaid = installments.every(i => i.status === 'paid');

    tx.update(planRef, {
      installments,
      status: allPaid ? 'completed' : 'active',
      updatedAt: FieldValue.serverTimestamp()
    });

    return { sellerId: plan.sellerId, amount: installments[idx].amount, allPaid };
  });

  await sendToUser(
    result.sellerId,
    {
      title: result.allPaid ? '✅ اكتمل التقسيط' : '💵 دفعة مستلمة',
      body: result.allPaid ? 'تم سداد كل الدفعات' : `تم سداد دفعة ${result.amount} ج.م`
    },
    { type: 'installment', planId, url: '/installments' }
  );

  await db.collection('audit_log').doc().set({
    timestamp: FieldValue.serverTimestamp(),
    action: 'installment_paid',
    actor: uid,
    target: 'installment_plan',
    targetId: planId,
    details: { index: parseInt(index, 10), allPaid: result.allPaid },
    evidence: null
  });

  return { ok: true, allPaid: result.allPaid, message: 'تم تسجيل الدفعة' };
});

/**
 * checkOverdueInstallments — مجدولة يومياً: تعليم الدفعات المتأخرة وتنبيه الأطراف
 */
const checkOverdueInstallments = onSchedule(
  { region: REGION, schedule: 'every day 09:00', timeZone: 'Africa/Cairo' },
  async () => {
    const now = Date.now();
    const activePlans = await db.collection('installment_plans').where('status', '==', 'active').get();
    if (activePlans.empty) {
      console.log('checkOverdueInstallments: لا توجد خطط نشطة.');
      return;
    }

    let flagged = 0;
    for (const docSnap of activePlans.docs) {
      const plan = docSnap.data();
      let changed = false;
      const installments = plan.installments.map(inst => {
        if (inst.status === 'pending' && new Date(inst.dueDate).getTime() < now) {
          changed = true;
          flagged++;
          return { ...inst, status: 'overdue' };
        }
        return inst;
      });

      if (changed) {
        const anyOverdue = installments.some(i => i.status === 'overdue');
        await docSnap.ref.update({
          installments,
          status: anyOverdue ? 'defaulted' : plan.status,
          updatedAt: FieldValue.serverTimestamp()
        });

        // تنبيه المشتري والبائع — المنصة لا تضمن، فقط تُعلِم
        await sendToUser(
          plan.buyerId,
          { title: '⚠️ دفعة متأخرة', body: 'لديك دفعة تقسيط متأخرة. يرجى السداد.' },
          { type: 'installment', planId: plan.planId, url: '/installments' }
        );
        await sendToUser(
          plan.sellerId,
          { title: '⚠️ تأخر سداد', body: 'المشتري تأخّر في دفعة تقسيط.' },
          { type: 'installment', planId: plan.planId, url: '/installments' }
        );
      }
    }

    console.log(`checkOverdueInstallments: تم تعليم ${flagged} دفعة كمتأخرة.`);
  }
);

module.exports = {
  createInstallmentPlan,
  markInstallmentPaid,
  checkOverdueInstallments
};
