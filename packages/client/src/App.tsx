/**
 * @love-letter/client — App root: wires the connection hook to the three
 * screens (Home → Lobby → Game), with a dismissible error banner.
 */

import { useGame } from './useGame';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';

export function App() {
  const game = useGame();

  if (game.status === 'connecting') {
    return (
      <div className="screen">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  if (game.status === 'closed') {
    return (
      <div className="screen">
        <p className="muted">Connection lost — refresh to resume your seat. Your room is held for a minute after the drop.</p>
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
          {game.error}
        </div>
      )}
      {game.view.phase === 'lobby' ? (
        <Lobby view={game.view} selfId={game.selfId!} />
      ) : (
        <Game view={game.view} selfId={game.selfId!} game={game} />
      )}
    </>
  );
}
