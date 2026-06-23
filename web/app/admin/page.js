'use client';
// لوحة الأدمن (superAdmin): إحصائيات المنصة + إدارة النزاعات (تحرير/استرجاع).
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';

export default function AdminPage() {
  const { user, role, loading } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const isAdmin = role === 'superAdmin';

  const load = async () => {
    try {
      const [s, d] = await Promise.all([
        httpsCallable(functions, 'adminStats')(),
        httpsCallable(functions, 'adminListDisputes')()
      ]);
      setStats(s.data);
      setDisputes(d.data.disputes || []);
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (loading || !user || !isAdmin) return;
    load();
  }, [user, loading, isAdmin]);

  const resolve = async (escrowId, resolution) => {
    const label = resolution === 'release' ? 'تحرير للبائع' : 'استرجاع للمشتري';
    if (!confirm(`تأكيد: ${label}؟`)) return;
    setBusyId(escrowId);
    try {
      await httpsCallable(functions, 'resolveDispute')({ escrowId, resolution });
      setDisputes((prev) => prev.filter((d) => d.escrowId !== escrowId));
      await load();
    } catch (e) {
      alert(e.message || t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user || !isAdmin) {
    return (
      <>
        <Navbar />
        <main className="container">
          <p>⛔ هذه الصفحة مخصّصة لـ superAdmin فقط.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="container">
        <h1>🛡️ لوحة الأدمن</h1>
        {err && <p className="error">{err}</p>}

        <div className="stats-grid">
          <Stat label="المستخدمون" value={stats?.users} />
          <Stat label="الشركات (Tenants)" value={stats?.tenants} />
          <Stat label="المنتجات" value={stats?.products} />
          <Stat label="الطلبات" value={stats?.orders} />
          <Stat label="ضمانات محتجزة" value={stats?.heldEscrows} />
          <Stat label="نزاعات مفتوحة" value={stats?.openDisputes} danger={stats?.openDisputes > 0} />
        </div>

        <section>
          <h2>⚖️ النزاعات المفتوحة</h2>
          {disputes.length === 0 ? (
            <p className="muted">لا توجد نزاعات مفتوحة. 🎉</p>
          ) : (
            <div className="disputes">
              {disputes.map((d) => (
                <div key={d.escrowId} className="dispute-card">
                  <div className="dispute-card__head">
                    <strong>{d.amount} {d.currency}</strong>
                    <span className="muted">طلب: {d.orderId.slice(0, 8)}…</span>
                  </div>
                  <p className="dispute-card__reason">📝 {d.disputeReason || '—'}</p>
                  <p className="muted">
                    المشتري: {d.buyerId.slice(0, 8)}… · البائع: {d.sellerId.slice(0, 8)}…
                  </p>
                  <div className="dispute-card__actions">
                    <button
                      className="btn btn--primary"
                      disabled={busyId === d.escrowId}
                      onClick={() => resolve(d.escrowId, 'release')}
                    >
                      تحرير للبائع
                    </button>
                    <button
                      className="btn btn--ghost"
                      disabled={busyId === d.escrowId}
                      onClick={() => resolve(d.escrowId, 'refund')}
                    >
                      استرجاع للمشتري
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className={`stat-card ${danger ? 'stat-card--danger stat-card--highlight' : ''}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value ?? '—'}</strong>
    </div>
  );
}
