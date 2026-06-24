'use client';
// لوحة إدارة صفقات الشركات للبائع
// عرض المفاوضات والمراحل والإجراءات
import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions, db, storage } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import Navbar from '../../../components/Navbar';
import Chat from '../../../components/Chat';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function SellerDealsPage() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [negotiations, setNegotiations] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [msg, setMsg] = useState(null);
  const [evidenceFiles, setEvidenceFiles] = useState({}); // { [milestoneId]: File }
  const [evidenceNotes, setEvidenceNotes] = useState({}); // { [milestoneId]: string }
  const [uploadingId, setUploadingId] = useState(null);

  useEffect(() => {
    if (!user) return;

    const loadDeals = async () => {
      try {
        // Load deals where user is seller
        const q = query(
          collection(db, 'deals'),
          where('sellerId', '==', user.uid)
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

      // Load negotiations
      const negQ = query(
        collection(db, 'dealNegotiations'),
        where('dealId', '==', dealId)
      );
      const negSnapshot = await getDocs(negQ);
      setNegotiations(negSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load milestones
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

  const handleStartMilestone = async (milestoneId) => {
    try {
      const startMilestone = httpsCallable(functions, 'startMilestone');
      await startMilestone({ milestoneId });
      setMsg('✅ بدأت المرحلة');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في بدء المرحلة'));
    }
  };

  // إنهاء المرحلة مع رفع دليل إلزامي (مستند/صورة) — جوهر منع النصب
  const handleCompleteMilestone = async (milestoneId) => {
    const file = evidenceFiles[milestoneId];
    if (!file) {
      setMsg('❌ يجب اختيار ملف دليل (مستند شحن / صورة تسليم) قبل إنهاء المرحلة.');
      return;
    }
    try {
      setUploadingId(milestoneId);
      // رفع الدليل إلى Storage تحت مسار خاص بالصفقة
      const path = `deal_evidence/${selectedDeal.id}/${milestoneId}/${Date.now()}_${file.name}`;
      const sref = storageRef(storage, path);
      await uploadBytes(sref, file);
      const evidenceUrl = await getDownloadURL(sref);

      const completeMilestone = httpsCallable(functions, 'completeMilestone');
      await completeMilestone({
        milestoneId,
        completedBy: 'seller',
        evidenceUrl,
        evidenceNote: evidenceNotes[milestoneId] || ''
      });
      setMsg('✅ تم إنهاء المرحلة ورفع الدليل');
      handleSelectDeal(selectedDeal.id);
    } catch (err) {
      setMsg('❌ ' + (err.message || 'خطأ في تحديث المرحلة'));
    } finally {
      setUploadingId(null);
    }
  };

  if (!user || (role !== 'seller' && role !== 'companyAdmin')) {
    return (
      <>
        <Navbar />
        <main className="container">
          <div className="panel">
            <p>هذه الصفحة للبائعين فقط.</p>
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
          <h1>💼 صفقات الشركات</h1>
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
                    <span style={{ fontWeight: '600' }}>الإجمالي:</span> {selectedDeal.total} EGP
                  </div>
                </div>
              </div>

              {/* المفاوضات */}
              <div className="panel" style={{ marginTop: '1.5rem' }}>
                <h3 className="panel__title">سجل المفاوضات</h3>
                <div className="form-stack">
                  {negotiations.map((neg, idx) => (
                    <div key={neg.id} style={{
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0.5rem',
                      borderLeft: '3px solid var(--teal)'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                        {neg.proposedBy === user.uid ? '👤 أنت' : '👥 المشتري'}
                      </div>
                      <div>الكمية: {neg.quantity} | السعر: {neg.price} EGP</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                        {new Date(neg.createdAt?.toDate?.()).toLocaleDateString('ar')}
                      </div>
                    </div>
                  ))}
                </div>
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
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                          الحالة: {mile.status}
                        </div>

                        {mile.status === 'pending' && (
                          <button
                            className="btn btn--small btn--primary"
                            onClick={() => handleStartMilestone(mile.id)}
                          >
                            بدء التنفيذ
                          </button>
                        )}

                        {mile.status === 'in_progress' && (
                          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                              📎 ارفع دليل الإنجاز (مستند شحن / صورة تسليم / تأكيد ميناء) — إلزامي
                            </div>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => setEvidenceFiles(prev => ({ ...prev, [mile.id]: e.target.files?.[0] || null }))}
                              style={{ marginBottom: '0.5rem', fontSize: '0.8rem', width: '100%' }}
                            />
                            <input
                              type="text"
                              placeholder="ملاحظة على الدليل (اختياري)"
                              value={evidenceNotes[mile.id] || ''}
                              onChange={(e) => setEvidenceNotes(prev => ({ ...prev, [mile.id]: e.target.value }))}
                              style={{ marginBottom: '0.5rem', fontSize: '0.8rem', width: '100%', padding: '0.4rem' }}
                            />
                            <button
                              className="btn btn--small btn--primary"
                              disabled={uploadingId === mile.id || !evidenceFiles[mile.id]}
                              onClick={() => handleCompleteMilestone(mile.id)}
                            >
                              {uploadingId === mile.id ? 'جارٍ الرفع…' : '📤 إنهاء المرحلة برفع الدليل'}
                            </button>
                          </div>
                        )}

                        {mile.status === 'completed_by_seller' && (
                          <div>
                            <span style={{ color: 'var(--text-light)' }}>⏳ في انتظار تأكيد المشتري</span>
                            {mile.evidence?.url && (
                              <a href={mile.evidence.url} target="_blank" rel="noopener noreferrer"
                                 style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--teal)' }}>
                                📎 عرض الدليل المرفوع
                              </a>
                            )}
                          </div>
                        )}

                        {mile.status === 'completed' && (
                          <div>
                            <span style={{ color: 'var(--success)' }}>✅ مؤكدة من المشتري</span>
                            {mile.evidence?.url && (
                              <a href={mile.evidence.url} target="_blank" rel="noopener noreferrer"
                                 style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--teal)' }}>
                                📎 عرض الدليل
                              </a>
                            )}
                          </div>
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
                  peerId={selectedDeal.buyerId}
                  peerName="المشتري"
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
