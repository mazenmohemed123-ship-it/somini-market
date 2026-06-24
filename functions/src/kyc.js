// =============================================================
// نظام التحقق من الهوية (KYC) — المستويات L0 → L3
// تحديد مستوى الثقة بناءً على الوثائق المرفوعة والتحقق
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, auth, FieldValue } = require('../lib/admin');

/**
 * submitKyc — المستخدم يرفع وثائق الهوية + صورة حية
 * L0 (أساسي): بريد مؤكد فقط — تلقائي عند إنشاء الحساب
 * L1 (فردي): + رقم بطاقة هوية + صورة حية (liveness)
 * L2 (شركة أساسي): سجل تجاري + بطاقة ضريبية + KYC ممثل قانوني
 * L3 (شركة موسّعة): L2 + مستندات إضافية (ترخيص تصدير، عقد تأسيس، إثبات نشاط)
 */
const submitKyc = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const {
    kycLevel, // 'L0', 'L1', 'L2', 'L3'
    idNumber, // رقم البطاقة (L1+)
    idImage, // صورة البطاقة (storage path)
    livenessImage, // صورة حية (storage path)
    companyName, // اسم الشركة (L2+)
    businessRegistration, // رقم السجل التجاري (L2+)
    taxId, // رقم الضريبة (L2+)
    representativeName, // اسم الممثل (L2+)
    exportLicense, // ترخيص التصدير (L3 اختياري)
    foundingDocs, // وثائق التأسيس (L3 اختياري)
    activityProof // إثبات النشاط (L3 اختياري)
  } = request.data || {};

  // التحقق من الحقول المطلوبة حسب المستوى
  if (kycLevel === 'L1') {
    if (!idNumber || !idImage || !livenessImage) {
      throw new HttpsError('invalid-argument', 'L1 يتطلب: رقم بطاقة + صورة بطاقة + صورة حية.');
    }
  } else if (kycLevel === 'L2') {
    if (!companyName || !businessRegistration || !taxId || !representativeName || !idImage || !livenessImage) {
      throw new HttpsError('invalid-argument', 'L2 يتطلب: بيانات الشركة + KYC الممثل.');
    }
  } else if (kycLevel === 'L3') {
    if (!companyName || !businessRegistration || !taxId || !representativeName || !idImage || !livenessImage) {
      throw new HttpsError('invalid-argument', 'L3 يتطلب: بيانات L2 + وثائق إضافية.');
    }
  }

  // إنشاء سجل KYC (وثائق الطلب)
  const kycRef = db.collection('kyc_submissions').doc();
  await kycRef.set({
    uid,
    kycLevel,
    status: 'pending', // pending, approved, rejected
    submittedAt: FieldValue.serverTimestamp(),
    documents: {
      idNumber: kycLevel === 'L1' ? idNumber : null,
      idImage,
      livenessImage,
      companyName: kycLevel >= 'L2' ? companyName : null,
      businessRegistration: kycLevel >= 'L2' ? businessRegistration : null,
      taxId: kycLevel >= 'L2' ? taxId : null,
      representativeName: kycLevel >= 'L2' ? representativeName : null,
      exportLicense: kycLevel === 'L3' ? exportLicense : null,
      foundingDocs: kycLevel === 'L3' ? foundingDocs : null,
      activityProof: kycLevel === 'L3' ? activityProof : null
    },
    adminNotes: '' // يملأه الأدمن عند المراجعة
  });

  // تحديث ملف المستخدم: إضافة kyc_level (مؤقتاً pending)
  // سيُعدَّل إلى 'approved' فقط بعد مراجعة الأدمن
  await db.collection('users').doc(uid).set(
    {
      kyc_level: kycLevel,
      kyc_status: 'pending',
      kyc_submission_id: kycRef.id,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    submissionId: kycRef.id,
    message: 'تم رفع طلبك. انتظر موافقة الأدمن.'
  };
});

/**
 * approveKyc — الأدمن يوافق على KYC (يرتقي المستخدم من pending → approved)
 */
const approveKyc = onCall({ region: REGION }, async (request) => {
  const caller = request.auth?.token;
  if (!caller || caller.role !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'فقط الأدمن يمكنه الموافقة على KYC.');
  }

  const { uid, kycLevel, adminNotes } = request.data || {};
  if (!uid || !kycLevel) {
    throw new HttpsError('invalid-argument', 'مطلوب: uid و kycLevel.');
  }

  // تحديث ملف المستخدم: kyc_status = 'approved'
  await db.collection('users').doc(uid).set(
    {
      kyc_level: kycLevel,
      kyc_status: 'approved',
      kyc_approved_at: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // تحديث سجل الطلب
  const submissions = await db.collection('kyc_submissions').where('uid', '==', uid).limit(1).get();
  if (!submissions.empty) {
    await submissions.docs[0].ref.set(
      {
        status: 'approved',
        adminNotes,
        approvedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  // إذا كان المستخدم يريد بيع (seller)، ترقِّه إلى seller role
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists && userDoc.data().role === 'buyer') {
    await auth.setCustomUserClaims(uid, {
      role: 'seller',
      tenantId: userDoc.data().tenantId
    });
    await db.collection('users').doc(uid).set(
      { role: 'seller' },
      { merge: true }
    );
  }

  return { ok: true, message: 'تمت الموافقة على KYC.' };
});

/**
 * rejectKyc — الأدمن يرفض KYC
 */
const rejectKyc = onCall({ region: REGION }, async (request) => {
  const caller = request.auth?.token;
  if (!caller || caller.role !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'فقط الأدمن يمكنه رفض KYC.');
  }

  const { uid, adminNotes } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'مطلوب: uid.');

  await db.collection('users').doc(uid).set(
    {
      kyc_status: 'rejected',
      kyc_rejected_at: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const submissions = await db.collection('kyc_submissions').where('uid', '==', uid).limit(1).get();
  if (!submissions.empty) {
    await submissions.docs[0].ref.set(
      {
        status: 'rejected',
        adminNotes,
        rejectedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  return { ok: true, message: 'تم رفض الطلب.' };
});

module.exports = { submitKyc, approveKyc, rejectKyc };
