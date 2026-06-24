'use client';
// شريط التنقل العلوي + مبدّل اللغة + حالة المصادقة.
import Link from 'next/link';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { t, lang, setLang } = useI18n();
  const { user, role, logout } = useAuth();
  const isSeller = role === 'seller' || role === 'companyAdmin';
  const isAdmin = role === 'superAdmin';

  return (
    <header className="navbar">
      <Link href="/" className="navbar__brand">
        <svg width="32" height="32" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle' }}>
          <defs>
            <linearGradient id="treeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#14b8a6', stopOpacity: '1' }} />
              <stop offset="100%" style={{ stopColor: '#0d9488', stopOpacity: '1' }} />
            </linearGradient>
          </defs>
          <circle cx="128" cy="60" r="50" fill="url(#treeGradient)"/>
          <circle cx="70" cy="110" r="42" fill="url(#treeGradient)" opacity="0.9"/>
          <circle cx="186" cy="110" r="42" fill="url(#treeGradient)" opacity="0.9"/>
          <rect x="116" y="155" width="24" height="60" rx="6" fill="#3d2817"/>
          <ellipse cx="128" cy="222" rx="20" ry="8" fill="#3d2817" opacity="0.6"/>
        </svg>
        {t('appName')}
      </Link>
      <nav className="navbar__links">
        <Link href="/">{t('nav.home')}</Link>
        {user && <Link href="/orders">{t('nav.orders')}</Link>}
        {user && <Link href="/chats">💬</Link>}
        {user && !isSeller && <Link href="/kyc" style={{ color: 'var(--teal)', fontWeight: '600' }}>🔐 KYC</Link>}
        {isSeller && <Link href="/seller/dashboard">{t('nav.dashboard')}</Link>}
        {isSeller && <Link href="/seller/deals">💼 الصفقات</Link>}
        {user && role === 'buyer' && <Link href="/buyer/deals">💼 صفقاتي</Link>}
        {user && <Link href="/installments">🗓️ التقسيط</Link>}
        {!isSeller && !isAdmin && <Link href="/seller/start">{t('nav.sell')}</Link>}
        {isAdmin && <Link href="/admin" className="navbar__admin">🛡️ الأدمن</Link>}
        {isAdmin && <Link href="/admin/deals" className="navbar__admin">📊 الصفقات</Link>}
        <ThemeToggle />
        <select
          className="navbar__lang"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          aria-label="language"
        >
          <option value="ar">عربي</option>
          <option value="en">EN</option>
        </select>
        {user ? (
          <button className="navbar__btn" onClick={logout}>
            {t('nav.logout')}
          </button>
        ) : (
          <Link href="/login" className="navbar__btn">
            {t('nav.login')}
          </Link>
        )}
      </nav>
    </header>
  );
}
