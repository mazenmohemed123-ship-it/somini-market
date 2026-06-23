'use client';
// شريط التنقل العلوي + مبدّل اللغة + حالة المصادقة.
import Link from 'next/link';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';

export default function Navbar() {
  const { t, lang, setLang } = useI18n();
  const { user, role, logout } = useAuth();
  const isSeller = role === 'seller' || role === 'companyAdmin';

  return (
    <header className="navbar">
      <Link href="/" className="navbar__brand">
        🛍️ {t('appName')}
      </Link>
      <nav className="navbar__links">
        <Link href="/">{t('nav.home')}</Link>
        {user && <Link href="/orders">{t('nav.orders')}</Link>}
        {user && <Link href="/chats">💬</Link>}
        {isSeller && <Link href="/seller/dashboard">{t('nav.dashboard')}</Link>}
        {!isSeller && <Link href="/seller/start">{t('nav.sell')}</Link>}
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
