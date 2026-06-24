'use client';
// صفحة مراجعة طلبات التحقق (KYC/KYB) للأدمن — المستويات L0→L3
// عرض المستندات + الموافقة/الرفض مع تسجيل في audit_log
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions, db } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import Navbar from '../../../components/Navbar';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const LEVEL_LABELS = {
  L0: 'L0 — أساسي (مشتري)',
  L1: 'L1 — بائع فرد',
  L2: 'L2 — شركة أساسي',
  L3: 'L3 — شركة موسّعة (تصدير)'
};

const DOC_LABELS = {
  idNumber: 'رقم البطاقة',
  idImage: 'صورة البطاقة',
  livenessImage: 'صورة حية (Liveness)',
  companyName: 'اسم الشركة',
  businessRegistration: 'السجل التجاري',
  taxId: 'البطاقة الضريبية',
  representativeName: 'اسم الممثل القانوني',
  exportLicense: 'رخصة التصدير',
  foundingDocs: 'عقد التأسيس',
  activityProof: 'إثبات النشاط'
};

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);

export default function AdminKycPage() {
  const { user, role, loading } = useAuth();
  const { t } = useI18n();
  const [subs, setSubs] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState(null);

  const isAdmin = role === 'superAdmin';

  const load = async () => {
    try {
      const q = filter === 'all'
        ? query(collection(db, 'kyc_submissions'))
        : query(collection(db, 'kyc_submissions'), where('status', '==', filter));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // الأحدث أولاً
      rows.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setSubs(rows);
    } catch (e) {
      setMsg('❌ ' + e.message);
    }
  };

  useEffect(() => {
    if (loading || !user || !isAdmin) return;
    load();
  }, [user, loading, isAdmin, filter]);

  const approve = async (sub) => {
    setBusyId(sub.id);
    try {
      await httpsCallable(functions, 'approveKyc')({
        uid: sub.uid,
        kycLevel: sub.kycLevel,
        adminNotes: notes[sub.id] || ''
      });
      setMsg('✅ تمت الموافقة — تم ترقية المستخدم وتفعيل لوحته تلقائياً');
      await load();
    } catch (e) {
      setMsg('❌ ' + (e.message || 'خطأ'));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (sub) => {
    if (!notes[sub.id]) {
      setMsg('❌ اكتب سبب الرفض في الملاحظات أولاً.');
      return;
    }
    setBusyId(sub.id);
    try {
      await httpsCallable(functions, 'rejectKyc')({
        uid: sub.uid,
        adminNotes: notes[sub.id]
      });
      setMsg('✅ تم رفض الطلب');
      await load();
    } catch (e) {
      setMsg('❌ ' + (e.message || 'خطأ'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user || !isAdmin) {
    return (<><Navbar /><main className="container"><p>⛔ مخصّصة لـ superAdmin فقط.</p></main></>);
  }

  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>🔐 مراجعة التحقق (KYC/KYB)</h1>
          <Link href="/admin" className="link-btn" style={{ margin: 0 }}>➜ لوحة الأدمن</Link>
        </div>

        {msg && <p className="toast-msg">{msg}</p>}

        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button key={f}
                className={`btn btn--small ${filter === f ? 'btn--primary' : ''}`}
                onClick={() => setFilter(f)}>
                {f === 'pending' ? '⏳ معلّقة' : f === 'approved' ? '✅ مقبولة' : f === 'rejected' ? '❌ مرفوضة' : 'الكل'}
              </button>
            ))}
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="panel"><p style={{ color: 'var(--text-light)' }}>لا توجد طلبات.</p></div>
        ) : (
          <div className="form-stack" style={{ gap: '1.5rem' }}>
            {subs.map(sub => (
              <div key={sub.id} className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className="panel__title" style={{ margin: 0 }}>{LEVEL_LABELS[sub.kycLevel] || sub.kycLevel}</h2>
                  <span style={{
                    fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: '999px',
                    background: sub.status === 'pending' ? 'var(--warn)' : sub.status === 'approved' ? 'var(--teal)' : 'var(--danger)',
                    color: '#fff'
                  }}>{sub.status}</span>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                  المستخدم: {sub.uid} · التاريخ: {sub.submittedAt?.toDate ? new Date(sub.submittedAt.toDate()).toLocaleString('ar') : '—'}
                </div>

                {/* المستندات */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  {sub.documents && Object.entries(sub.documents)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} style={{ padding: '0.6rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{DOC_LABELS[k] || k}</div>
                        {isUrl(v) ? (
                          <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontSize: '0.85rem', fontWeight: 600 }}>
                            📎 فتح المستند
                          </a>
                        ) : (
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, wordBreak: 'break-all' }}>{String(v)}</div>
                        )}
                      </div>
                    ))}
                </div>

                {sub.status === 'pending' && (
                  <>
                    <textarea
                      placeholder="ملاحظات الأدمن (مطلوبة عند الرفض)"
                      value={notes[sub.id] || ''}
                      onChange={(e) => setNotes(prev => ({ ...prev, [sub.id]: e.target.value }))}
                      rows={2}
                      style={{ width: '100%', padding: '0.5rem', marginBottom: '0.75rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn--small btn--primary" disabled={busyId === sub.id} onClick={() => approve(sub)}>
                        ✅ موافقة وترقية
                      </button>
                      <button className="btn btn--small" disabled={busyId === sub.id} onClick={() => reject(sub)}>
                        ❌ رفض
                      </button>
                    </div>
                  </>
                )}

                {sub.adminNotes && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                    📝 ملاحظات: {sub.adminNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
