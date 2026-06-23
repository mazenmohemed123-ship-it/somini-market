'use client';
// تقييمات المنتج: عرض المتوسط + قائمة التقييمات + نموذج إضافة تقييم.
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

function Stars({ value }) {
  const full = Math.round(value || 0);
  return <span className="stars">{'★'.repeat(full)}{'☆'.repeat(5 - full)}</span>;
}

export default function Reviews({ productId, ratingAvg, ratingCount }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const snap = await getDocs(query(collection(db, 'reviews'), where('productId', '==', productId)));
    setReviews(snap.docs.map((d) => d.data()));
  };
  useEffect(() => { load(); }, [productId]);

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      await httpsCallable(functions, 'addReview')({ productId, rating, comment });
      setMsg('✅ شكراً لتقييمك');
      setComment('');
      await load();
    } catch (e) {
      setMsg('⚠️ ' + (e.message || t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reviews">
      <h2>التقييمات <Stars value={ratingAvg} /> <small className="muted">({ratingCount || 0})</small></h2>

      {user && (
        <div className="reviews__form">
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
          </select>
          <input
            placeholder="اكتب رأيك في المنتج..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn btn--primary" onClick={submit} disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}

      <ul className="reviews__list">
        {reviews.length === 0 && <li className="muted">لا توجد تقييمات بعد.</li>}
        {reviews.map((r, i) => (
          <li key={i}>
            <Stars value={r.rating} />
            {r.comment && <span> — {r.comment}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
