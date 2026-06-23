'use client';
// مزوّدو السياق العام (المصادقة + i18n) + تسجيل service worker للـ PWA.
import { useEffect } from 'react';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import AssistantBot from '../components/AssistantBot';
import NotificationsSetup from '../components/NotificationsSetup';

export default function Providers({ children }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>
        {children}
        <AssistantBot />
        <NotificationsSetup />
      </AuthProvider>
    </I18nProvider>
  );
}
