import type { ViewState } from '@love-letter/core';

export function Lobby({ view, selfId }: { view: ViewState; selfId: string }) {
  const seats = Array.from({ length: view.capacity }, (_, i) => view.players[i]);

  return (
    <div className="screen lobby">
      <h1>Room {view.roomCode}</h1>
      <p className="tagline">
        Share this code with your friends — the match starts automatically when all seats are full.
      </p>

      <ul className="seats">
        {seats.map((player, i) => (
          <li key={i} className={player ? 'seat filled' : 'seat empty'}>
            {player ? (
              <>
                <span className="name">{player.name}</span>
                {player.id === selfId && <span className="badge">you</span>}
              </>
            ) : (
              <span className="name muted">Waiting…</span>
            )}
          </li>
        ))}
      </ul>

      <p className="status">
        {view.players.length}/{view.capacity} players seated
        {view.players.length < view.capacity ? ' — waiting for the rest…' : ' — starting!'}
      </p>
    </div>
  );
}
