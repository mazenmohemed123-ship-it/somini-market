import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'سومني ماركت | Somni Market',
  description: 'سوق آمن متعدد البائعين بنظام ضمان كامل',
  manifest: '/manifest.json',
  themeColor: '#0f766e'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f766e'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
