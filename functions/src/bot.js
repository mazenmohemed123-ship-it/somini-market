// =============================================================
// البوت المساعد القواعدي (بدون LLM) — الميزة الفارقة
// يحلّل نية المستخدم بالاعتماد على كلمات مفتاحية + مكتبة natural،
// ويستجيب من Firestore مباشرةً (بحث منتجات، إحصائيات، إرشادات).
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION } = require('../lib/config');
const { db, FieldValue, Timestamp } = require('../lib/admin');
// المنطق قائم على تطبيع عربي مخصّص + مطابقة كلمات مفتاحية موزونة،
// وهو أدق للعربية من مجزّئات natural العامة ولا يحتاج أي مكتبة LLM.

// تطبيع النص العربي (إزالة التشكيل وتوحيد الألف/الياء/التاء المربوطة).
function normalizeAr(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // تشكيل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-يa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// قاموس النوايا: كل نية لها كلمات مفتاحية (تُطابَق بعد التطبيع).
const INTENTS = [
  {
    // البحث يتطلب كلمة فعل صريحة (لا الاسم العام "منتج" حتى لا يتعارض
    // مع نوايا مثل "كيف أرجع منتج؟").
    name: 'search_products',
    keywords: ['ابحث', 'بحث', 'دور', 'عايز', 'اريد', 'search', 'find'],
    needsQuery: true
  },
  {
    name: 'earnings_today',
    keywords: ['ربحت', 'مبيعات', 'كسبت', 'ارباح', 'بعت', 'اليوم', 'دخل', 'earnings', 'sales']
  },
  {
    name: 'pending_orders',
    keywords: ['طلبات', 'معلقه', 'معلقة', 'تشحن', 'شحن', 'pending', 'orders']
  },
  {
    name: 'how_to_return',
    keywords: ['ارجع', 'ارجاع', 'استرجاع', 'مرتجع', 'return', 'refund']
  },
  {
    name: 'how_escrow_works',
    keywords: ['ضمان', 'اسكرو', 'escrow', 'تحرير', 'محتجز', 'حسابي الضمان']
  },
  {
    name: 'open_dispute_help',
    keywords: ['نزاع', 'شكوي', 'شكوى', 'مشكله', 'مشكلة', 'dispute']
  },
  {
    name: 'greeting',
    keywords: ['مرحبا', 'اهلا', 'هاي', 'سلام', 'hello', 'hi', 'مساء', 'صباح']
  }
];

// استخراج النية بحساب نقاط التطابق بين الكلمات.
function detectIntent(rawText) {
  const norm = normalizeAr(rawText);
  const words = new Set(norm.split(' ').filter(Boolean));

  let best = { name: 'fallback', score: 0 };
  for (const intent of INTENTS) {
    let score = 0;
    for (const kw of intent.keywords) {
      const nkw = normalizeAr(kw);
      if (words.has(nkw) || norm.includes(nkw)) score++;
    }
    if (score > best.score) best = { name: intent.name, score };
  }
  return best.name;
}

// استخراج عبارة البحث بإزالة كلمات النية الشائعة.
function extractQuery(rawText) {
  const stop = ['ابحث', 'عن', 'بحث', 'دور', 'علي', 'على', 'عايز', 'اريد', 'منتج', 'منتجات', 'search', 'find', 'for', 'a', 'me'];
  const norm = normalizeAr(rawText);
  return norm
    .split(' ')
    .filter((w) => w && !stop.includes(w))
    .join(' ')
    .trim();
}

// --- منفّذو النوايا ---

async function handleSearchProducts(rawText) {
  const query = extractQuery(rawText);
  if (!query) {
    return { text: 'اكتب اسم المنتج الذي تبحث عنه، مثلاً: "ابحث عن موبايل".', data: null };
  }
  // بحث بسيط: مطابقة بادئة على عنوان مطبَّع. (للإنتاج: Algolia/Typesense)
  const snap = await db
    .collection('products')
    .where('status', '==', 'active')
    .limit(50)
    .get();

  const qWords = query.split(' ');
  const results = [];
  snap.forEach((d) => {
    const p = d.data();
    const title = normalizeAr(p.title);
    const matchCount = qWords.filter((w) => title.includes(w)).length;
    if (matchCount > 0) {
      results.push({ id: d.id, title: p.title, price: p.price, currency: p.currency, score: matchCount });
    }
  });
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 5);

  if (top.length === 0) {
    return { text: `لم أجد منتجات تطابق "${query}". جرّب كلمة أخرى.`, data: { products: [] } };
  }
  const lines = top.map((r) => `• ${r.title} — ${r.price} ${r.currency || 'EGP'}`).join('\n');
  return {
    text: `وجدت ${top.length} منتج لـ "${query}":\n${lines}`,
    data: { products: top }
  };
}

