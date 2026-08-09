import { useEffect, useRef, useState } from 'react';
import { CARD_INFO } from '@love-letter/core';
import type { Card, ChatMessage, Choice, LogEntry, PendingChoice, PlayerView, Rank, ViewState } from '@love-letter/core';
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

      <div className="game-layout">
        <main className="game-main">
          <Scoreboard view={view} selfId={selfId} />

          <Discards players={view.players} />

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
        </main>

        <ChatPanel chat={game.chat} selfId={selfId} onSend={game.sendChat} />
      </div>
    </div>
  );
}

function playerName(view: ViewState, id: string, selfId: string): string {
  if (id === selfId) return 'You';
  return view.players.find((p) => p.id === id)?.name ?? id;
}

/**
 * A rank-keyed card image. Art files are rank-keyed (`1.png`–`8.png`) so the
 * filenames never leak a card name; the tooltip carries the rules text.
 */
function CardThumb({ rank, className }: { rank: Rank; className?: string }) {
  const info = CARD_INFO[rank];
  return (
    <img
      src={`/cards/${rank}.png`}
      alt={`${info.name} (${rank})`}
      title={`${info.name} — ${info.effect}`}
      className={className}
      draggable={false}
    />
  );
}

function CardView({ card, playable, onClick }: { card: Card; playable: boolean; onClick: () => void }) {
  return (
    <button
      className={`card art ${playable ? 'playable' : ''}`}
      onClick={onClick}
      disabled={!playable}
    >
      <CardThumb rank={card.rank} />
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
 * Each player's face-up discards in play order — public table state, the raw
 * material of deduction. The panel always renders so the layout is stable; a
 * seat with nothing discarded yet shows a dash.
 */
function Discards({ players }: { players: PlayerView[] }) {
  return (
    <div className="panel discards">
      <p className="panel-title">Discards</p>
      {players.map((p) => (
        <div key={p.id} className={`discard-row ${p.out ? 'out' : ''}`}>
          <span className="name" title={p.name}>{p.name}</span>
          {p.discardPile.length === 0 ? (
            <span className="muted pile-empty">—</span>
          ) : (
            <span className="pile">
              {p.discardPile.map((c, i) => (
                <CardThumb key={i} rank={c.rank} />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Room chat: a scrollable message list fed by `game.chat` (live relay + the
 * `chatLog` replay on resume) and a free-text input that sends through the
 * server relay. Enter submits; the send button stays disabled while empty.
 */
function ChatPanel({ chat, selfId, onSend }: { chat: ChatMessage[]; selfId: string; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);

  // Keep the newest message in view as the list grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = () => {
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft('');
  };

  return (
    <aside className="panel chat">
      <p className="panel-title">Chat</p>
      <ul className="chat-log" ref={listRef}>
        {chat.map((m, i) => (
          <li key={i} className={m.from === selfId ? 'mine' : ''}>
            <span className="chat-name">{m.from === selfId ? 'You' : m.name}</span>
            <span className="chat-text">{m.text}</span>
          </li>
        ))}
        {chat.length === 0 && <li className="muted chat-empty">No messages yet.</li>}
      </ul>
      <div className="chat-input">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Say something…"
          maxLength={200}
        />
        <button onClick={send} disabled={draft.trim().length === 0}>
          Send
        </button>
      </div>
    </aside>
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
              <CardThumb rank={rank} className="choice-thumb" />
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
