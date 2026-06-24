'use client';
// صفحة بدء البيع: تسجيل شركة (createTenant) أو إضافة أول منتج فردي.
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { functions, auth } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import Navbar from '../../../components/Navbar';

export default function SellerStartPage() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [product, setProduct] = useState({ title: '', price: '', description: '', condition: 'new', quantity: 1 });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSeller = role === 'seller' || role === 'companyAdmin';

  const registerCompany = async () => {
    if (companyName.trim().length < 2) return;
    setBusy(true); setMsg(null);
    try {
      await httpsCallable(functions, 'createTenant')({ companyName, plan: 'free' });
      await auth.currentUser.getIdToken(true); // تحديث Custom Claims
      setMsg('✅ تم إنشاء الشركة. أعد تحميل الصفحة لتفعيل صلاحيات البائع.');
    } catch (e) {
      setMsg('⚠️ ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const addProduct = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await httpsCallable(functions, 'createProduct')({
        ...product,
        price: Number(product.price)
      });
      router.push(`/product/${res.data.productId}`);
    } catch (e) {
      setMsg('⚠️ ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return (<><Navbar /><main className="container"><div className="panel"><p>سجّل الدخول أولاً.</p></div></main></>);

  return (
    <>
      <Navbar />
      <main className="container" style={{ maxWidth: '560px' }}>
        <div className="page-head">
          <h1>🏪 {t('nav.sell')}</h1>
        </div>

        {!isSeller && (
          <section className="panel">
            <h2 className="panel__title">تسجيل شركة (Tenant مستقل)</h2>
            <p className="panel__sub">أنشئ متجرك المستقل وابدأ البيع باسمك التجاري.</p>
            <div className="form-stack">
              <div>
                <label>اسم الشركة</label>
                <input
                  placeholder="مثال: متجر الأمل"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <button className="btn btn--primary btn--block" onClick={registerCompany} disabled={busy}>
                {busy ? 'جاري...' : 'إنشاء شركة'}
              </button>
              <p className="panel__sub" style={{ margin: 0 }}>
                أو أضف منتجاً كبائع فرد (بعد ترقية حسابك إلى seller).
              </p>
            </div>
          </section>
        )}

        {isSeller && (
          <section className="panel">
            <h2 className="panel__title">إضافة منتج</h2>
            <p className="panel__sub">املأ تفاصيل منتجك ليظهر في السوق.</p>
            <div className="form-stack">
              <div>
                <label>العنوان</label>
                <input placeholder="العنوان" value={product.title}
                  onChange={(e) => setProduct({ ...product, title: e.target.value })} />
              </div>
              <div>
                <label>السعر</label>
                <input type="number" placeholder="0.00" value={product.price}
                  onChange={(e) => setProduct({ ...product, price: e.target.value })} />
              </div>
              <div>
                <label>الوصف</label>
                <textarea placeholder="اكتب وصفاً واضحاً للمنتج..." value={product.description}
                  onChange={(e) => setProduct({ ...product, description: e.target.value })} />
              </div>
              <div>
                <label>الحالة</label>
                <select value={product.condition}
                  onChange={(e) => setProduct({ ...product, condition: e.target.value })}>
                  <option value="new">{t('home.new')}</option>
                  <option value="used">{t('home.used')}</option>
                </select>
              </div>
              <div>
                <label>الكمية</label>
                <input type="number" placeholder="1" value={product.quantity}
                  onChange={(e) => setProduct({ ...product, quantity: parseInt(e.target.value) || 1 })} />
              </div>
              <button className="btn btn--primary btn--block" onClick={addProduct} disabled={busy}>
                {busy ? 'جاري...' : t('common.save')}
              </button>
            </div>
          </section>
        )}

        {msg && <p className="toast-msg">{msg}</p>}
      </main>
    </>
  );
}
