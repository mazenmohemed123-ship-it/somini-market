'use client';
// صندوق المحادثات: يعرض محادثات المستخدم 1:1 لحظياً مع عدّاد غير المقروء.
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';
import Chat from '../../components/Chat';

export default function ChatsPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (loading || !user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, loading]);

  if (loading) return (<><Navbar /><main className="container">{t('common.loading')}</main></>);
  if (!user) return (<><Navbar /><main className="container"><p>سجّل الدخول لعرض محادثاتك.</p></main></>);

  return (
    <>
      <Navbar />
      <main className="container chats-layout">
        <aside className="chats-list">
          <h2>{t('chat.title')}</h2>
          {chats.length === 0 && <p className="muted">لا توجد محادثات.</p>}
          {chats.map((c) => {
            const peer = c.participants.find((p) => p !== user.uid);
            const unread = c.unread?.[user.uid] || 0;
            return (
              <button
                key={c.id}
                className={`chats-list__item ${active?.peer === peer ? 'active' : ''}`}
                onClick={() => setActive({ peer, chatId: c.id })}
              >
                <span className="chats-list__peer">👤 {peer.slice(0, 8)}…</span>
                <span className="chats-list__last">{c.lastMessage || '—'}</span>
                {unread > 0 && <span className="badge">{unread}</span>}
              </button>
            );
          })}
        </aside>
        <section className="chats-active">
          {active ? (
            <Chat peerId={active.peer} peerName={`👤 ${active.peer.slice(0, 8)}…`} />
          ) : (
            <p className="muted">اختر محادثة لبدء المراسلة.</p>
          )}
        </section>
      </main>
    </>
  );
}
