import { useState } from 'react';
import type { Game } from '../useGame';

export function Home({ game }: { game: Game }) {
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

  return (
    <div className="screen home">
      <img src="/cards/logo.png" alt="Love Letter" className="logo" />
      <p className="tagline">A game of risk, deduction, and luck for 2–4 players.</p>

      {game.error !== null && (
        <p className="error-banner" onClick={game.clearError}>{game.error}</p>
      )}

      <div className="panel">
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alice"
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
            Players
            <select value={capacity} onChange={(e) => setCapacity(e.target.value as '2' | '3' | '4')}>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <button onClick={create} disabled={name.trim().length === 0}>
            Create room
          </button>
        </div>

        <div className="divider">or</div>

        <div className="row">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={4}
            className="code-input"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={join} disabled={name.trim().length === 0 || roomCode.trim().length === 0}>
            Join room
          </button>
        </div>
      </div>
    </div>
  );
}
