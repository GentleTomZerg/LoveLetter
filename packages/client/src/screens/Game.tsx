import { useEffect, useState } from 'react';
import { CARD_INFO } from '@love-letter/core';
import type { Card, Choice, LogEntry, PendingChoice, PlayerView, ViewState } from '@love-letter/core';
import type { Game } from '../useGame';

export function Game({ view, selfId, game }: { view: ViewState; selfId: string; game: Game }) {
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentTurn === selfId;
  const canPlay = view.phase === 'round' && myTurn && view.pendingChoice === null;
  const myChoice = view.pendingChoice !== null && view.pendingChoice.playerId === selfId;

  return (
    <div className="screen game">
      <header className="game-header">
        <span>Room {view.roomCode}</span>
        <span>Round {view.roundNumber}</span>
        <span>Deck: {view.deckCount}</span>
      </header>

      <Scoreboard view={view} selfId={selfId} />

      <div className="table">
        {myTurn && view.phase === 'round' && !myChoice && (
          <p className="turn-banner">It's your turn — play a card.</p>
        )}

        <div className="hand">
          {view.hand.length === 0 && <p className="muted">Your hand is empty.</p>}
          {view.hand.map((card, i) => (
            <CardView
              key={i}
              card={card}
              playable={canPlay}
              onClick={() => game.sendPlayCard(i as 0 | 1)}
            />
          ))}
        </div>

        {view.pendingChoice && (
          <ChoicePanel
            pendingChoice={view.pendingChoice}
            selfId={selfId}
            players={view.players}
            onChoice={game.sendChoice}
          />
        )}

        {view.faceUpRemoved.length > 0 && (
          <p className="muted face-up">
            Removed face-up: {view.faceUpRemoved.map((c) => c.name).join(', ')}
          </p>
        )}

        {view.burnedCount > 0 && view.phase === 'round' && (
          <div className="burned">
            <img src="/cards/back-light.png" alt="" className="card-back" />
            <span className="muted">face-down removed card — unknown to all</span>
          </div>
        )}

        {view.phase === 'roundEnded' && (
          <div className="panel round-over">
            <p>
              <strong>{view.roundWinnerIds.map((id) => playerName(view, id, selfId)).join(' and ')}</strong> won the round.
            </p>
            <button onClick={game.sendNextRound}>Start next round</button>
          </div>
        )}

        {view.phase === 'matchEnded' && view.matchWinnerId && (
          <div className="panel match-over">
            <h2>{playerName(view, view.matchWinnerId, selfId)} won the match!</h2>
            <p>First to {view.tokenTarget} tokens — rematch with the same seats?</p>
            <button onClick={game.sendRematch}>Rematch</button>
          </div>
        )}
      </div>

      <Log log={view.log} />
      {me && me.protected && <p className="badge protected-badge">You are protected by the Handmaid</p>}
    </div>
  );
}

function playerName(view: ViewState, id: string, selfId: string): string {
  if (id === selfId) return 'You';
  return view.players.find((p) => p.id === id)?.name ?? id;
}

function CardView({ card, playable, onClick }: { card: Card; playable: boolean; onClick: () => void }) {
  const info = CARD_INFO[card.rank];
  return (
    <button
      className={`card art ${playable ? 'playable' : ''}`}
      onClick={onClick}
      disabled={!playable}
      title={info.effect}
    >
      <img src={`/cards/${card.rank}.png`} alt={`${card.name} (${card.rank})`} draggable={false} />
      <span className="rank-badge">{card.rank}</span>
      <span className="name-caption">{card.name}</span>
    </button>
  );
}

function Scoreboard({ view, selfId }: { view: ViewState; selfId: string }) {
  return (
    <div className="scoreboard">
      {view.players.map((p) => (
        <div key={p.id} className={`seat ${p.id === selfId ? 'me' : ''} ${p.out ? 'out' : ''}`}>
          <span className="name">{p.name}{p.id === selfId ? ' (you)' : ''}</span>
          <span className="tokens">
            {p.tokens} / {view.tokenTarget}
          </span>
          {view.currentTurn === p.id && view.phase === 'round' && <span className="turn-badge">turn</span>}
          {p.protected && <span className="badge">protected</span>}
          {p.out && <span className="badge out-badge">out</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * The two-step choice prompt: the Guard names a target then a card; the other
 * four targeting cards just pick a target. The guess is sent the moment the
 * last piece is chosen; the local selection resets on each new pending choice.
 */
function ChoicePanel({
  pendingChoice,
  selfId,
  players,
  onChoice,
}: {
  pendingChoice: PendingChoice;
  selfId: string;
  players: PlayerView[];
  onChoice: (choice: Choice) => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => setTargetId(null), [pendingChoice]);

  if (pendingChoice.playerId !== selfId) {
    const chooser = players.find((p) => p.id === pendingChoice.playerId)?.name ?? 'Someone';
    return <p className="choice-prompt muted">{chooser} is choosing…</p>;
  }

  const targetNames = pendingChoice.targets.map(
    (id) => players.find((p) => p.id === id)?.name ?? id,
  );

  if (pendingChoice.kind !== 'guard') {
    const label: Record<'priest' | 'baron' | 'prince' | 'king', string> = {
      priest: 'Your Priest: whose hand do you want to see?',
      baron: 'Your Baron: who do you challenge?',
      prince: 'Your Prince: who discards and draws?',
      king: 'Your King: who do you trade hands with?',
    };
    return (
      <div className="panel choice">
        <p className="choice-prompt">{label[pendingChoice.kind]}</p>
        <div className="choice-row">
          {pendingChoice.targets.map((id, i) => (
            <button
              key={id}
              onClick={() => onChoice({ kind: pendingChoice.kind, targetPlayerId: id })}
            >
              {targetNames[i]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel choice">
      <p className="choice-prompt">Your Guard: who do you accuse, and of holding what?</p>
      <div className="choice-row">
        {pendingChoice.targets.map((id, i) => (
          <button key={id} className={targetId === id ? 'selected' : ''} onClick={() => setTargetId(id)}>
            {targetNames[i]}
          </button>
        ))}
      </div>
      {targetId !== null && (
        <div className="choice-row cards">
          {pendingChoice.namedOptions.map((rank) => (
            <button
              key={rank}
              onClick={() => onChoice({ kind: 'guard', targetPlayerId: targetId, namedRank: rank })}
            >
              <img src={`/cards/${rank}.png`} alt="" className="choice-thumb" />
              {CARD_INFO[rank].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Log({ log }: { log: LogEntry[] }) {
  return (
    <ul className="log">
      {[...log].reverse().map((entry) => (
        <li key={entry.id} className={`log-${entry.kind}`}>
          {entry.text}
        </li>
      ))}
    </ul>
  );
}
