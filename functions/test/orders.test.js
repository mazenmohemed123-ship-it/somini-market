// اختبارات وحدة لانتقالات حالة الطلب (دالة نقيّة).
const { isTransitionAllowed } = require('../src/orders');

describe('isTransitionAllowed — انتقالات حالة الطلب', () => {
  test('البائع يشحن الطلب المدفوع', () => {
    expect(isTransitionAllowed('seller', 'paid', 'shipped')).toBe(true);
  });

  test('البائع يسلّم الطلب المشحون', () => {
    expect(isTransitionAllowed('seller', 'shipped', 'delivered')).toBe(true);
  });

  test('المشتري يؤكّد الاستلام بعد الشحن', () => {
    expect(isTransitionAllowed('buyer', 'shipped', 'delivered')).toBe(true);
  });

  test('المشتري لا يشحن الطلب', () => {
    expect(isTransitionAllowed('buyer', 'paid', 'shipped')).toBe(false);
  });

  test('لا قفز من paid إلى delivered', () => {
    expect(isTransitionAllowed('seller', 'paid', 'delivered')).toBe(false);
  });

  test('لا انتقال من حالة نهائية', () => {
    expect(isTransitionAllowed('seller', 'closed', 'shipped')).toBe(false);
    expect(isTransitionAllowed('seller', 'disputed', 'delivered')).toBe(false);
  });

  test('دور غير معروف يُرفض', () => {
    expect(isTransitionAllowed('hacker', 'paid', 'shipped')).toBe(false);
  });
});
