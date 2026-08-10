/**
 * @love-letter/client — locale plumbing (ADR-0004).
 *
 * Per-client language: auto-detected from the browser, switchable with a
 * persisted manual toggle. One room can mix languages — the server never
 * sees the locale.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Rank } from '@love-letter/core';
import { MESSAGES, en, type Locale, type MessageKey } from './messages';
import { CARD_TEXT } from './cards';

export type { Locale, MessageKey } from './messages';

const STORAGE_KEY = 'love-letter-locale';

/** The locale a fresh visitor gets: a stored override, else the browser's. */
export function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // storage unavailable (private mode) — fall through to the browser
  }
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export type TParams = Record<string, string | number | string[]>;

function interpolate(template: string, params?: TParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(params[token] ?? `{${token}}`));
}

/** Interpolate {token} placeholders; an unknown key falls back to English, then the key itself. */
export function t(locale: Locale, key: MessageKey, params?: TParams): string {
  const template = MESSAGES[locale][key] ?? en[key] ?? key;
  return interpolate(template, params);
}

/** Translate a wire error/roomClosed code (`error.<code>`); unknown codes fall back to a generic line. */
export function tCode(locale: Locale, code: string, params?: TParams): string {
  const dict = MESSAGES[locale] as Record<string, string>;
  const fallback = dict['error.unknown'] ?? 'Something went wrong.';
  const template = dict[`error.${code}`] ?? (en as Record<string, string>)[`error.${code}`] ?? fallback;
  return interpolate(template, params);
}

export interface LocaleApi {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TParams) => string;
  /** Translate a wire error/roomClosed code; unknown codes fall back to `error.unknown`. */
  tCode: (code: string, params?: TParams) => string;
  cardName: (rank: Rank) => string;
  cardEffect: (rank: Rank) => string;
}

/**
 * Join already-resolved display names per locale convention: "A and B",
 * "A, B and C" in English; "A 和 B", "A、B 和 C" in Chinese.
 */
export function joinLocalizedList(items: readonly string[], t: LocaleApi['t']): string {
  if (items.length <= 1) return items[0] ?? '';
  const last = items[items.length - 1]!;
  const rest = items.slice(0, -1).join(t('common.listComma'));
  return `${rest}${t('common.listAnd')}${last}`;
}

const LocaleContext = createContext<LocaleApi | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — the choice just won't persist
    }
  }, []);

  const api = useMemo<LocaleApi>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => t(locale, key, params),
      tCode: (code, params) => tCode(locale, code, params),
      cardName: (rank) => CARD_TEXT[locale].name[rank],
      cardEffect: (rank) => CARD_TEXT[locale].effect[rank],
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={api}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleApi {
  const ctx = useContext(LocaleContext);
  if (ctx === null) throw new Error('useLocale must be used inside LocaleProvider');
  return ctx;
}
