'use client';
// مزوّدو السياق العام (المصادقة + i18n + الثيم) + تسجيل service worker للـ PWA.
import { useEffect } from 'react';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';
import ForestBackground from '../components/ForestBackground';
import AssistantBot from '../components/AssistantBot';
import NotificationsSetup from '../components/NotificationsSetup';

export default function Providers({ children }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ForestBackground />
          {children}
          <AssistantBot />
          <NotificationsSetup />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
