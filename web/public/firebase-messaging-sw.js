/* Service Worker لإشعارات FCM في الخلفية.
 * يُحمّل إصدار compat من Firebase ويُهيّأ بنفس مفاتيح المشروع.
 * ملاحظة: استبدل القيم أدناه بقيم مشروعك (يمكن توليدها وقت البناء).
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'REPLACE_API_KEY',
  authDomain: 'somni-market.firebaseapp.com',
  projectId: 'somni-market',
  messagingSenderId: 'REPLACE_SENDER_ID',
  appId: 'REPLACE_APP_ID'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Somni Market', {
    body: n.body || '',
    icon: '/icons/icon-192.png',
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
