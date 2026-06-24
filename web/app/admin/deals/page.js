'use client';
// لوحة إدارة الصفقات للأدمن
// الموافقة على الصفقات + تحرير الدفعات
import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions, db } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import Navbar from '../../../components/Navbar';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function AdminDealsPage() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('awaiting_admin');

  useEffect(() => {
    if (!user) return;

    const loadDeals = async () => {
      try {
        let q;
        if (filter === 'all') {
          q = query(collection(db, 'deals'));
        } else {
          q = query(
            collection(db, 'deals'),
            where('status', '==', filter)
          );
        }

        const snapshot = await getDocs(q);
        const dealsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDeals(dealsData);
      } catch (err) {
        console.error('Error loading deals:', err);
        setMsg('❌ خطأ في تحميل الصفقات');
      } finally {
        setLoading(false);
      }
    };

    loadDeals();
  }, [user, filter]);

  const handleSelectDeal = async (dealId) => {
    try {
      const dealDoc = await getDoc(doc(db, 'deals', dealId));
      setSelectedDeal({ id: dealId, ...dealDoc.data() });

      const milQ = query(
        collection(db, 'dealMilestones'),
        where('dealId', '==', dealId)
      );
      const milSnapshot = await getDocs(milQ);
      setMilestones(milSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading deal details:', err);
      setMsg('❌ خطأ في تحميل بيانات الصفقة');
    }
  };

  const handleApproveDeal = async () => {
    try {
      const approveDeal = httpsCallable(functions, 'approveDeal');
      await approveDeal({ dealId: selectedDeal.id });
      setMsg('✅ تم الموافقة على الصفقة');
      setDeals(deals.filter(d => d.id !== selectedDeal.id));
      setSelectedDeal(null);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في الموافقة'));
    }
  };

  const handleReleaseMilestone = async (milestoneId) => {
    try {
      const release = httpsCallable(functions, 'releaseMilestonePayment');
      await release({ milestoneId });
      setMsg('✅ تم تحرير الدفعة');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في تحرير الدفعة'));
    }
  };

  if (!user || role !== 'superAdmin') {
    return (
      <>
        <Navbar />
        <main className="container">
          <div className="panel">
            <p>صفحة محجوزة للأدمن فقط.</p>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="container">
          <div className="panel">
            <p>جاري التحميل...</p>
          </div>
        </main>
      </>
    );
  }

  const getStatusLabel = (status) => {
    const labels = {
      'negotiation': '🔄 مفاوضة',
      'terms_agreed': '✅ الشروط متفق عليها',
      'milestones_created': '📋 تم إنشاء المراحل',
      'awaiting_admin': '⏳ في انتظار موافقة الأدمن',
      'approved': '✔️ موافق عليها',
      'in_progress': '🚀 قيد التنفيذ',
      'completed': '🎉 منتهية',
      'rejected': '❌ مرفوضة'
    };
    return labels[status] || status;
  };

  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-head">
          <h1>⚙️ إدارة الصفقات</h1>
        </div>

        <div className="panel" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              className={`btn btn--small ${filter === 'awaiting_admin' ? 'btn--primary' : ''}`}
              onClick={() => setFilter('awaiting_admin')}
            >
              ⏳ في الانتظار ({deals.length})
            </button>
            <button
              className={`btn btn--small ${filter === 'approved' ? 'btn--primary' : ''}`}
              onClick={() => setFilter('approved')}
            >
              ✔️ موافق عليها
            </button>
            <button
              className={`btn btn--small ${filter === 'in_progress' ? 'btn--primary' : ''}`}
              onClick={() => setFilter('in_progress')}
            >
              🚀 قيد التنفيذ
            </button>
            <button
              className={`btn btn--small ${filter === 'completed' ? 'btn--primary' : ''}`}
              onClick={() => setFilter('completed')}
            >
              🎉 منتهية
            </button>
            <button
              className={`btn btn--small ${filter === 'all' ? 'btn--primary' : ''}`}
              onClick={() => setFilter('all')}
            >
              الكل
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* قائمة الصفقات */}
          <div className="panel">
            <h2 className="panel__title">الصفقات</h2>
            {deals.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>لا توجد صفقات</p>
            ) : (
              <div className="form-stack">
                {deals.map(deal => (
                  <button
                    key={deal.id}
                    onClick={() => handleSelectDeal(deal.id)}
                    style={{
                      padding: '1rem',
                      border: selectedDeal?.id === deal.id ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: selectedDeal?.id === deal.id ? 'var(--teal-light)' : 'transparent',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      textAlign: 'right'
                    }}
                  >
                    <div style={{ fontWeight: '600' }}>{deal.productTitle}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                      {getStatusLabel(deal.status)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {deal.total} EGP
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* تفاصيل الصفقة المختارة */}
          {selectedDeal && (
            <div>
              <div className="panel">
                <h2 className="panel__title">تفاصيل الصفقة</h2>
                <div className="form-stack" style={{ fontSize: '0.95rem' }}>
                  <div>
                    <span style={{ fontWeight: '600' }}>ID:</span> {selectedDeal.id}
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>الحالة:</span> {getStatusLabel(selectedDeal.status)}
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>المنتج:</span> {selectedDeal.productTitle}
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>الكمية:</span> {selectedDeal.quantity}
                  </div>
                  {selectedDeal.incoterm && (
                    <div>
                      <span style={{ fontWeight: '600' }}>شرط التسليم:</span> {selectedDeal.incoterm}
                    </div>
                  )}
                  <div>
                    <span style={{ fontWeight: '600' }}>السعر المتفق:</span> {selectedDeal.agreedPrice || selectedDeal.proposedPrice} EGP
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>المبلغ الإجمالي:</span> {selectedDeal.total} EGP
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>العمولة:</span> {selectedDeal.platformFee} EGP
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>تاريخ الإنشاء:</span> {new Date(selectedDeal.createdAt?.toDate?.()).toLocaleDateString('ar')}
                  </div>
                </div>

                {selectedDeal.status === 'awaiting_admin' && (
                  <button
                    className="btn btn--primary btn--block"
                    onClick={handleApproveDeal}
                    style={{ marginTop: '1.5rem' }}
                  >
                    ✅ الموافقة على الصفقة
                  </button>
                )}
              </div>

              {/* المراحل */}
              {milestones.length > 0 && (
                <div className="panel" style={{ marginTop: '1.5rem' }}>
                  <h3 className="panel__title">مراحل الدفع</h3>
                  <div className="form-stack">
                    {milestones.map((mile) => (
                      <div key={mile.id} style={{
                        padding: '1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                          {mile.title}
                        </div>
                        <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          {mile.percentage}% - {mile.amount} EGP
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                          الحالة: <strong>{mile.status}</strong>
                        </div>

                        {mile.evidence?.url ? (
                          <a href={mile.evidence.url} target="_blank" rel="noopener noreferrer"
                             style={{ display: 'block', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--teal)' }}>
                            📎 مراجعة الدليل المرفوع{mile.evidence.note ? ` — ${mile.evidence.note}` : ''}
                          </a>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '1rem' }}>
                            ⚠️ لا يوجد دليل — لا تُحرّر الدفعة بدون مراجعة دليل فعلي
                          </div>
                        )}

                        {mile.status === 'completed' && (
                          <button
                            className="btn btn--small btn--primary"
                            disabled={!mile.evidence?.url}
                            onClick={() => handleReleaseMilestone(mile.id)}
                          >
                            💰 تحرير الدفعة
                          </button>
                        )}

                        {mile.status === 'released' && (
                          <span style={{ color: 'var(--success)' }}>✅ تم تحرير الدفعة</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {msg && <p className="toast-msg" style={{ marginTop: '1.5rem' }}>{msg}</p>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
