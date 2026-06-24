'use client';
// لوحة الأدمن (superAdmin): ثلاث أقسام جنباً إلى جنب
// الإحصائيات + طلبات KYC + النزاعات المفتوحة
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions, db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function AdminPage() {
  const { user, role, loading } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [kycSubmissions, setKycSubmissions] = useState([]);
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

      // Load pending KYC submissions
      const kycQ = query(
        collection(db, 'kyc_submissions'),
        where('status', '==', 'pending')
      );
      const kycSnap = await getDocs(kycQ);
      setKycSubmissions(kycSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
        <div className="page-head">
          <h1>🛡️ لوحة الأدمن</h1>
        </div>
        {err && <p className="error">{err}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', minHeight: '600px' }}>
          {/* القسم 1: الإحصائيات الأساسية */}
          <div className="panel">
            <h2 className="panel__title">📊 إحصائيات المنصة</h2>
            <div className="form-stack" style={{ gap: '0.75rem' }}>
              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--teal)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>المستخدمون</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats?.users || 0}</div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--teal)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>الشركات</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats?.tenants || 0}</div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--teal)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>المنتجات</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats?.products || 0}</div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--teal)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>الطلبات</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats?.orders || 0}</div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--warn)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>الضمانات المحتجزة</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>{stats?.heldEscrows || 0}</div>
              </div>

              <div style={{
                padding: '0.75rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--danger)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>النزاعات المفتوحة</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: stats?.openDisputes > 0 ? 'var(--danger)' : 'inherit' }}>
                  {stats?.openDisputes || 0}
                </div>
              </div>
            </div>
          </div>

          {/* القسم 2: طلبات التحقق (KYC) */}
          <div className="panel">
            <h2 className="panel__title">🔐 طلبات KYC المعلقة</h2>
            {kycSubmissions.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>لا توجد طلبات معلقة</p>
            ) : (
              <div className="form-stack" style={{ gap: '0.75rem' }}>
                {kycSubmissions.map(kyc => (
                  <div
                    key={kyc.id}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      borderLeft: '4px solid var(--warn)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      {kyc.kycLevel}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.25rem' }}>
                      المستخدم: {kyc.uid.slice(0, 12)}…
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      التاريخ: {new Date(kyc.createdAt?.toDate?.()).toLocaleDateString('ar')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Link href="/admin/kyc" className="link-btn" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              ➜ إدارة KYC كاملة
            </Link>
          </div>

          {/* القسم 3: النزاعات المفتوحة */}
          <div className="panel">
            <h2 className="panel__title">⚖️ النزاعات المفتوحة</h2>
            {disputes.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>لا توجد نزاعات. 🎉</p>
            ) : (
              <div className="form-stack" style={{ gap: '0.75rem' }}>
                {disputes.map((d) => (
                  <div
                    key={d.escrowId}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      borderLeft: '4px solid var(--danger)'
                    }}
                  >
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      {d.amount} EGP
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                      {d.disputeReason?.substring(0, 40) || 'بدون سبب'}…
                    </div>
                    <button
                      className="btn btn--small btn--primary"
                      disabled={busyId === d.escrowId}
                      onClick={() => resolve(d.escrowId, 'release')}
                      style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      تحرير
                    </button>
                    <button
                      className="btn btn--small"
                      disabled={busyId === d.escrowId}
                      onClick={() => resolve(d.escrowId, 'refund')}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      استرجاع
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Link href="/admin/disputes" className="link-btn" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              ➜ جميع النزاعات
            </Link>
          </div>
        </div>

        {/* الصفقات */}
        <div className="panel" style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="panel__title">💼 إدارة الصفقات</h2>
            <Link href="/admin/deals" className="link-btn" style={{ margin: 0 }}>
              ➜ عرض الصفقات
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