async function handleEarningsToday(uid) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const snap = await db
    .collection('orders')
    .where('sellerId', '==', uid)
    .where('createdAt', '>=', Timestamp.fromDate(startOfDay))
    .get();

  let total = 0;
  let count = 0;
  snap.forEach((d) => {
    const o = d.data();
    if (['paid', 'shipped', 'delivered', 'closed'].includes(o.status)) {
      total += o.totalAmount || 0;
      count++;
    }
  });
  return {
    text: `مبيعاتك اليوم: ${total.toFixed(2)} عبر ${count} طلب.`,
    data: { total, count }
  };
}

async function handlePendingOrders(uid) {
  const snap = await db
    .collection('orders')
    .where('sellerId', '==', uid)
    .where('status', 'in', ['paid', 'shipped'])
    .limit(20)
    .get();
  const count = snap.size;
  return {
    text:
      count === 0
        ? 'لا توجد طلبات معلّقة تحتاج إجراءً. أحسنت!'
        : `لديك ${count} طلب يحتاج شحناً أو متابعة. افتح لوحة التحكم لإدارتها.`,
    data: { count }
  };
}

const STATIC_ANSWERS = {
  how_to_return:
    'لإرجاع منتج: افتح "طلباتي" → اختر الطلب → اضغط "طلب إرجاع" خلال مدة الضمان واذكر السبب. سيُراجع البائع/الدعم الطلب.',
  how_escrow_works:
    'حساب الضمان (Escrow): يُحجز مبلغ الصفقة الكبيرة عندنا بحالة "محتجز" حتى تؤكّد الاستلام فتُحرَّر للبائع، أو يُحرَّر تلقائياً بعد 14 يوماً ما لم تفتح نزاعاً.',
  open_dispute_help:
    'لفتح نزاع: من صفحة الطلب اضغط "فتح نزاع" خلال مدة الحجز واذكر السبب. ستُجمّد الأموال حتى يحسم الدعم القضية.',
  greeting:
    'أهلاً بك في Somni Market 👋 أنا المساعد. اسألني: "ابحث عن [منتج]"، "كم ربحت اليوم؟"، "طلباتي المعلقة"، أو "كيف أرجع منتج؟".',
  fallback:
    'لم أفهم طلبك تماماً. جرّب: "ابحث عن [منتج]"، "كم ربحت اليوم؟"، "كيف أرجع منتج؟"، أو "كيف يعمل الضمان؟".'
};

/**
 * assistantBot — نقطة الدخول الوحيدة للبوت.
 */
const assistantBot = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const message = (request.data?.message || '').toString().slice(0, 500);
  if (!message.trim()) {
    throw new HttpsError('invalid-argument', 'الرسالة فارغة.');
  }

  const intent = detectIntent(message);
  let reply;

  switch (intent) {
    case 'search_products':
      reply = await handleSearchProducts(message);
      break;
    case 'earnings_today':
      reply = await handleEarningsToday(uid);
      break;
    case 'pending_orders':
      reply = await handlePendingOrders(uid);
      break;
    default:
      reply = { text: STATIC_ANSWERS[intent] || STATIC_ANSWERS.fallback, data: null };
  }

  // تسجيل جلسة البوت المؤقتة (TTL ينظّفها لاحقاً)
  await db.collection('botSessions').add({
    userId: uid,
    message,
    intent,
    reply: reply.text,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  });

  return { intent, ...reply };
});

module.exports = { assistantBot, detectIntent, normalizeAr };
