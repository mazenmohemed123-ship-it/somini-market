// اختبارات قواعد أمان Firestore ضد الـ emulator.
// تتحقق من: عزل tenant، الأدوار، أن المستندات المالية للقراءة فقط.
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const { setDoc, doc, getDoc, updateDoc } = require('firebase/firestore');

let testEnv;

// مستخدمون بأدوار/tenants مختلفة عبر Custom Claims
function ctx(uid, claims) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'somni-market-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // بيانات أولية بصلاحيات الأدمن (تتجاوز القواعد)
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'products/p1'), {
      productId: 'p1', tenantId: 'tenantA', sellerId: 'sellerA',
      title: 'منتج', price: 100, condition: 'new', status: 'active', quantity: 5
    });
    await setDoc(doc(db, 'products/p_hidden'), {
      productId: 'p_hidden', tenantId: 'tenantA', sellerId: 'sellerA',
      title: 'مخفي', price: 100, condition: 'new', status: 'pending', quantity: 5
    });
    await setDoc(doc(db, 'orders/o1'), {
      orderId: 'o1', buyerId: 'buyerX', sellerId: 'sellerA',
      tenantId: 'tenantA', totalAmount: 100, status: 'paid'
    });
    await setDoc(doc(db, 'escrowTransactions/e1'), {
      escrowId: 'e1', orderId: 'o1', buyerId: 'buyerX', sellerId: 'sellerA',
      tenantId: 'tenantA', amount: 100, status: 'held'
    });
  });
});

describe('products', () => {
  test('أي زائر يقرأ المنتجات النشطة', async () => {
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guest, 'products/p1')));
  });

  test('المنتج غير النشط لا يُقرأ من خارج الـ tenant', async () => {
    const outsider = ctx('u2', { role: 'buyer', tenantId: 'public' });
    await assertFails(getDoc(doc(outsider, 'products/p_hidden')));
  });

  test('عضو نفس الـ tenant يقرأ المنتج غير النشط', async () => {
    const member = ctx('sellerA', { role: 'seller', tenantId: 'tenantA' });
    await assertSucceeds(getDoc(doc(member, 'products/p_hidden')));
  });

  test('بائع ينشئ منتجاً في tenant الخاص به فقط', async () => {
    const seller = ctx('sellerA', { role: 'seller', tenantId: 'tenantA' });
    await assertSucceeds(
      setDoc(doc(seller, 'products/new1'), {
        productId: 'new1', tenantId: 'tenantA', sellerId: 'sellerA',
        title: 'جديد', price: 50, condition: 'new', status: 'active', quantity: 1
      })
    );
  });

  test('بائع لا ينشئ منتجاً في tenant آخر (عزل)', async () => {
    const seller = ctx('sellerA', { role: 'seller', tenantId: 'tenantA' });
    await assertFails(
      setDoc(doc(seller, 'products/bad1'), {
        productId: 'bad1', tenantId: 'tenantB', sellerId: 'sellerA',
        title: 'تسريب', price: 50, condition: 'new', status: 'active', quantity: 1
      })
    );
  });

  test('مشترٍ لا يستطيع إنشاء منتج', async () => {
    const buyer = ctx('buyerX', { role: 'buyer', tenantId: 'public' });
    await assertFails(
      setDoc(doc(buyer, 'products/x'), {
        productId: 'x', tenantId: 'public', sellerId: 'buyerX',
        title: 'x', price: 1, condition: 'new', status: 'active', quantity: 1
      })
    );
  });
});

describe('orders — للقراءة فقط من العميل', () => {
  test('المشتري يقرأ طلبه', async () => {
    const buyer = ctx('buyerX', { role: 'buyer', tenantId: 'public' });
    await assertSucceeds(getDoc(doc(buyer, 'orders/o1')));
  });

  test('طرف خارجي لا يقرأ الطلب', async () => {
    const other = ctx('intruder', { role: 'buyer', tenantId: 'public' });
    await assertFails(getDoc(doc(other, 'orders/o1')));
  });

  test('لا أحد يكتب على الطلب مباشرة (Admin SDK فقط)', async () => {
    const buyer = ctx('buyerX', { role: 'buyer', tenantId: 'public' });
    await assertFails(updateDoc(doc(buyer, 'orders/o1'), { status: 'closed' }));
  });
});

describe('escrowTransactions — حساسة', () => {
  test('البائع يقرأ مستند الضمان الخاص به', async () => {
    const seller = ctx('sellerA', { role: 'seller', tenantId: 'tenantA' });
    await assertSucceeds(getDoc(doc(seller, 'escrowTransactions/e1')));
  });

  test('طرف خارجي لا يقرأ الضمان', async () => {
    const other = ctx('intruder', { role: 'buyer', tenantId: 'public' });
    await assertFails(getDoc(doc(other, 'escrowTransactions/e1')));
  });

  test('المشتري لا يحرّر الأموال بالكتابة المباشرة', async () => {
    const buyer = ctx('buyerX', { role: 'buyer', tenantId: 'public' });
    await assertFails(updateDoc(doc(buyer, 'escrowTransactions/e1'), { status: 'released' }));
  });

  test('superAdmin يقرأ أي مستند ضمان (للوحة النزاعات)', async () => {
    const admin = ctx('rootAdmin', { role: 'superAdmin', tenantId: '*' });
    await assertSucceeds(getDoc(doc(admin, 'escrowTransactions/e1')));
  });

  test('superAdmin لا يكتب مباشرة على الضمان (عبر الدوال فقط)', async () => {
    const admin = ctx('rootAdmin', { role: 'superAdmin', tenantId: '*' });
    await assertFails(updateDoc(doc(admin, 'escrowTransactions/e1'), { status: 'released' }));
  });
});
