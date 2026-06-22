'use client';
// نظام i18n خفيف قائم على Context. العربية افتراضية + RTL تلقائي.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import ar from '../locales/ar.json';
import en from '../locales/en.json';

const DICTS = { ar, en };
const RTL_LANGS = ['ar'];

const I18nContext = createContext(null);

function resolve(dict, path) {
  return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('ar');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lang') : null;
    if (saved && DICTS[saved]) setLang(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
      localStorage.setItem('lang', lang);
    }
  }, [lang]);

  const t = useCallback(
    (key, fallback) => resolve(DICTS[lang], key) ?? resolve(DICTS.ar, key) ?? fallback ?? key,
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir: RTL_LANGS.includes(lang) ? 'rtl' : 'ltr' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
