// =============================================================
// نظام Tenants والعزل
// إنشاء tenant تلقائي عند تسجيل شركة + ضبط Custom Claims (الدور + tenantId)
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, auth, FieldValue } = require('../lib/admin');

const ROLES = ['superAdmin', 'companyAdmin', 'seller', 'buyer', 'supportAgent'];

/**
 * createTenant — يستدعيها المستخدم بعد تسجيل الدخول لإنشاء شركة/بائع كبير.
 * ينشئ مستند tenant، يضبط دور companyAdmin، ويربط tenantId في Custom Claims.
 */
const createTenant = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

  const companyName = (request.data?.companyName || '').trim();
  if (companyName.length < 2) {
    throw new HttpsError('invalid-argument', 'اسم الشركة غير صالح.');
  }
  const plan = request.data?.plan || 'free';

  // منع إنشاء أكثر من tenant لنفس المستخدم
  const existing = await db.collection('users').doc(uid).get();
  if (existing.exists && existing.data().tenantId && existing.data().role === 'companyAdmin') {
    throw new HttpsError('already-exists', 'لديك شركة مسجّلة بالفعل.');
  }

  const tenantRef = db.collection('tenants').doc();
  const tenantId = tenantRef.id;

  await tenantRef.set({
    tenantId,
    companyName,
    plan,
    ownerUid: uid,
    createdAt: FieldValue.serverTimestamp()
  });

  // ربط المستخدم بالـ tenant كـ companyAdmin
  await db.collection('users').doc(uid).set(
    {
      uid,
      tenantId,
      role: 'companyAdmin',
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // Custom Claims: تُقرأ في Security Rules (role + tenantId)
  await auth.setCustomUserClaims(uid, { role: 'companyAdmin', tenantId });

  return { tenantId, role: 'companyAdmin' };
});

/**
 * onUserCreate — عند إنشاء حساب جديد، نهيّئ ملف المستخدم كـ buyer
 * في tenant افتراضي (السوق العام) ما لم يسجّل كشركة لاحقاً.
 * (Auth blocking/trigger؛ هنا نستخدم beforeUserCreated من v2 identity)
 */
const { beforeUserCreated } = require('firebase-functions/v2/identity');

const onUserCreate = beforeUserCreated({ region: REGION }, async (event) => {
  const user = event.data;
  // tenant عام مشترك لكل الأفراد (مشترين/بائعين أفراد)
  return {
    customClaims: { role: 'buyer', tenantId: 'public' }
  };
});

/**
 * setUserRole — لـ superAdmin/companyAdmin لترقية مستخدم داخل tenant.
 */
const setUserRole = onCall({ region: REGION }, async (request) => {
  const caller = request.auth?.token;
  if (!caller) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const { targetUid, role } = request.data || {};
  if (!ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'دور غير معروف.');
  }
  // فقط superAdmin يمنح أدواراً عليا؛ companyAdmin يدير tenant الخاص به
  const isSuper = caller.role === 'superAdmin';
  const isCompanyAdmin = caller.role === 'companyAdmin';
  if (!isSuper && !isCompanyAdmin) {
    throw new HttpsError('permission-denied', 'صلاحيات غير كافية.');
  }
  if (!isSuper && role === 'superAdmin') {
    throw new HttpsError('permission-denied', 'لا يمكن منح superAdmin.');
  }

  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (!targetDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');

  // companyAdmin يقتصر على tenant الخاص به
  const tenantId = isSuper ? targetDoc.data().tenantId : caller.tenantId;
  if (!isSuper && targetDoc.data().tenantId !== caller.tenantId) {
    throw new HttpsError('permission-denied', 'المستخدم خارج شركتك.');
  }

  await auth.setCustomUserClaims(targetUid, { role, tenantId });
  await db.collection('users').doc(targetUid).set(
    { role, tenantId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { ok: true, role, tenantId };
});

module.exports = { createTenant, onUserCreate, setUserRole };
