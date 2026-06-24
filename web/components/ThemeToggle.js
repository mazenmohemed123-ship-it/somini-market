'use client';
// زر تبديل بين ثيم أبيض وثيم غابة.
import { useTheme } from '../lib/theme';

export default function ThemeToggle({ floating = false }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`theme-toggle ${floating ? 'theme-toggle--floating' : ''}`}>
      <button
        type="button"
        className={`theme-toggle__btn ${theme === 'light' ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        aria-label="الثيم الأبيض"
        title="ثيم أبيض"
      >
        ☀️
      </button>
      <button
        type="button"
        className={`theme-toggle__btn ${theme === 'forest' ? 'active' : ''}`}
        onClick={() => setTheme('forest')}
        aria-label="ثيم الغابة"
        title="ثيم غابة"
      >
        🌲
      </button>
    </div>
  );
}
