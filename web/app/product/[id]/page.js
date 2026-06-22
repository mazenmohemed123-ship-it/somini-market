'use client';
// صفحة المنتج: تفاصيل + شراء فوري (Paymob iframe) + محادثة البائع.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../lib/firebase';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import Navbar from '../../../components/Navbar';
import Chat from '../../../components/Chat';

export default function ProductPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [iframeUrl, setIframeUrl] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
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
          </div>
        </div>

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
      </main>
    </>
  );
}
