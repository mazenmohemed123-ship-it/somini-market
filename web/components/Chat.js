'use client';
// شات خاص 1:1 مبني على Realtime Database (رسائل حيّة وخفيفة).
// يستدعي openChat (Cloud Function) لتهيئة المحادثة، ثم يستمع لفرع RTDB.
import { useEffect, useRef, useState } from 'react';
import { ref, onChildAdded, push, serverTimestamp, set, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { rtdb, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

export default function Chat({ peerId, peerName, context }) {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const bottomRef = useRef(null);

  // تهيئة المحادثة عبر Cloud Function (تنشئ الميتاداتا والصلاحيات)
  useEffect(() => {
    if (!user || !peerId) return;
    const openChat = httpsCallable(functions, 'openChat');
    openChat({ peerId, context }).then((res) => setChatId(res.data.chatId));
  }, [user, peerId, context]);

  // الاستماع للرسائل الجديدة
  useEffect(() => {
    if (!chatId) return;
    const msgsRef = ref(rtdb, `chats/${chatId}/messages`);
    const unsub = onChildAdded(msgsRef, (snap) => {
      setMessages((prev) => [...prev, { id: snap.key, ...snap.val() }]);
    });
    // مؤشر "يكتب الآن" للطرف الآخر
    const typingRef = ref(rtdb, `chats/${chatId}/typing/${peerId}`);
    const unsubTyping = onValue(typingRef, (s) => setPeerTyping(!!s.val()));
    return () => {
      unsub();
      unsubTyping();
    };
  }, [chatId, peerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const body = text.trim();
    if (!body || !chatId) return;
    setText('');
    await push(ref(rtdb, `chats/${chatId}/messages`), {
      senderId: user.uid,
      text: body,
      createdAt: serverTimestamp()
    });
    set(ref(rtdb, `chats/${chatId}/typing/${user.uid}`), false);
  };

  const onType = (v) => {
    setText(v);
    if (chatId) set(ref(rtdb, `chats/${chatId}/typing/${user.uid}`), v.length > 0);
  };

  if (!user) return <p>{t('common.loading')}</p>;

  return (
    <div className="chat" dir={dir}>
      <div className="chat__header">
        <strong>{peerName || t('chat.title')}</strong>
        {peerTyping && <span className="chat__typing"> · {t('chat.typing')}</span>}
      </div>
      <div className="chat__messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.senderId === user.uid ? 'bubble--me' : 'bubble--them'}`}
          >
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat__input">
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={t('chat.placeholder')}
        />
        <button onClick={sendMessage}>{t('chat.send')}</button>
      </div>
    </div>
  );
}
