import { useEffect, useRef, useState } from 'react';
import type { ViewState } from '@love-letter/core';
import { useLocale } from '../i18n';
import { inviteUrl } from '../invite';
import { useTheme } from '../theme';

/**
 * Copy text to the clipboard with a legacy fallback. `navigator.clipboard`
 * only exists on secure origins (https or localhost) — LAN play runs over
 * plain `http://192.168.x.x:3001`, so the hidden-textarea + execCommand path
 * is what actually fires there (ticket 41). Returns whether the copy landed.
 */
function copyText(text: string): Promise<boolean> {
  const legacy = (): boolean => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    return navigator.clipboard.writeText(text).then(() => true).catch(legacy);
  }
  return Promise.resolve(legacy());
}

export function Lobby({
  view,
  selfId,
  away,
  onLeave,
}: {
  view: ViewState;
  selfId: string;
  away: string[];
  onLeave: () => void;
}) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const seats = Array.from({ length: view.capacity }, (_, i) => view.players[i]);

  // Which share button just copied — its label flips to "Copied!" for 2s.
  const [copied, setCopied] = useState<'code' | 'invite' | null>(null);
  const flashTimer = useRef<number | null>(null);
  // The flash timer must not outlive the screen (a stale fire would clear a
  // later mount's copied state).
  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);
  const flash = (which: 'code' | 'invite') => {
    setCopied(which);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setCopied(null), 2000);
  };
  const share = (which: 'code' | 'invite') => () => {
    void copyText(which === 'code' ? view.roomCode : inviteUrl(view.roomCode)).then((ok) => {
      if (ok) flash(which);
    });
  };

  const leave = () => {
    if (window.confirm(t('common.leaveConfirm'))) onLeave();
  };

  return (
    <div className="screen lobby">
      <h1>{t('lobby.room', { code: view.roomCode })}</h1>
      <p className="tagline">{t('lobby.tagline')}</p>

      <div className="share-row">
        <button type="button" className="share-button" onClick={share('code')}>
          {copied === 'code' ? t('lobby.copied') : t('lobby.copyCode')}
        </button>
        <button type="button" className="share-button" onClick={share('invite')}>
          {copied === 'invite' ? t('lobby.copied') : t('lobby.copyInvite')}
        </button>
      </div>

      {/* Empty seats are card-back tiles — the table reads as half-set. The
          `.seats`/`.seat` hooks are untouched (the smoke asserts them). */}
      <ul className="seats">
        {seats.map((player, i) => (
          <li key={i} className={player ? 'seat filled' : 'seat empty'}>
            {player ? (
              <>
                <span className="name">{player.name}</span>
                {player.id === selfId && <span className="badge">{t('lobby.you')}</span>}
                {away.includes(player.id) && <span className="badge away-badge">{t('lobby.reconnecting')}</span>}
              </>
            ) : (
              <>
                <img
                  src={theme === 'dark' ? '/cards/back-deep.png' : '/cards/back-light.png'}
                  alt=""
                  className="seat-back"
                />
                <span className="name muted">{t('lobby.waiting')}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="status">
        {view.players.length < view.capacity
          ? t('lobby.statusWaiting', { seated: view.players.length, capacity: view.capacity })
          : t('lobby.statusStarting', { seated: view.players.length, capacity: view.capacity })}
      </p>

      <button className="leave-button" onClick={leave}>
        {t('lobby.leaveGame')}
      </button>
    </div>
  );
}
