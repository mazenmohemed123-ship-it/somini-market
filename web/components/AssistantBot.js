'use client';
// واجهة البوت المساعد القواعدي. يرسل النص إلى Cloud Function assistantBot
// ويعرض الردود. لا يستخدم أي LLM.
import { useState, useRef, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

export default function AssistantBot() {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: t('chat.assistantHint') }
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const ask = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    setMessages((p) => [...p, { from: 'me', text: q }]);
    setBusy(true);
    try {
      const bot = httpsCallable(functions, 'assistantBot');
      const res = await bot({ message: q });
      setMessages((p) => [...p, { from: 'bot', text: res.data.text, data: res.data.data }]);
    } catch (e) {
      setMessages((p) => [...p, { from: 'bot', text: t('common.error') }]);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="bot" dir={dir}>
      {open && (
        <div className="bot__panel">
          <div className="bot__header">{t('chat.assistant')}</div>
          <div className="bot__messages">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.from === 'me' ? 'bubble--me' : 'bubble--them'}`}>
                {m.text.split('\n').map((line, j) => (
                  <div key={j}>{line}</div>
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="bot__input">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder={t('chat.placeholder')}
              disabled={busy}
            />
            <button onClick={ask} disabled={busy}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      )}
      <button className="bot__fab" onClick={() => setOpen((o) => !o)} aria-label="assistant">
        {open ? '✕' : '🤖'}
      </button>
    </div>
  );
}
