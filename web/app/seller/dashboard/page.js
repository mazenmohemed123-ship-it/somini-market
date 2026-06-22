'use client';
// لوحة تحكم البائع: إحصائيات سريعة + رسم بياني للمبيعات الشهرية.
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { functions } from '../../../lib/firebase';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import Navbar from '../../../components/Navbar';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function DashboardPage() {
  const { t } = useI18n();
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (loading || !user) return;
    httpsCallable(functions, 'sellerDashboard')()
      .then((res) => setStats(res.data))
      .catch((e) => setErr(e.message));
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

  return (
    <>
      <Navbar />
      <main className="container">
        <h1>{t('dashboard.title')}</h1>
        {err && <p className="error">{err}</p>}
        {!stats ? (
          <p>{t('common.loading')}</p>
        ) : (
          <>
            <div className="stats-grid">
              <StatCard label={t('dashboard.salesToday')} value={`${stats.todaySales.toFixed(0)} ${t('common.currency')}`} />
              <StatCard label={t('dashboard.salesMonth')} value={`${stats.monthSales.toFixed(0)} ${t('common.currency')}`} />
              <StatCard label={t('dashboard.orders')} value={stats.monthCount} />
              <StatCard label={t('dashboard.pending')} value={stats.pendingOrders} highlight={stats.pendingOrders > 0} />
              <StatCard label={t('dashboard.disputes')} value={stats.openDisputes} highlight={stats.openDisputes > 0} danger />
            </div>

            <section className="chart-box">
              <h2>{t('dashboard.monthlyChart')}</h2>
              <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            </section>

            <section>
              <h2>{t('dashboard.topProducts')}</h2>
              <ul className="top-products">
                {stats.topProducts.map((p) => (
                  <li key={p.productId}>
                    <code>{p.productId}</code> — {p.sold}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function StatCard({ label, value, highlight, danger }) {
  return (
    <div className={`stat-card ${highlight ? 'stat-card--highlight' : ''} ${danger ? 'stat-card--danger' : ''}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
    </div>
  );
}
