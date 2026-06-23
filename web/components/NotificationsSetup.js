'use client';
// يطلب إذن الإشعارات، يجلب رمز FCM، ويخزّنه عبر saveFcmToken.
// يستمع أيضاً للرسائل أثناء فتح التطبيق (foreground).
import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, getMessagingIfSupported } from '../lib/firebase';
import { useAuth } from '../lib/auth';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export default function NotificationsSetup() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !VAPID_KEY || typeof window === 'undefined') return;
    let unsub = () => {};

    (async () => {
      try {
        const messaging = await getMessagingIfSupported();
        if (!messaging) return;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const { getToken, onMessage } = await import('firebase/messaging');
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
        if (token) {
          await httpsCallable(functions, 'saveFcmToken')({ token });
        }

        // إشعارات أثناء فتح التطبيق
        unsub = onMessage(messaging, (payload) => {
          const n = payload.notification;
          if (n && Notification.permission === 'granted') {
            new Notification(n.title || 'Somni Market', { body: n.body, icon: '/icons/icon-192.png' });
          }
        });
      } catch (e) {
        console.warn('FCM setup skipped:', e?.message);
      }
    })();

    return () => unsub();
  }, [user]);

  return null;
}
