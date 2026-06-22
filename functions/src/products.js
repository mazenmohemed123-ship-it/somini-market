// =============================================================
// إدارة المنتجات: إنشاء فردي + رفع بالجملة (CSV) عبر Storage trigger.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { parse } = require('csv-parse/sync');
const { REGION, DEFAULTS } = require('../lib/config');
const { admin, db, FieldValue } = require('../lib/admin');

/**
 * createProduct — إنشاء منتج فردي للبائع.
 */
const createProduct = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const token = request.auth?.token;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');
  if (!['seller', 'companyAdmin'].includes(token?.role)) {
    throw new HttpsError('permission-denied', 'يجب أن تكون بائعاً.');
  }

  const d = request.data || {};
  const title = (d.title || '').trim();
  const price = Number(d.price);
  if (title.length < 2 || !(price >= 0)) {
    throw new HttpsError('invalid-argument', 'العنوان أو السعر غير صالح.');
  }

  const ref = db.collection('products').doc();
  const product = {
    productId: ref.id,
    tenantId: token.tenantId,
    sellerId: uid,
    title,
    description: (d.description || '').slice(0, 5000),
    category: d.category || 'general',
    price,
    currency: d.currency || DEFAULTS.currency,
    condition: ['new', 'used'].includes(d.condition) ? d.condition : 'new',
    quantity: Math.max(0, parseInt(d.quantity, 10) || 1),
    images: Array.isArray(d.images) ? d.images.slice(0, 10) : [],
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await ref.set(product);
  return { productId: ref.id };
});

/**
 * processBulkUpload — Trigger عند رفع ملف CSV إلى bulkUploads/.
 * المسار: bulkUploads/{tenantId}/{sellerId}/{fileName}
 * ينشئ المنتجات دفعةً (batched writes) ويسجّل النتيجة في bulkUploadJobs.
 */
const processBulkUpload = onObjectFinalized(
  { region: REGION, memory: '512MiB', timeoutSeconds: 300 },
  async (event) => {
    const filePath = event.data.name || '';
    if (!filePath.startsWith('bulkUploads/')) return;

    const parts = filePath.split('/');
    if (parts.length < 4) return;
    const [, tenantId, sellerId] = parts;

    const jobRef = db.collection('bulkUploadJobs').doc();
    await jobRef.set({
      jobId: jobRef.id,
      tenantId,
      sellerId,
      fileUrl: filePath,
      status: 'processing',
      createdAt: FieldValue.serverTimestamp()
    });

    try {
      const bucket = admin.storage().bucket(event.data.bucket);
      const [buf] = await bucket.file(filePath).download();
      const rows = parse(buf.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      let created = 0;
      const errors = [];
      // كتابة على دفعات من 400 (حد المعاملة 500)
      for (let i = 0; i < rows.length; i += 400) {
        const batch = db.batch();
        const chunk = rows.slice(i, i + 400);
        chunk.forEach((row, idx) => {
          const price = Number(row.price);
          if (!row.title || !(price >= 0)) {
            errors.push({ row: i + idx + 2, reason: 'title/price غير صالح' });
            return;
          }
          const ref = db.collection('products').doc();
          batch.set(ref, {
            productId: ref.id,
            tenantId,
            sellerId,
            title: String(row.title).trim(),
            description: String(row.description || '').slice(0, 5000),
            category: row.category || 'general',
            price,
            currency: row.currency || DEFAULTS.currency,
            condition: ['new', 'used'].includes(row.condition) ? row.condition : 'new',
            quantity: Math.max(0, parseInt(row.quantity, 10) || 1),
            images: row.image_url ? [row.image_url] : [],
            status: 'active',
            source: 'bulk',
            createdAt: FieldValue.serverTimestamp()
          });
          created++;
        });
        await batch.commit();
      }

      await jobRef.update({
        status: 'completed',
        results: { total: rows.length, created, failed: errors.length, errors: errors.slice(0, 50) },
        completedAt: FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('processBulkUpload error:', err);
      await jobRef.update({ status: 'failed', error: err.message });
    }
  }
);

module.exports = { createProduct, processBulkUpload };
