'use client';
// سجل طلبات المشتري + لوحة الضمان لكل طلب محمي.
import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';
import EscrowPanel from '../../components/EscrowPanel';

const STATUS_AR = {
  pending: 'بانتظار الدفع', paid: 'مدفوع', shipped: 'تم الشحن',
  delivered: 'تم التسليم', disputed: 'قيد النزاع', closed: 'مغلق'
};

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [escrows, setEscrows] = useState({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      const q = query(
        collection(db, 'orders'),
        where('buyerId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);

      // اجلب مستندات الضمان للطلبات المحمية
      const map = {};
      for (const o of list.filter((o) => o.escrowId)) {
        const e = await getDoc(doc(db, 'escrowTransactions', o.escrowId));
        if (e.exists()) map[o.escrowId] = { escrowId: e.id, ...e.data() };
      }
      setEscrows(map);
      setFetching(false);
    })();
  }, [user, loading]);

  if (loading || fetching) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user) return (<><Navbar /><main className="container"><p>سجّل الدخول لعرض طلباتك.</p></main></>);

  return (
    <>
      <Navbar />
      <main className="container">
        <h1>{t('nav.orders')}</h1>
        {orders.length === 0 && <p>لا توجد طلبات بعد.</p>}
        {orders.map((o) => (
          <div key={o.id} className="order-row">
            <div className="order-row__head">
              <strong>{o.productTitle || o.productId}</strong>
              <span className="muted">{STATUS_AR[o.status] || o.status}</span>
              <span>{o.totalAmount} {o.currency}</span>
            </div>
            {o.escrowId && escrows[o.escrowId] && (
              <EscrowPanel escrow={escrows[o.escrowId]} />
            )}
          </div>
        ))}
      </main>
    </>
  );
}
