'use client';
// لوحة تحكم البائع: ثلاث أقسام جنباً إلى جنب (الإحصائيات + الطلبات + الصفقات)
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { functions, db } from '../../../lib/firebase';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import Navbar from '../../../components/Navbar';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  const { t } = useI18n();
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentDeals, setRecentDeals] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (loading || !user) return;

    const loadDashboard = async () => {
      try {
        // Load stats
        const statsRes = await httpsCallable(functions, 'sellerDashboard')();
        setStats(statsRes.data);

        // Load recent orders
        const ordersQ = query(
          collection(db, 'orders'),
          where('sellerId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const ordersSnap = await getDocs(ordersQ);
        setRecentOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Load recent deals
        const dealsQ = query(
          collection(db, 'deals'),
          where('sellerId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const dealsSnap = await getDocs(dealsQ);
        setRecentDeals(dealsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        setErr(e.message);
      }
    };

    loadDashboard();
  }, [user, loading]);

  if (loading) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user || !['seller', 'companyAdmin'].includes(role)) {
    return (<><Navbar /><main className="container"><p>غير مصرّح — للبائعين فقط.</p></main></>);
  }

  const chartData = {
    labels: stats?.chart?.map((c) => c.date) || [],
    datasets: [
      {
        label: t('dashboard.monthlyChart'),
        data: stats?.chart?.map((c) => c.total) || [],
        backgroundColor: '#0f766e'
      }
    ]
  };

  const getOrderStatusLabel = (status) => {
    const labels = {
      'pending_payment': '⏳ في انتظار الدفع',
      'payment_confirmed': '✅ تم الدفع',
      'shipped': '📦 تم الشحن',
      'delivered': '🚚 تم التسليم',
      'completed': '🎉 مكتملة',
      'disputed': '⚠️ نزاع'
    };
    return labels[status] || status;
  };

  const getDealStatusLabel = (status) => {
    const labels = {
      'negotiation': '🔄 مفاوضة',
      'terms_agreed': '✅ متفق عليها',
      'milestones_created': '📋 مراحل',
      'awaiting_admin': '⏳ في الانتظار',
      'approved': '✔️ موافق',
      'in_progress': '🚀 قيد التنفيذ',
      'completed': '🎉 منتهية'
    };
    return labels[status] || status;
  };

  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-head">
          <h1>📊 لوحة التحكم</h1>
        </div>

        {err && <p className="error">{err}</p>}

        {!stats ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', minHeight: '600px' }}>
            {/* القسم 1: الإحصائيات */}
            <div className="panel">
              <h2 className="panel__title">📈 الإحصائيات</h2>
              <div className="form-stack" style={{ gap: '0.75rem' }}>
                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  borderLeft: '4px solid var(--teal)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>اليوم</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--teal)' }}>
                    {stats.todaySales.toFixed(0)} EGP
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  borderLeft: '4px solid var(--teal)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>هذا الشهر</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--teal)' }}>
                    {stats.monthSales.toFixed(0)} EGP
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  borderLeft: '4px solid var(--warn)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>الطلبات المعلقة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--warn)' }}>
                    {stats.pendingOrders}
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  borderLeft: '4px solid var(--danger)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>النزاعات المفتوحة</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--danger)' }}>
                    {stats.openDisputes}
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  borderLeft: '4px solid var(--teal)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>إجمالي الطلبات</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--teal)' }}>
                    {stats.monthCount}
                  </div>
                </div>
              </div>

              <Link href="/seller/products" className="link-btn" style={{ marginTop: '1rem' }}>
                ➜ إدارة المنتجات
              </Link>
            </div>

            {/* القسم 2: الطلبات الأخيرة */}
            <div className="panel">
              <h2 className="panel__title">📦 آخر الطلبات</h2>
              {recentOrders.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>لا توجد طلبات</p>
              ) : (
                <div className="form-stack" style={{ gap: '0.75rem' }}>
                  {recentOrders.map(order => (
                    <div
                      key={order.id}
                      style={{
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        borderLeft: '4px solid var(--teal)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                        {order.productTitle}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.25rem' }}>
                        {order.quantity} × {order.unitPrice} = {order.total} EGP
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {getOrderStatusLabel(order.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/orders" className="link-btn" style={{ marginTop: '1rem' }}>
                ➜ جميع الطلبات
              </Link>
            </div>

            {/* القسم 3: الصفقات الأخيرة */}
            <div className="panel">
              <h2 className="panel__title">💼 آخر الصفقات</h2>
              {recentDeals.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>لا توجد صفقات</p>
              ) : (
                <div className="form-stack" style={{ gap: '0.75rem' }}>
                  {recentDeals.map(deal => (
                    <div
                      key={deal.id}
                      style={{
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        borderLeft: '4px solid var(--teal)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                        {deal.productTitle}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.25rem' }}>
                        الكمية: {deal.quantity}
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {getDealStatusLabel(deal.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/seller/deals" className="link-btn" style={{ marginTop: '1rem' }}>
                ➜ جميع الصفقات
              </Link>
            </div>
          </div>
        )}

        {/* الرسم البياني الشهري */}
        {stats && (
          <section className="chart-box" style={{ marginTop: '2rem' }}>
            <h2>{t('dashboard.monthlyChart')}</h2>
            <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
          </section>
        )}
      </main>
    </>
  );
}
