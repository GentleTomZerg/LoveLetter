import type { ViewState } from '@love-letter/core';
import { useLocale } from '../i18n';

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
  const seats = Array.from({ length: view.capacity }, (_, i) => view.players[i]);

  const leave = () => {
    if (window.confirm(t('common.leaveConfirm'))) onLeave();
  };

  return (
    <div className="screen lobby">
      <h1>{t('lobby.room', { code: view.roomCode })}</h1>
      <p className="tagline">{t('lobby.tagline')}</p>

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
              <span className="name muted">{t('lobby.waiting')}</span>
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
