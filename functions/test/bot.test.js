// اختبارات وحدة لمنطق البوت القواعدي (دوال نقيّة — لا تحتاج emulator).
const { detectIntent, normalizeAr } = require('../src/bot');

describe('normalizeAr — تطبيع النص العربي', () => {
  test('يوحّد أشكال الألف والياء والتاء المربوطة', () => {
    expect(normalizeAr('أحمد')).toBe('احمد');
    expect(normalizeAr('إيميل')).toBe('ايميل');
    expect(normalizeAr('مدرسة')).toBe('مدرسه');
    expect(normalizeAr('علىّ')).toBe('علي');
  });

  test('يزيل التشكيل والرموز', () => {
    expect(normalizeAr('مَرْحَبًا!')).toBe('مرحبا');
  });
});

describe('detectIntent — كشف نيّة المستخدم', () => {
  test('بحث عن منتج', () => {
    expect(detectIntent('ابحث عن موبايل')).toBe('search_products');
    expect(detectIntent('عايز منتج لابتوب')).toBe('search_products');
  });

  test('أرباح اليوم', () => {
    expect(detectIntent('كم ربحت اليوم؟')).toBe('earnings_today');
    expect(detectIntent('مبيعاتي اليوم')).toBe('earnings_today');
  });

  test('طلبات معلقة', () => {
    expect(detectIntent('عايز اعرف الطلبات المعلقة')).toBe('pending_orders');
  });

  test('كيفية الإرجاع', () => {
    expect(detectIntent('كيف ارجع منتج؟')).toBe('how_to_return');
  });

  test('شرح الضمان', () => {
    expect(detectIntent('كيف يعمل حساب الضمان')).toBe('how_escrow_works');
  });

  test('تحية', () => {
    expect(detectIntent('مرحبا')).toBe('greeting');
    expect(detectIntent('hello')).toBe('greeting');
  });

  test('نص غير مفهوم → fallback', () => {
    expect(detectIntent('xyz qwerty 123')).toBe('fallback');
  });
});
