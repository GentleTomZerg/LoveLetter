import { useState } from 'react';
import type { Game } from '../useGame';
import { useLocale, type Locale } from '../i18n';

export function Home({ game }: { game: Game }) {
  const { t, tCode, locale, setLocale } = useLocale();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<'2' | '3' | '4'>('2');
  const [roomCode, setRoomCode] = useState('');

  const create = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    game.clearError();
    game.sendCreateRoom(trimmed, Number(capacity));
  };

  const join = () => {
    const trimmed = name.trim();
    const code = roomCode.trim().toUpperCase();
    if (trimmed.length === 0) return;
    if (code.length === 0) return;
    game.clearError();
    game.sendJoinRoom(trimmed, code);
  };

  // A language is named in its own language, so the toggle labels don't translate.
  const pick = (next: Locale) => () => setLocale(next);

  return (
    <div className="screen home">
      <img src="/cards/logo.png" alt="Love Letter" className="logo" />
      <p className="tagline">{t('home.tagline')}</p>

      <div className="locale-toggle" role="group" aria-label="Language">
        <button className={locale === 'en' ? 'active' : ''} onClick={pick('en')}>EN</button>
        <button className={locale === 'zh' ? 'active' : ''} onClick={pick('zh')}>中文</button>
      </div>

      {game.error !== null && (
        <p className="error-banner" onClick={game.clearError}>{tCode(game.error.code, game.error.params)}</p>
      )}

      <div className="panel">
        <label>
          {t('home.yourName')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('home.namePlaceholder')}
            maxLength={20}
            autoFocus
            // iOS: autocorrect/autofill rewrite text inside controlled inputs
            // (issue 09) — opt out of every mobile text-replacement layer.
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <div className="row">
          <label>
            {t('home.players')}
            <select value={capacity} onChange={(e) => setCapacity(e.target.value as '2' | '3' | '4')}>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <button onClick={create} disabled={name.trim().length === 0}>
            {t('home.createRoom')}
          </button>
        </div>

        <div className="divider">{t('home.or')}</div>

        <div className="row">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder={t('home.roomCode')}
            maxLength={4}
            className="code-input"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={join} disabled={name.trim().length === 0 || roomCode.trim().length === 0}>
            {t('home.joinRoom')}
          </button>
        </div>
      </div>
    </div>
  );
}
