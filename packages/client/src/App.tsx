/**
 * @love-letter/client — App root: wires the connection hook to the three
 * screens (Home → Lobby → Game), with a dismissible error banner.
 */

import { useGame } from './useGame';
import { useLocale } from './i18n';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';

export function App() {
  const game = useGame();
  const { t, tCode } = useLocale();

  if (game.left) {
    // Intentionally left: Home, with the fresh socket still connecting.
    return <Home game={game} />;
  }

  if (game.roomClosed !== null) {
    return (
      <div className="screen">
        <div className="panel room-closed">
          <p>{tCode(game.roomClosed.code, game.roomClosed.params)}</p>
          <button onClick={game.goHome}>{t('app.backHome')}</button>
        </div>
      </div>
    );
  }

  if (game.status === 'connecting') {
    return (
      <div className="screen">
        <p className="muted">{t('app.connecting')}</p>
      </div>
    );
  }

  if (game.status === 'closed') {
    return (
      <div className="screen">
        <p className="muted">{t('app.connectionLost')}</p>
      </div>
    );
  }

  if (game.view === null) {
    return <Home game={game} />;
  }

  return (
    <>
      {game.error !== null && (
        <div className="error-banner" onClick={game.clearError}>
          {tCode(game.error.code, game.error.params)}
        </div>
      )}
      {game.view.phase === 'lobby' ? (
        <Lobby view={game.view} selfId={game.selfId!} away={game.away} onLeave={game.sendLeave} />
      ) : (
        <Game view={game.view} selfId={game.selfId!} game={game} />
      )}
    </>
  );
}
