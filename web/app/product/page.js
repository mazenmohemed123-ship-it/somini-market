'use client';
// صفحة المنتج: تفاصيل + شراء فوري (Paymob iframe) + محادثة البائع.
// تستقبل معرّف المنتج عبر ?id= لتعمل مع التصدير الثابت (Static Export).
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import Navbar from '../../components/Navbar';
import Chat from '../../components/Chat';
import Reviews from '../../components/Reviews';

function ProductView() {
  const params = useSearchParams();
  const id = params.get('id');
  const { t } = useI18n();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [iframeUrl, setIframeUrl] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [paying, setPaying] = useState(false);
  // صفقة تجارية (تفاوض)
  const [showDeal, setShowDeal] = useState(false);
  const [dealPrice, setDealPrice] = useState('');
  const [dealIncoterm, setDealIncoterm] = useState('');
  const [dealNote, setDealNote] = useState('');
  const [dealBusy, setDealBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, 'products', id));
      if (snap.exists()) setProduct({ id: snap.id, ...snap.data() });
    })();
  }, [id]);

  const buyNow = async () => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setPaying(true);
    try {
      const res = await httpsCallable(functions, 'createPaymentIntent')({
        productId: id,
        quantity: qty
      });
      setIframeUrl(res.data.iframeUrl);
    } catch (e) {
      alert(e.message || t('common.error'));
    } finally {
      setPaying(false);
    }
  };

  const startDeal = async () => {
    if (!user) { window.location.href = '/login'; return; }
    const price = parseFloat(dealPrice);
    if (!price || price <= 0) { alert('أدخل سعراً مقترحاً صحيحاً.'); return; }
    setDealBusy(true);
    try {
      const res = await httpsCallable(functions, 'initiateDeal')({
        sellerId: product.sellerId,
        productId: id,
        quantity: qty,
        proposedPrice: price,
        description: dealNote,
        incoterm: dealIncoterm
      });
      alert('✅ تم إرسال عرض الصفقة للبائع. تابعها من صفحة "صفقاتي".');
      setShowDeal(false);
      if (res?.data?.dealId) window.location.href = '/buyer/deals';
    } catch (e) {
      alert(e.message || t('common.error'));
    } finally {
      setDealBusy(false);
    }
  };

  if (!product) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);

  const isEscrow = product.price * qty >= 5000;

  return (
    <>
      <Navbar />
      <main className="container product-page">
        <div className="product-page__media">
          {product.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0]} alt={product.title} />
          ) : (
            <div className="card__placeholder card__placeholder--lg">📦</div>
          )}
        </div>

        <div className="product-page__info">
          <h1>{product.title}</h1>
          <p className="product-page__price">
            {product.price} {product.currency || t('common.currency')}
          </p>
          <p>{product.description}</p>
          <p className="muted">
            {t('product.available')}: {product.quantity}
          </p>

          {isEscrow && (
            <div className="escrow-note">
              🛡️ <strong>{t('product.escrowProtected')}</strong> — {t('product.escrowNote')}
            </div>
          )}

          <div className="product-page__buy">
            <label>
              {t('product.quantity')}:
              <input
                type="number"
                min={1}
                max={product.quantity}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </label>
            <button className="btn btn--primary" onClick={buyNow} disabled={paying}>
              {paying ? t('common.loading') : t('product.buyNow')}
            </button>
            <button className="btn btn--ghost" onClick={() => setShowChat((s) => !s)}>
              💬 {t('product.chatSeller')}
            </button>
            <button className="btn btn--ghost" onClick={() => setShowDeal(true)}>
              💼 بدء صفقة تجارية (تفاوض)
            </button>
          </div>
        </div>

        {showDeal && (
          <div className="paymob-modal" onClick={() => setShowDeal(false)}>
            <div className="paymob-modal__inner" onClick={(e) => e.stopPropagation()} style={{ padding: '1.5rem', maxWidth: '460px' }}>
              <h2 style={{ marginTop: 0 }}>💼 صفقة تجارية</h2>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                تتطلب التحقق من الهوية (KYC) للطرفين. تفاوض على السعر والكمية ثم مراحل دفع موثّقة بالأدلة.
              </p>
              <div className="form-stack" style={{ gap: '0.75rem' }}>
                <label>الكمية:
                  <input type="number" min={1} max={product.quantity} value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
                </label>
                <label>السعر المقترح للوحدة (EGP):
                  <input type="number" min={1} value={dealPrice}
                    onChange={(e) => setDealPrice(e.target.value)} placeholder="مثال: 1200" />
                </label>
                <label>شرط التسليم (Incoterm):
                  <select value={dealIncoterm} onChange={(e) => setDealIncoterm(e.target.value)}>
                    <option value="">— غير محدد (بيع محلي) —</option>
                    <option value="EXW">EXW — تسليم المصنع</option>
                    <option value="FOB">FOB — تسليم ظهر السفينة</option>
                    <option value="CFR">CFR — التكلفة والشحن</option>
                    <option value="CIF">CIF — التكلفة والتأمين والشحن</option>
                    <option value="DAP">DAP — التسليم في المكان</option>
                    <option value="DDP">DDP — التسليم خالص الرسوم</option>
                  </select>
                </label>
                <label>ملاحظات (اختياري):
                  <textarea value={dealNote} onChange={(e) => setDealNote(e.target.value)} rows={2}
                    placeholder="شروط إضافية، تفاصيل الشحن…" />
                </label>
                <button className="btn btn--primary" onClick={startDeal} disabled={dealBusy}>
                  {dealBusy ? t('common.loading') : '📤 إرسال العرض للبائع'}
                </button>
              </div>
            </div>
          </div>
        )}

        {iframeUrl && (
          <div className="paymob-modal" onClick={() => setIframeUrl(null)}>
            <div className="paymob-modal__inner" onClick={(e) => e.stopPropagation()}>
              <iframe title="Paymob" src={iframeUrl} width="100%" height="600" />
            </div>
          </div>
        )}

        {showChat && user && (
          <div className="product-page__chat">
            <Chat
              peerId={product.sellerId}
              peerName={t('product.chatSeller')}
              context={{ type: 'product', id }}
            />
          </div>
        )}

        <div className="product-page__full">
          <Reviews
            productId={id}
            ratingAvg={product.ratingAvg}
            ratingCount={product.ratingCount}
          />
        </div>
      </main>
    </>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={<><Navbar /><main className="container">...</main></>}>
      <ProductView />
    </Suspense>
  );
}
