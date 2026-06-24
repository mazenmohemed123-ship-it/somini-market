'use client';
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('somini-theme') : null;
    if (saved === 'light' || saved === 'forest') setTheme(saved);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('somini-theme', theme);
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'light' ? 'forest' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
