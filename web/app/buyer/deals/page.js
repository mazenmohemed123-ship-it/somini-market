'use client';
// لوحة إدارة صفقات الشركات للمشتري
// عرض المفاوضات والمراحل والإجراءات
import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions, db } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import Navbar from '../../../components/Navbar';
import Chat from '../../../components/Chat';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function BuyerDealsPage() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [negotiations, setNegotiations] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [msg, setMsg] = useState(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [counterQty, setCounterQty] = useState('');

  useEffect(() => {
    if (!user) return;

    const loadDeals = async () => {
      try {
        const q = query(
          collection(db, 'deals'),
          where('buyerId', '==', user.uid)
        );
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
  }, [user]);

  const handleSelectDeal = async (dealId) => {
    try {
      const dealDoc = await getDoc(doc(db, 'deals', dealId));
      setSelectedDeal({ id: dealId, ...dealDoc.data() });

      const negQ = query(
        collection(db, 'dealNegotiations'),
        where('dealId', '==', dealId)
      );
      const negSnapshot = await getDocs(negQ);
      setNegotiations(negSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));

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

  const handleCounterOffer = async () => {
    if (!counterPrice || !counterQty) {
      setMsg('⚠️ أدخل السعر والكمية');
      return;
    }

    try {
      const respond = httpsCallable(functions, 'respondToNegotiation');
      await respond({
        dealId: selectedDeal.id,
        action: 'counter',
        quantity: parseInt(counterQty),
        price: parseFloat(counterPrice),
        notes: ''
      });
      setMsg('✅ تم إرسال العرض المقابل');
      setCounterPrice('');
      setCounterQty('');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في إرسال العرض'));
    }
  };

  const handleAccept = async () => {
    try {
      const respond = httpsCallable(functions, 'respondToNegotiation');
      await respond({
        dealId: selectedDeal.id,
        action: 'accept'
      });
      setMsg('✅ تم قبول الشروط');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في قبول الشروط'));
    }
  };

  const handleCompleteMilestone = async (milestoneId) => {
    try {
      const completeMilestone = httpsCallable(functions, 'completeMilestone');
      await completeMilestone({ milestoneId, completedBy: 'buyer' });
      setMsg('✅ تم تأكيد استكمال المرحلة');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في تأكيد المرحلة'));
    }
  };

  // إنشاء خطة تقسيط لصفقة موافق عليها
  const handleCreateInstallments = async () => {
    const count = parseInt(prompt('على كم دفعة شهرية تريد التقسيط؟ (2 إلى 24)', '3'), 10);
    if (!count || count < 2 || count > 24) {
      setMsg('❌ عدد الدفعات يجب أن يكون بين 2 و 24');
      return;
    }
    try {
      const res = await httpsCallable(functions, 'createInstallmentPlan')({
        parentType: 'deal',
        parentId: selectedDeal.id,
        count
      });
      setMsg(`✅ تم إنشاء خطة تقسيط على ${res.data.count} دفعات`);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في إنشاء التقسيط'));
    }
  };

  if (!user || role !== 'buyer') {
    return (
      <>
        <Navbar />
        <main className="container">
          <div className="panel">
            <p>هذه الصفحة للمشترين فقط.</p>
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
          <h1>💼 صفقاتي</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* قائمة الصفقات */}
          <div className="panel">
            <h2 className="panel__title">الصفقات</h2>
            {deals.length === 0 ? (
              <p style={{ color: 'var(--text-light)' }}>لا توجد صفقات حالياً</p>
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
                      الكمية: {deal.quantity} {getStatusLabel(deal.status)}
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
                    <span style={{ fontWeight: '600' }}>الحالة:</span> {getStatusLabel(selectedDeal.status)}
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>الكمية:</span> {selectedDeal.quantity} وحدة
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>السعر المتفق:</span> {selectedDeal.agreedPrice || selectedDeal.proposedPrice} EGP
                  </div>
                  <div>
                    <span style={{ fontWeight: '600' }}>الإجمالي:</span> {selectedDeal.total || 'قيد المفاوضة'} EGP
                  </div>
                  {selectedDeal.incoterm && (
                    <div>
                      <span style={{ fontWeight: '600' }}>شرط التسليم:</span> {selectedDeal.incoterm}
                    </div>
                  )}
                </div>

                {['approved', 'in_progress'].includes(selectedDeal.status) && (
                  <button className="btn btn--small" onClick={handleCreateInstallments} style={{ marginTop: '1rem' }}>
                    🗓️ ادفع بالتقسيط
                  </button>
                )}
              </div>

              {/* المفاوضات */}
              {selectedDeal.status === 'negotiation' && (
                <div className="panel" style={{ marginTop: '1.5rem' }}>
                  <h3 className="panel__title">المفاوضات</h3>
                  <div className="form-stack">
                    {negotiations.map((neg, idx) => (
                      <div key={neg.id} style={{
                        padding: '1rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '0.5rem',
                        borderLeft: '3px solid var(--teal)',
                        marginBottom: '1rem'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                          {neg.proposedBy === user.uid ? '👤 أنت' : '👥 البائع'}
                        </div>
                        <div>الكمية: {neg.quantity} | السعر: {neg.price} EGP</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                          {new Date(neg.createdAt?.toDate?.()).toLocaleDateString('ar')}
                        </div>
                      </div>
                    ))}

                    {/* نموذج الرد */}
                    <div style={{
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0.5rem',
                      marginTop: '1rem'
                    }}>
                      <div style={{ marginBottom: '1rem', fontWeight: '600' }}>عرض مقابل</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <input
                          type="number"
                          placeholder="الكمية"
                          value={counterQty}
                          onChange={(e) => setCounterQty(e.target.value)}
                        />
                        <input
                          type="number"
                          placeholder="السعر"
                          value={counterPrice}
                          onChange={(e) => setCounterPrice(e.target.value)}
                        />
                      </div>
                      <button
                        className="btn btn--small btn--primary"
                        onClick={handleCounterOffer}
                      >
                        إرسال عرض مقابل
                      </button>

                      <button
                        className="btn btn--small"
                        onClick={handleAccept}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        قبول العرض الحالي
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                          الحالة: {mile.status}
                        </div>

                        {mile.status === 'completed_by_seller' && (
                          <div>
                            {mile.evidence?.url ? (
                              <a href={mile.evidence.url} target="_blank" rel="noopener noreferrer"
                                 style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--teal)' }}>
                                📎 راجع دليل البائع{mile.evidence.note ? ` — ${mile.evidence.note}` : ''}
                              </a>
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>
                                ⚠️ لا يوجد دليل مرفوع
                              </div>
                            )}
                            <button
                              className="btn btn--small btn--primary"
                              onClick={() => handleCompleteMilestone(mile.id)}
                            >
                              تأكيد الاستكمال بعد مراجعة الدليل
                            </button>
                          </div>
                        )}

                        {mile.status === 'completed' && (
                          <div>
                            <span style={{ color: 'var(--success)' }}>✅ موثقة ومؤكدة</span>
                            {mile.evidence?.url && (
                              <a href={mile.evidence.url} target="_blank" rel="noopener noreferrer"
                                 style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--teal)' }}>
                                📎 عرض الدليل
                              </a>
                            )}
                          </div>
                        )}

                        {mile.status === 'released' && (
                          <span style={{ color: 'var(--success)' }}>💰 تم تحرير الدفعة</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* غرفة محادثة الصفقة (deal_room) */}
              <div className="panel" style={{ marginTop: '1.5rem' }}>
                <h3 className="panel__title">💬 محادثة الصفقة</h3>
                <Chat
                  peerId={selectedDeal.sellerId}
                  peerName="البائع"
                  context={{ type: 'deal', id: selectedDeal.id }}
                />
              </div>

              {msg && <p className="toast-msg" style={{ marginTop: '1.5rem' }}>{msg}</p>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
