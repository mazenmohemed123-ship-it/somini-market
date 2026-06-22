// إعدادات عامة + قراءة الأسرار من Secret Manager (مع تخزين مؤقت).
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'somni-market';

const REGION = 'europe-west1';

// ثوابت منطق العمل
const DEFAULTS = {
  // عتبة اعتبار الصفقة "كبيرة" → تذهب لحساب الضمان (Escrow)
  escrowThreshold: 5000, // بالعملة الأساسية (مثلاً جنيه/ريال)
  // مدة التحرير التلقائي (أيام) إن لم يُفتح نزاع
  autoReleaseDays: 14,
  // نسبة عمولة المنصة الافتراضية (يمكن تجاوزها عبر Remote Config)
  commissionRate: 0.05,
  currency: 'EGP'
};

const _secretCache = new Map();
let _smClient = null;

function smClient() {
  if (!_smClient) _smClient = new SecretManagerServiceClient();
  return _smClient;
}

/**
 * قراءة قيمة سر من Secret Manager مع تخزين مؤقت داخل نفس النسخة.
 * في التطوير: يقع رجوعاً إلى متغيّر بيئة بنفس الاسم.
 */
async function getSecret(name) {
  if (_secretCache.has(name)) return _secretCache.get(name);

  // رجوع للتطوير المحلي
  if (process.env[name]) {
    _secretCache.set(name, process.env[name]);
    return process.env[name];
  }

  try {
    const [version] = await smClient().accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`
    });
    const payload = version.payload.data.toString('utf8');
    _secretCache.set(name, payload);
    return payload;
  } catch (err) {
    console.error(`getSecret(${name}) failed:`, err.message);
    throw new Error(`Secret ${name} not available`);
  }
}

module.exports = { PROJECT_ID, REGION, DEFAULTS, getSecret };
