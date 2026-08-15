import { useEffect, useState } from 'react';
import type { Game } from '../useGame';
import { useLocale, type Locale } from '../i18n';
import { inviteCodeFromUrl } from '../invite';
import { ThemeToggle } from '../theme';

/** The shared identity persists (ticket 41) so re-entry is one click; the
 *  player id the server issues lives separately (sessionStorage, useGame). */
const NAME_KEY = 'love-letter-name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return ''; // storage denied — the session just doesn't remember
  }
}

export function Home({ game }: { game: Game }) {
  const { t, tCode, locale, setLocale } = useLocale();
  const [name, setName] = useState<string>(loadName);
  const [capacity, setCapacity] = useState<'2' | '3' | '4'>('2');
  const initialCode = inviteCodeFromUrl();
  const [roomCode, setRoomCode] = useState(initialCode);
  const [showCode, setShowCode] = useState(() => initialCode !== '');
  // The card is highlighted only when the URL actually carried an invite.
  const invited = initialCode !== '';

  // Persist the name as it changes; the cards below stay enabled regardless —
  // the name is only required at the moment of create/join.
  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // storage denied — the session keeps the name in state
    }
  }, [name]);

  const create = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    game.clearError();
    game.sendCreateRoom(trimmed, Number(capacity));
  };

  const join = (code: string) => {
    const trimmed = name.trim();
    const c = code.trim().toUpperCase();
    if (trimmed.length === 0 || c.length === 0) return;
    game.clearError();
    game.sendJoinRoom(trimmed, c);
  };

  // A language is named in its own language, so the toggle labels don't translate.
  const pick = (next: Locale) => () => setLocale(next);

  return (
    <div className="screen home">
      <img src="/cards/logo.png" alt="Love Letter" className="logo" />
      <p className="tagline">{t('home.tagline')}</p>

      <div className="settings-row">
        <div className="locale-toggle" role="group" aria-label="Language">
          <button className={locale === 'en' ? 'active' : ''} onClick={pick('en')}>EN</button>
          <button className={locale === 'zh' ? 'active' : ''} onClick={pick('zh')}>中文</button>
        </div>
        <ThemeToggle />
      </div>

      {game.error !== null && (
        <p className="error-banner" onClick={game.clearError}>{tCode(game.error.code, game.error.params)}</p>
      )}

      <label className="name-field">
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

      <div className="panel card start-card">
        <h2>{t('home.startCard')}</h2>
        <div className="row">
          <label>
            {t('home.players')}
            <select value={capacity} onChange={(e) => setCapacity(e.target.value as '2' | '3' | '4')}>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <button className="btn-primary" onClick={create} disabled={name.trim().length === 0}>
            {t('home.createRoom')}
          </button>
        </div>
      </div>

      {/* Join: the directory slot renders ticket 40's list when it lands;
          until then the empty state is the answer to "is anything open?" */}
      <div className={`panel card join-card${invited ? ' invited' : ''}`}>
        <h2>{t('home.joinCard')}</h2>

        <div className="directory-slot">
          <p className="slot-header">{t('home.openTables')}</p>
          {game.rooms.length === 0 ? (
            <p className="muted slot-empty">{t('home.noOpenRooms')}</p>
          ) : (
            <ul className="room-list">
              {game.rooms.map((room) => (
                <li key={room.code}>
                  <button
                    type="button"
                    className="room-row"
                    onClick={() => join(room.code)}
                    disabled={name.trim().length === 0}
                  >
                    <span className="room-names">{room.names.join(' · ')}</span>
                    <span className="room-code">{room.code}</span>
                    <span className="room-count">{room.seated}/{room.capacity}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="button" className="code-toggle" onClick={() => setShowCode((s) => !s)}>
          {showCode ? t('home.hideCode') : t('home.haveCode')}
        </button>

        {showCode && (
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
            <button className="btn-primary" onClick={() => join(roomCode)} disabled={name.trim().length === 0 || roomCode.trim().length === 0}>
              {t('home.joinRoom')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
