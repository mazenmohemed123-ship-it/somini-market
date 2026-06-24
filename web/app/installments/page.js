'use client';
// صفحة خطط التقسيط (Pay Later) — للمشتري والبائع
// المنصة تتابع الدفعات فقط ولا تضمن — التأخر يُعلَّم ويُنبَّه له
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';
import { collection, query, where, getDocs } from 'firebase/firestore';

const STATUS_BADGE = {
  pending: { label: '⏳ مستحقة', color: 'var(--warn)' },
  paid: { label: '✅ مدفوعة', color: 'var(--teal)' },
  overdue: { label: '⚠️ متأخرة', color: 'var(--danger)' }
};

export default function InstallmentsPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const asBuyer = await getDocs(query(collection(db, 'installment_plans'), where('buyerId', '==', user.uid)));
      const asSeller = await getDocs(query(collection(db, 'installment_plans'), where('sellerId', '==', user.uid)));
      const map = {};
      [...asBuyer.docs, ...asSeller.docs].forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
      setPlans(Object.values(map));
    } catch (e) {
      setMsg('❌ ' + e.message);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    load();
  }, [user, loading]);

  const pay = async (planId, index) => {
    setBusy(`${planId}_${index}`);
    try {
      await httpsCallable(functions, 'markInstallmentPaid')({ planId, index });
      setMsg('✅ تم تسجيل الدفعة');
      await load();
    } catch (e) {
      setMsg('❌ ' + (e.message || 'خطأ'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user) return (<><Navbar /><main className="container"><p>سجّل الدخول لعرض خطط التقسيط.</p></main></>);

  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-head"><h1>🗓️ خطط التقسيط</h1></div>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          المنصة تتابع الدفعات وتُنبّه عند التأخر فقط — لا تضمن ولا تموّل أي مبلغ.
        </p>
        {msg && <p className="toast-msg">{msg}</p>}

        {plans.length === 0 ? (
          <div className="panel"><p style={{ color: 'var(--text-light)' }}>لا توجد خطط تقسيط.</p></div>
        ) : (
          <div className="form-stack" style={{ gap: '1.5rem' }}>
            {plans.map(plan => {
              const isBuyer = plan.buyerId === user.uid;
              const paidCount = plan.installments.filter(i => i.status === 'paid').length;
              return (
                <div key={plan.id} className="panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h2 className="panel__title" style={{ margin: 0 }}>
                      {plan.parentType === 'deal' ? '💼 صفقة' : '📦 طلب'} · {plan.totalAmount} ج.م
                    </h2>
                    <span style={{
                      fontSize: '0.78rem', padding: '0.25rem 0.6rem', borderRadius: '999px', color: '#fff',
                      background: plan.status === 'completed' ? 'var(--teal)' : plan.status === 'defaulted' ? 'var(--danger)' : 'var(--warn)'
                    }}>
                      {plan.status === 'completed' ? 'مكتملة' : plan.status === 'defaulted' ? 'متعثّرة' : 'نشطة'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                    {paidCount} / {plan.count} دفعات مدفوعة · {isBuyer ? 'أنت المشتري' : 'أنت البائع'}
                  </div>

                  <div className="form-stack" style={{ gap: '0.6rem' }}>
                    {plan.installments.map(inst => {
                      const badge = STATUS_BADGE[inst.status] || STATUS_BADGE.pending;
                      return (
                        <div key={inst.index} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '0.6rem 0.8rem', background: 'var(--bg-secondary)', borderRadius: '8px',
                          borderRight: `4px solid ${badge.color}`
                        }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>دفعة {inst.index + 1}: {inst.amount} ج.م</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>
                              استحقاق: {new Date(inst.dueDate).toLocaleDateString('ar')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontSize: '0.78rem', color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                            {isBuyer && inst.status !== 'paid' && (
                              <button className="btn btn--small btn--primary"
                                disabled={busy === `${plan.id}_${inst.index}`}
                                onClick={() => pay(plan.id, inst.index)}>
                                💵 سدّدت
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
