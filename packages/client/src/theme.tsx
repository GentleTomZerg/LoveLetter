/**
 * @love-letter/client — theme (the redesign's one new piece of logic).
 *
 * Two themes — "Parchment" (light) and "Night court" (dark) — selected by a
 * `data-theme` attribute on the root element; every color in the client
 * resolves through CSS custom properties defined for both themes, so no
 * component ever hard-codes a color.
 *
 * Resolution: persisted choice (localStorage) wins, else the
 * `prefers-color-scheme` media query. `index.html` runs a tiny inline script
 * before React mounts so there is no light→dark flash on first paint; this
 * provider keeps the attribute and the stored choice in sync afterwards.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from './i18n';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'love-letter.theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode / storage denied — fall through to the media query.
  }
  return systemTheme();
}

interface ThemeApi {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage denied — the attribute still carries the theme this session.
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}

/** The toggle button — an icon showing what clicking it will switch TO, with
 *  an aria-label in the viewer's locale. Lives on the Home screen (beside the
 *  locale toggle) and in the game's merged top bar. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useLocale();
  const next = theme === 'light' ? 'dark' : 'light';
  const label = t(next === 'dark' ? 'theme.dark' : 'theme.light');
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
