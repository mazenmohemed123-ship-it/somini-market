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

  if (!user) return (<><Navbar /><main className="container"><p>سجّل الدخول أولاً.</p></main></>);

  return (
    <>
      <Navbar />
      <main className="container auth">
        <h1>{t('nav.sell')}</h1>

        {!isSeller && (
          <section className="auth__form">
            <h2>تسجيل شركة (Tenant مستقل)</h2>
            <input
              placeholder="اسم الشركة"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <button className="btn btn--primary" onClick={registerCompany} disabled={busy}>
              إنشاء شركة
            </button>
            <p className="muted">أو أضف منتجاً كبائع فرد (بعد ترقية حسابك إلى seller).</p>
          </section>
        )}

        {isSeller && (
          <section className="auth__form">
            <h2>إضافة منتج</h2>
            <input placeholder="العنوان" value={product.title}
              onChange={(e) => setProduct({ ...product, title: e.target.value })} />
            <input type="number" placeholder="السعر" value={product.price}
              onChange={(e) => setProduct({ ...product, price: e.target.value })} />
            <textarea placeholder="الوصف" value={product.description}
              onChange={(e) => setProduct({ ...product, description: e.target.value })} />
            <select value={product.condition}
              onChange={(e) => setProduct({ ...product, condition: e.target.value })}>
              <option value="new">{t('home.new')}</option>
              <option value="used">{t('home.used')}</option>
            </select>
            <input type="number" placeholder="الكمية" value={product.quantity}
              onChange={(e) => setProduct({ ...product, quantity: parseInt(e.target.value) || 1 })} />
            <button className="btn btn--primary" onClick={addProduct} disabled={busy}>
              {t('common.save')}
            </button>
          </section>
        )}

        {msg && <p>{msg}</p>}
      </main>
    </>
  );
}
