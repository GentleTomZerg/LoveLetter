import { useEffect, useRef, useState } from 'react';
import type { Card, ChatMessage, Choice, LogEntry, PendingChoice, PlayerView, Rank, ViewState } from '@love-letter/core';
import type { Game } from '../useGame';
import { useLocale, joinLocalizedList } from '../i18n';
import { formatLogEntry, type LogContext } from '../i18n/logFormat';

export function Game({ view, selfId, game }: { view: ViewState; selfId: string; game: Game }) {
  const { t, cardName } = useLocale();
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentTurn === selfId;
  const canPlay = view.phase === 'round' && myTurn && view.pendingChoice === null;
  const myChoice = view.pendingChoice !== null && view.pendingChoice.playerId === selfId;

  const playerName = (id: string) =>
    id === selfId ? t('common.you') : (view.players.find((p) => p.id === id)?.name ?? id);

  const leave = () => {
    if (window.confirm(t('common.leaveConfirm'))) game.sendLeave();
  };

  return (
    <div className="screen game">
      <header className="game-header">
        <span>{t('game.room', { code: view.roomCode })}</span>
        <span>{t('game.round', { number: view.roundNumber })}</span>
        <span>{t('game.deck', { count: view.deckCount })}</span>
        <button className="leave-button" onClick={leave}>
          {t('game.leaveGame')}
        </button>
      </header>

      <div className="game-layout">
        <main className="game-main">
          <TablePanel view={view} selfId={selfId} away={game.away} />

          <div className="table">
            {myTurn && view.phase === 'round' && !myChoice && (
              <p className="turn-banner">{t('game.turnBanner')}</p>
            )}

            <div className="hand">
              {view.hand.length === 0 && <p className="muted">{t('game.emptyHand')}</p>}
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
                {t('game.faceUp', { cards: view.faceUpRemoved.map((c) => cardName(c.rank)).join(t('common.listComma')) })}
              </p>
            )}

            {view.burnedCount > 0 && view.phase === 'round' && (
              <div className="burned">
                <img src="/cards/back-light.png" alt="" className="card-back" />
                <span className="muted">{t('game.burned')}</span>
              </div>
            )}

            {view.phase === 'roundEnded' && (
              <div className="panel round-over">
                <p>
                  <strong>{joinLocalizedList(view.roundWinnerIds.map((id) => playerName(id)), t)}</strong>{' '}
                  {t('game.roundWonTail')}
                </p>
                <button onClick={game.sendNextRound}>{t('game.startNextRound')}</button>
              </div>
            )}

            {view.phase === 'matchEnded' && view.matchWinnerId && (
              <div className="panel match-over">
                <h2>{t('game.matchWon', { name: playerName(view.matchWinnerId) })}</h2>
                <p>{t('game.matchRematch', { count: view.tokenTarget })}</p>
                <button onClick={game.sendRematch}>{t('game.rematch')}</button>
              </div>
            )}
          </div>

          <Abilities />

          <Log log={view.log} activity={game.activity} selfId={selfId} roster={view.roster} />

          {me && me.protected && <p className="badge protected-badge">{t('game.protected')}</p>}
        </main>

        <ChatPanel chat={game.chat} selfId={selfId} onSend={game.sendChat} />
      </div>
    </div>
  );
}

/**
 * A rank-keyed card image. Art files are rank-keyed (`1.png`–`8.png`) so the
 * filenames never leak a card name; the tooltip carries the rules text.
 */
function CardThumb({ rank, className }: { rank: Rank; className?: string }) {
  const { t, cardName, cardEffect } = useLocale();
  return (
    <img
      src={`/cards/${rank}.png`}
      alt={`${cardName(rank)} (${rank})`}
      title={`${cardName(rank)} — ${cardEffect(rank)}`}
      className={className}
      draggable={false}
    />
  );
}

function CardView({ card, playable, onClick }: { card: Card; playable: boolean; onClick: () => void }) {
  const { cardName } = useLocale();
  return (
    <button
      className={`card art ${playable ? 'playable' : ''}`}
      onClick={onClick}
      disabled={!playable}
    >
      <CardThumb rank={card.rank} />
      <span className="rank-badge">{card.rank}</span>
      <span className="name-caption">{cardName(card.rank)}</span>
    </button>
  );
}

/**
 * One unified panel for all public table state (issue 14): each player's row
 * shows their name, hearts (tokens) won, whose turn it is, protected/out
 * state, their face-up discards (an overlapping, shadowed pile — the raw
 * material of deduction) and how many cards they still hold (face-down backs
 * plus an explicit count). The panel always renders so the layout is stable.
 */
