'use client';
// الصفحة الرئيسية: عرض المنتجات النشطة + بحث وتصفية (فئة/حالة/سعر).
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useI18n } from '../lib/i18n';
import Navbar from '../components/Navbar';

export default function HomePage() {
  const { t } = useI18n();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');

  useEffect(() => {
    (async () => {
      const q = query(
        collection(db, 'products'),
        where('status', '==', 'active'),
        limit(60)
      );
      const snap = await getDocs(q);
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );

  const filtered = products.filter((p) => {
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (category && p.category !== category) return false;
    if (condition && p.condition !== condition) return false;
    return true;
  });

  return (
    <>
      <Navbar />
      <main className="container">
        <section className="hero">
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🌳 {t('appName')}</h1>
          <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>{t('tagline')}</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
            اشتري وبيّع بسهولة مع ضمان كامل | آمن 100% مع نظام الضمان الموثوق
          </p>
        </section>

        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: 'var(--radius)', textAlign: 'center', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--teal)' }}>2.5K+</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>منتج نشط</div>
          </div>
          <div style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: 'var(--radius)', textAlign: 'center', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--teal)' }}>500+</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>بائع موثوق</div>
          </div>
          <div style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: 'var(--radius)', textAlign: 'center', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--teal)' }}>100%</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>آمن مع Escrow</div>
          </div>
        </div>

        <div className="filters">
          <input
            className="filters__search"
            placeholder={t('home.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('home.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">{t('home.condition')}</option>
            <option value="new">{t('home.new')}</option>
            <option value="used">{t('home.used')}</option>
          </select>
        </div>

        {loading ? (
          <p>{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p>{t('home.noResults')}</p>
        ) : (
          <div className="grid">
            {filtered.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="card">
                <div className="card__img">
                  {p.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt={p.title} />
                  ) : (
                    <div className="card__placeholder">📦</div>
                  )}
                </div>
                <div className="card__body">
                  <h3>{p.title}</h3>
                  <p className="card__price">
                    {p.price} {p.currency || t('common.currency')}
                  </p>
                  <span className="card__badge">
                    {p.condition === 'new' ? t('home.new') : t('home.used')}
                  </span>
                  {p.ratingCount > 0 && (
                    <span className="card__rating">
                      {' '}★ {p.ratingAvg} ({p.ratingCount})
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* How to Start Section */}
        <section style={{ marginTop: '4rem', padding: '3rem', background: 'linear-gradient(135deg, var(--teal-soft) 0%, rgba(255,255,255,0) 100%)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--teal-dark)', fontSize: '1.8rem' }}>🚀 كيفية البدء</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>1️⃣</div>
              <h3 style={{ marginBottom: '0.5rem' }}>أنشئ حسابك</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>سجّل بسهولة عبر البريد أو Google</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>2️⃣</div>
              <h3 style={{ marginBottom: '0.5rem' }}>ابحث أو بيّع</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>استعرض آلاف المنتجات أو أضف منتجك</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>3️⃣</div>
              <h3 style={{ marginBottom: '0.5rem' }}>معاملة آمنة</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>الضمان يحمي كلا الطرفين</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ marginTop: '4rem', marginBottom: '3rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--teal-dark)', fontSize: '1.8rem' }}>❓ أسئلة شائعة</h2>
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { q: 'هل الموقع آمن؟', a: 'نعم! نستخدم نظام Escrow لحماية كلا الطرفين. المال محجوز حتى التسليم.' },
              { q: 'كيف أبدأ البيع؟', a: 'انقر على "ابدأ كبائع" وأضف منتجاتك. سنتحقق من حسابك ثم تكون جاهز!' },
              { q: 'ما طرق الدفع المتاحة؟', a: 'نقبل جميع بطاقات الائتمان عبر Paymob والتحويل البنكي.' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'var(--card)', padding: '1.2rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
                <h3 style={{ color: 'var(--teal)', marginBottom: '0.5rem' }}>{item.q}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
