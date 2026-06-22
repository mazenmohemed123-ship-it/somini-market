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
          <h1>{t('appName')}</h1>
          <p>{t('tagline')}</p>
        </section>

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
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