function TablePanel({ view, selfId, away }: { view: ViewState; selfId: string; away: string[] }) {
  const { t, cardName } = useLocale();
  return (
    <div className="panel scoreboard">
      <p className="panel-title">{t('table.title')}</p>
      {view.players.map((p) => {
        const isMe = p.id === selfId;
        const isTurn = view.currentTurn === p.id && view.phase === 'round';
        return (
          <div
            key={p.id}
            className={`seat ${isMe ? 'me' : ''} ${p.out ? 'out' : ''} ${isTurn ? 'turn' : ''}`}
          >
            <span className="name" title={p.name}>{p.name}{isMe ? t('table.youSuffix') : ''}</span>
            <span className="tokens" title={t('table.tokensTitle')}>♥ {p.tokens} / {view.tokenTarget}</span>
            {isTurn && <span className="turn-badge">{t('table.turn')}</span>}
            {p.protected && <span className="badge">{t('table.protected')}</span>}
            {p.out && <span className="badge out-badge">{t('table.out')}</span>}
            {away.includes(p.id) && <span className="badge away-badge">{t('table.reconnecting')}</span>}
            {p.discardPile.length === 0 ? (
              <span className="muted pile-empty">—</span>
            ) : (
              <span className="pile" title={t('table.discards', { count: p.discardPile.length })}>
                {p.discardPile.map((c, i) => (
                  <CardThumb key={i} rank={c.rank} />
                ))}
              </span>
            )}
            <span className="hand-info" title={t('table.handTitle', { count: p.handCount })}>
              <span className="muted hand-label">{t('table.hand')}</span>
              <span className="hand-backs">
                {Array.from({ length: p.handCount }).map((_, i) => (
                  <img key={i} src="/cards/back-light.png" alt="" className="hand-back" draggable={false} />
                ))}
              </span>
              <span className={`hand-count ${p.handCount === 0 ? 'zero' : ''}`}>{p.handCount}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A collapsible reference of all eight cards and their effects (issue 12) —
 * touch screens have no hover, so the tooltips are unreachable there. The
 * desktop tooltips stay; this is the always-available version.
 */
function Abilities() {
  const { t, cardName, cardEffect } = useLocale();
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <details className="panel abilities">
      <summary>{t('game.abilities')}</summary>
      <ul className="abilities-list">
        {ranks.map((rank) => (
          <li key={rank}>
            <CardThumb rank={rank} className="ability-thumb" />
            <span className="ability-text">
              <strong>{cardName(rank)}</strong> ({rank}) — {cardEffect(rank)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Room chat: a scrollable message list fed by `game.chat` (live relay + the
 * `chatLog` replay on resume) and a free-text input that sends through the
 * server relay. Enter submits; the send button stays disabled while empty.
 */
function ChatPanel({ chat, selfId, onSend }: { chat: ChatMessage[]; selfId: string; onSend: (text: string) => void }) {
  const { t } = useLocale();
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
      <p className="panel-title">{t('chat.title')}</p>
      <ul className="chat-log" ref={listRef}>
        {chat.map((m, i) => (
          <li key={i} className={m.from === selfId ? 'mine' : ''}>
            <span className="chat-name">{m.from === selfId ? t('common.you') : m.name}</span>
            <span className="chat-text">{m.text}</span>
          </li>
        ))}
        {chat.length === 0 && <li className="muted chat-empty">{t('chat.empty')}</li>}
      </ul>
      <div className="chat-input">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder={t('chat.placeholder')}
          maxLength={200}
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          autoComplete="off"
        />
        <button onClick={send} disabled={draft.trim().length === 0}>
          {t('chat.send')}
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
  const { t, cardName } = useLocale();
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => setTargetId(null), [pendingChoice]);

  if (pendingChoice.playerId !== selfId) {
    const chooser = players.find((p) => p.id === pendingChoice.playerId)?.name ?? t('choice.someone');
    return <p className="choice-prompt muted">{t('choice.choosing', { name: chooser })}</p>;
  }

  const targetNames = pendingChoice.targets.map(
    (id) => players.find((p) => p.id === id)?.name ?? id,
  );

  if (pendingChoice.kind !== 'guard') {
    const label: Record<'priest' | 'baron' | 'prince' | 'king', string> = {
      priest: t('choice.priest'),
      baron: t('choice.baron'),
      prince: t('choice.prince'),
      king: t('choice.king'),
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
      <p className="choice-prompt">{t('choice.guard')}</p>
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
              {cardName(rank)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The event log, newest first. Room-layer status lines (disconnects/
 * reconnects, issue 11) ride along with it. The two sequences use separate
 * id counters, so the keys are prefixed to stay unique and stable across
 * inserts. Entries are structured (ADR-0003); `formatLogEntry` renders them
 * in the viewer's locale.
 */
function Log({
  log,
  activity,
  selfId,
  roster,
}: {
  log: LogEntry[];
  activity: LogEntry[];
  selfId: string;
  roster: Record<string, string>;
}) {
  const { t, cardName } = useLocale();
  const ctx: LogContext = { selfId, roster, t, cardName };
  const all = [
    ...log.map((e) => ({ ...e, key: `v${e.id}` })),
    ...activity.map((e) => ({ ...e, key: `a${e.id}` })),
  ];
  return (
    <ul className="log">
      {[...all].reverse().map((entry) => (
        <li key={entry.key} className={`log-${entry.kind}`}>
          {formatLogEntry(entry, ctx)}
        </li>
      ))}
    </ul>
  );
}
