import { useEffect, useRef, useState } from 'react';
import type { Card, ChatMessage, Choice, LogEntry, PendingChoice, PlayerView, Rank, ViewState } from '@love-letter/core';
import type { Game } from '../useGame';
import { useLocale, joinLocalizedList } from '../i18n';
import { formatLogEntry, entryRank, mergeLog, type ActivityLine, type LogContext } from '../i18n/logFormat';
import { PlayScenes, usePlayScenes } from './PlayScenes';

export function Game({ view, selfId, game }: { view: ViewState; selfId: string; game: Game }) {
  const { t, cardName } = useLocale();
  const scenes = usePlayScenes(view.log, selfId, view.roster, view.hand.map((c) => c.rank));
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentTurn === selfId;
  // Ticket 24: the round waits — the hand stays disabled until the scene
  // queue drains, so nobody acts over a resolution that is still animating.
  const canPlay = view.phase === 'round' && myTurn && view.pendingChoice === null && !scenes.busy;
  const myChoice = view.pendingChoice !== null && view.pendingChoice.playerId === selfId;

  // Ticket 25: selecting a hand card is a pending local choice — regret
  // before the send. The selection resets whenever the world changes under
  // it: the turn passes, a pending choice opens, the phase moves, or the
  // hand itself reshapes (a stale index would highlight the wrong card).
  const [selected, setSelected] = useState<number | null>(null);
  const handKey = view.hand.map((c) => `${c.rank}:${c.name}`).join(',');
  useEffect(() => setSelected(null), [handKey, view.currentTurn, view.pendingChoice, view.phase]);

  // Ticket 28: the drawer's own draw pops the new card in the hand (~0.6s) —
  // a pure CSS moment, no scene, no round pause. The header deck count
  // pulses on every draw (keyed remount restarts the CSS animation).
  const [popRank, setPopRank] = useState<Rank | null>(null);
  const drawSeq = game.lastDraw?.seq ?? 0;
  useEffect(() => {
    if (game.lastDraw === null) return;
    setPopRank(game.lastDraw.rank);
    const timer = setTimeout(() => setPopRank(null), 600);
    return () => clearTimeout(timer);
  }, [drawSeq]);
  const [deckPulse, setDeckPulse] = useState(0);
  useEffect(() => setDeckPulse((n) => n + 1), [view.deckCount]);

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
        <span key={`deck${deckPulse}`} className="deck-count">
          {t('game.deck', { count: view.deckCount })}
        </span>
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
                  selected={selected === i}
                  drawn={popRank === card.rank}
                  onClick={() => setSelected(selected === i ? null : i)}
                />
              ))}
            </div>

            {/* Ticket 25: the fixed Play action bar — appears only while a
                card is selected, confirms exactly one play, then clears. */}
            {selected !== null && canPlay && selected < view.hand.length && (
              <div className="play-bar">
                <button
                  className="play-confirm"
                  onClick={() => {
                    const which = selected as 0 | 1;
                    setSelected(null);
                    game.sendPlayCard(which);
                  }}
                >
                  {t('game.playCard', { card: cardName(view.hand[selected]!.rank) })}
                </button>
              </div>
            )}

            {view.pendingChoice && (
              <ChoicePanel
                pendingChoice={view.pendingChoice}
                selfId={selfId}
                players={view.players}
                onChoice={game.sendChoice}
                disabled={scenes.busy}
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

          <Log
            log={view.log}
            activity={game.activity}
            logArrivals={game.logArrivals}
            selfId={selfId}
            roster={view.roster}
            beat={scenes.currentEntry}
          />

          {me && me.protected && <p className="badge protected-badge">{t('game.protected')}</p>}
        </main>
      </div>

      <PlayScenes scenes={scenes} selfId={selfId} roster={view.roster} />

      <ChatDialog chat={game.chat} selfId={selfId} onSend={game.sendChat} />
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

function CardView({ card, playable, selected, drawn, onClick }: { card: Card; playable: boolean; selected: boolean; drawn: boolean; onClick: () => void }) {
  const { cardName } = useLocale();
  return (
    <button
      className={`card art ${playable ? 'playable' : ''} ${selected ? 'selected' : ''} ${drawn ? 'drawn' : ''}`}
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
            data-player-id={p.id}
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
 * Chat as a floating pill + modal dialog (issue 20): the sidebar is gone — a
 * fixed bottom-right pill previews the newest message inline (or a muted
 * "Chat" when empty) and carries an unread-count badge that grows while the
 * dialog is closed and clears on open. Clicking the pill opens a modal with
 * the message list and input; it closes on outside click, Esc, or send
 * (grilling Q12–Q15).
 */
function ChatDialog({ chat, selfId, onSend }: { chat: ChatMessage[]; selfId: string; onSend: (text: string) => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Others' messages the user has seen (dialog open, or up to the last
  // close); only arrivals beyond this count while the dialog is closed become
  // unread. Own messages never count — the relay echoes them back to this
  // socket, so counting them would badge every message you send.
  const seenRef = useRef(0);
  // Latest others-count for event handlers, which would otherwise close over
  // a stale prop (kept in sync after every render).
  const othersRef = useRef(0);

  const isMine = (m: ChatMessage) => m.from === selfId;
  const fromName = (m: ChatMessage) => (isMine(m) ? t('common.you') : m.name);
  const othersCount = () => chat.reduce((n, m) => n + (isMine(m) ? 0 : 1), 0);

  useEffect(() => {
    othersRef.current = othersCount();
  });

  useEffect(() => {
    if (open) return;
    const now = othersCount();
    if (now > seenRef.current) setUnread(now - seenRef.current);
    else if (now < seenRef.current) {
      // Replaced or cleared (e.g. the resume chatLog) — nothing to catch up on.
      seenRef.current = now;
      setUnread(0);
    }
  }, [chat, open]);

  // Keep the newest message in view as the list grows (while the dialog is open).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, open]);

  // Focus the input when the dialog opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Esc closes the dialog through the same path as outside click and send, so
  // the seen baseline stays in sync (a stale closure can't hurt: closeDialog
  // reads the refs, which always hold the latest values).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openDialog = () => {
    setOpen(true);
    setUnread(0);
    seenRef.current = othersRef.current;
  };

  const closeDialog = () => {
    setOpen(false);
    seenRef.current = othersRef.current;
  };

  const newest = chat.length > 0 ? chat[chat.length - 1]! : null;
  const preview = newest !== null ? `${fromName(newest)}: ${newest.text}` : t('chat.title');

  const send = () => {
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft('');
    closeDialog();
  };

  return (
    <>
      <button className="chat-pill" onClick={openDialog}>
        <span className={`chat-preview ${newest === null ? 'muted' : ''}`}>{preview}</span>
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
      {open && (
        <div className="chat-modal" role="dialog" aria-modal="true" aria-label={t('chat.title')} onClick={closeDialog}>
          <div className="chat-dialog panel" onClick={(e) => e.stopPropagation()}>
            <div className="chat-header">
              <p className="panel-title">{t('chat.title')}</p>
              {/* Ticket 29: the explicit close button — on phones the dialog
                  is near-fullscreen so there is no backdrop to tap and no Esc
                  key; this is the only close that always exists. */}
              <button className="chat-close" onClick={closeDialog} aria-label={t('chat.close')}>
                ×
              </button>
            </div>
            <ul className="chat-log" ref={listRef}>
              {chat.map((m, i) => (
                <li key={i} className={isMine(m) ? 'mine' : ''}>
                  <span className="chat-name">{fromName(m)}</span>
                  <span className="chat-text">{m.text}</span>
                </li>
              ))}
              {chat.length === 0 && <li className="muted chat-empty">{t('chat.empty')}</li>}
            </ul>
            <div className="chat-input">
              <input
                ref={inputRef}
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
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The two-step choice prompt: the Guard names a target then a card; the other
 * four targeting cards just pick a target. The guess is sent the moment the
 * last piece is chosen; the local selection resets on each new pending choice.
 * `disabled` (ticket 24) holds the buttons while a scene is animating — the
 * round waits for the queue to drain before anyone acts.
 */
function ChoicePanel({
  pendingChoice,
  selfId,
  players,
  onChoice,
  disabled,
}: {
  pendingChoice: PendingChoice;
  selfId: string;
  players: PlayerView[];
  onChoice: (choice: Choice) => void;
  disabled: boolean;
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
              disabled={disabled}
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
          <button key={id} className={targetId === id ? 'selected' : ''} disabled={disabled} onClick={() => setTargetId(id)}>
            {targetNames[i]}
          </button>
        ))}
      </div>
      {targetId !== null && (
        <div className="choice-row cards">
          {pendingChoice.namedOptions.map((rank) => (
            <button
              key={rank}
              disabled={disabled}
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
 * The event log (issue 19), collapsed to a single latest-event strip under
 * the table: the newest entry rendered with a mini card thumbnail when it
 * carries a rank, expanding in place (`<details>`, the Abilities pattern) to
 * the full newest-first history with the scroll height kept. Room-layer
 * status lines (disconnects/reconnects, issue 11) ride along with it. The
 * two sequences use separate id counters, so the keys are prefixed to stay
 * unique and stable across inserts. Entries are structured (ADR-0003);
 * `formatLogEntry` renders them in the viewer's locale.
 *
 * Ticket 24: while a scene animates, the strip shows the **beat** — the log
 * entry the current scene narrates — so it never races ahead of the
 * animation (the win line lands only when the win banner plays). Idle or
 * reduced-motion (no scenes enqueue) → the newest entry by socket arrival,
 * exactly as before.
 *
 * Ticket 31: the game log and room activity share a socket arrival clock
 * (`logArrivals` + the activity lines' stamps), so "newest" is one ordered
 * list — a reconnect line wins the strip only until the next game entry
 * lands, instead of permanently.
 */
function Log({
  log,
  activity,
  logArrivals,
  selfId,
  roster,
  beat,
}: {
  log: LogEntry[];
  activity: ActivityLine[];
  logArrivals: Record<number, number>;
  selfId: string;
  roster: Record<string, string>;
  beat: LogEntry | undefined;
}) {
  const { t, cardName } = useLocale();
  const ctx: LogContext = { selfId, roster, t, cardName };
  const merged = mergeLog(log, activity, logArrivals);
  const strip = beat ?? merged[0]?.entry;
  const stripRank = strip !== undefined ? entryRank(strip) : undefined;
  return (
    <details className="panel log-panel">
      <summary className="log-strip">
        {stripRank !== undefined && <CardThumb rank={stripRank} className="log-thumb" />}
        <span className={`log-strip-text ${strip === undefined ? 'muted' : ''}`}>
          {strip !== undefined ? formatLogEntry(strip, ctx) : t('game.logEmpty')}
        </span>
      </summary>
      <ul className="log">
        {merged.map(({ key, entry }) => (
          <li key={key} className={`log-${entry.kind}`}>
            {formatLogEntry(entry, ctx)}
          </li>
        ))}
      </ul>
    </details>
  );
}
