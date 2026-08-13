import { useEffect, useRef, useState } from 'react';
import type { Card, ChatMessage, Choice, LogEntry, PendingChoice, PlayerView, Rank, ViewState } from '@love-letter/core';
import type { Game } from '../useGame';
import { useLocale, joinLocalizedList } from '../i18n';
import { formatLogEntry, entryRank, mergeLog, type ActivityLine, type LogContext } from '../i18n/logFormat';
import { endEntryOf } from '../scenes';
import { PlayScenes, usePlayScenes } from './PlayScenes';

/**
 * The game screen (ticket 33): a fixed `100dvh` stage that never scrolls —
 * the scene animations are always in view. One merged top bar (log strip +
 * room/round/deck + manual + leave) caps a flex column; the middle band
 * holds the seats as a tabletop ring around the center table; the hand
 * docks at the bottom with the choice panel in a slot above it that never
 * covers the seats. The full log history, the manual, and the round/match
 * end cards are overlays; the middle band is the only scrollable region —
 * the documented last resort (4 players on a tiny phone).
 */
export function Game({ view, selfId, game }: { view: ViewState; selfId: string; game: Game }) {
  const { t } = useLocale();
  const scenes = usePlayScenes(view.log, selfId, view.roster, view.hand.map((c) => c.rank));
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentTurn === selfId;
  const isTurn = myTurn && view.phase === 'round';
  // Ticket 24: the round waits — the hand stays disabled until the scene
  // queue drains, so nobody acts over a resolution that is still animating.
  const canPlay = view.phase === 'round' && myTurn && view.pendingChoice === null && !scenes.busy;
  const myChoice = view.pendingChoice !== null && view.pendingChoice.playerId === selfId;

  // Ticket 37: the round/match-end overlays wait for the story — the win
  // panel appears only once the final scene and the win banner have drained
  // (ADR-0007: the win banner always follows the final scene, never
  // interrupting it). `busy` alone would flash the panel for one frame: the
  // phase flips on the round entry's render, but the banner enqueues a
  // frame later (effects run post-render). `reachedEndId` — the round/match
  // entry the story has reached (its banner enqueued, or the entry skipped
  // by reduced motion / the mount baseline) — closes that frame; reduced
  // motion and reconnect never enqueue, so the story has reached the entry
  // trivially and the panel appears immediately. `endEntryId` is absent
  // only on a resumed tab (the snapshot's log is empty — the reducer skips
  // the replayed events it already covers), where the story never narrates
  // the phase: nothing to wait for, so `busy` is the only gate.
  const endEntryId = endEntryOf(view.log)?.id;
  const endStoryDone = !scenes.busy && (endEntryId === undefined || scenes.reachedEndId === endEntryId);

  // Ticket 35: the Guard's tap-the-seat first step — the chosen target stays
  // local until a card chip is tapped (tap another lit seat to switch).
  const [guardTarget, setGuardTarget] = useState<string | null>(null);
  useEffect(() => setGuardTarget(null), [view.pendingChoice, view.phase]);

  /** Ticket 35: a tap on a lit seat — non-Guard choices send immediately; the
   *  Guard records the target and waits for the card chip. Ignored while a
   *  scene animates (ticket 24: the round waits for the queue to drain). */
  const pickTarget = (id: string) => {
    const pc = view.pendingChoice;
    if (pc === null || pc.playerId !== selfId || !pc.targets.includes(id) || scenes.busy) return;
    if (pc.kind === 'guard') setGuardTarget(id);
    else game.sendChoice({ kind: pc.kind, targetPlayerId: id });
  };
  const choiceTargets =
    view.pendingChoice !== null && view.pendingChoice.playerId === selfId ? view.pendingChoice.targets : [];

  // Ticket 25: selecting a hand card is a pending local choice — regret
  // before the send. The selection resets whenever the world changes under
  // it: the turn passes, a pending choice opens, the phase moves, or the
  // hand itself reshapes (a stale index would highlight the wrong card).
  const [selected, setSelected] = useState<number | null>(null);
  const handKey = view.hand.map((c) => `${c.rank}:${c.name}`).join(',');
  useEffect(() => setSelected(null), [handKey, view.currentTurn, view.pendingChoice, view.phase]);

  // Ticket 28 + 36: the drawer's own draw pops the new card in the hand — a
  // pure CSS moment, no scene, no round pause. Ticket 36: the pop waits for
  // the previous play's scene to fully drain, so it never overlaps the
  // still-animating turn (the effect re-fires when `scenes.busy` clears).
  const [popRank, setPopRank] = useState<Rank | null>(null);
  const drawSeq = game.lastDraw?.seq ?? 0;
  useEffect(() => {
    if (game.lastDraw === null || scenes.busy) return;
    setPopRank(game.lastDraw.rank);
    const timer = setTimeout(() => setPopRank(null), 600);
    return () => clearTimeout(timer);
  }, [drawSeq, scenes.busy]);
  const [deckPulse, setDeckPulse] = useState(0);
  useEffect(() => setDeckPulse((n) => n + 1), [view.deckCount]);

  // Ticket 33: the overlays — the log history and the manual are modals
  // (Esc closes either; the chat dialog owns its own Esc, ticket 29).
  const [logOpen, setLogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    if (!logOpen && !manualOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLogOpen(false);
        setManualOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logOpen, manualOpen]);

  const playerName = (id: string) =>
    id === selfId ? t('common.you') : (view.players.find((p) => p.id === id)?.name ?? id);

  const leave = () => {
    if (window.confirm(t('common.leaveConfirm'))) game.sendLeave();
  };

  return (
    <>
      <div className="screen game">
        <header className="stage-top">
          <LogStrip
            log={view.log}
            activity={game.activity}
            logArrivals={game.logArrivals}
            selfId={selfId}
            roster={view.roster}
            beat={scenes.currentEntry}
            onOpen={() => setLogOpen(true)}
          />
          <div className="top-meta">
            <span className="meta-room">{t('game.room', { code: view.roomCode })}</span>
            <span className="meta-round">{t('game.round', { number: view.roundNumber })}</span>
            <span key={`deck${deckPulse}`} className="deck-count meta-deck">
              {t('game.deck', { count: view.deckCount })}
            </span>
          </div>
          <button className="manual-button" onClick={() => setManualOpen(true)}>
            {t('game.manual')}
          </button>
          <button className="leave-button" onClick={leave}>
            {t('game.leaveGame')}
          </button>
        </header>

        {/* The middle band — the only flexible region; internal scroll is the
            documented last resort (4 players on a tiny phone, or a pending
            choice pushing the ring). The top bar and the dock never leave
            the viewport. */}
        <div className="stage-band">
          <TableRing
            view={view}
            selfId={selfId}
            away={game.away}
            deckPulse={deckPulse}
            choiceTargets={choiceTargets}
            guardTarget={guardTarget}
            onPickTarget={pickTarget}
            choiceLocked={scenes.busy}
          />
        </div>

        <div className="stage-bottom">
          {/* Ticket 35: the choice slot holds only a thin hint line (or the
              Guard's card-name chips) — the targets themselves are the lit
              seats, so the band never gives way during a choice. */}
          <div className="choice-slot">
            {view.pendingChoice && (
              <ChoicePanel
                pendingChoice={view.pendingChoice}
                selfId={selfId}
                players={view.players}
                guardTarget={guardTarget}
                onChoice={game.sendChoice}
                disabled={scenes.busy}
              />
            )}
          </div>

          {/* Ticket 35: the dock IS the viewer's seat — the full seat row
              (name / tokens / badges / own pile / hand count) above the
              hand. It keeps the `.seat` + `data-player-id` hooks so the card
              scenes anchor to it, and lights up as a choice target for the
              rare forced self-Prince. */}
          <div
            className={`dock-seat seat me ${isTurn ? 'turn' : ''} ${me?.out ? 'out' : ''} ${
              choiceTargets.includes(selfId) && !scenes.busy ? 'chooseable' : ''
            }`}
            data-player-id={selfId}
            onClick={
              choiceTargets.includes(selfId) && !scenes.busy ? () => pickTarget(selfId) : undefined
            }
          >
            <div className="seat-row">
              <span className="name" title={t('common.you')}>{t('common.you')}</span>
              <span className="tokens" title={t('table.tokensTitle')}>
                ♥ {me?.tokens ?? 0} / {view.tokenTarget}
              </span>
              {isTurn && <span className="turn-badge">{t('table.turn')}</span>}
              {me?.protected && <span className="badge protected-badge">{t('table.protected')}</span>}
              {me?.out && <span className="badge out-badge">{t('table.out')}</span>}
              {me && <SeatCards discardPile={me.discardPile} handCount={me.handCount} />}
            </div>
            <div className="hand-dock">
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
                    onSelect={() => setSelected(selected === i ? null : i)}
                    onPlay={() => {
                      const which = i as 0 | 1;
                      setSelected(null);
                      game.sendPlayCard(which);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ticket 33: the round/match end panels are centered overlay cards
            ("Start next round" / "Rematch"); the top bar stays above them so
            leave/manual/log stay reachable. Ticket 37: they wait for the
            story — the panel exists only after the final scene + banner
            drained, so it never covers the story and "Start next round"
            cannot be clicked mid-story. */}
        {view.phase === 'roundEnded' && endStoryDone && (
          <div className="overlay round-end-overlay">
            <div className="panel round-over">
              <p>
                <strong>{joinLocalizedList(view.roundWinnerIds.map((id) => playerName(id)), t)}</strong>{' '}
                {t('game.roundWonTail')}
              </p>
              <button onClick={game.sendNextRound}>{t('game.startNextRound')}</button>
            </div>
          </div>
        )}

        {view.phase === 'matchEnded' && view.matchWinnerId && endStoryDone && (
          <div className="overlay match-end-overlay">
            <div className="panel match-over">
              <h2>{t('game.matchWon', { name: playerName(view.matchWinnerId) })}</h2>
              <p>{t('game.matchRematch', { count: view.tokenTarget })}</p>
              <button onClick={game.sendRematch}>{t('game.rematch')}</button>
            </div>
          </div>
        )}

        <LogModal
          open={logOpen}
          onClose={() => setLogOpen(false)}
          log={view.log}
          activity={game.activity}
          logArrivals={game.logArrivals}
          selfId={selfId}
          roster={view.roster}
        />

        <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />

        <PlayScenes scenes={scenes} selfId={selfId} roster={view.roster} />
      </div>

      <ChatDialog chat={game.chat} selfId={selfId} onSend={game.sendChat} />

      {/* Ticket 33: phones lock to portrait — on a narrow landscape viewport
          the stage is replaced by a rotate notice (CSS-only, App-agnostic). */}
      <div className="rotate-notice" aria-hidden="true">
        <span className="rotate-icon">↻</span>
        <p className="rotate-title">{t('game.rotateTitle')}</p>
        <p className="rotate-hint muted">{t('game.rotateHint')}</p>
      </div>
    </>
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

/**
 * One hand card. Ticket 35: the top-right rank badge is gone (the art carries
 * the rank numeral); selecting a playable card raises a small Play chip in
 * that corner — one tap confirms, tapping the card again or another card
 * switches/deselects (the ticket-25 regret survives).
 */
/** The cards row of a seat — the face-up discard pile + hand count side by
 *  side. Shared by the ring tiles and the viewer's dock (ticket 35) so the
 *  two never drift. */
function SeatCards({ discardPile, handCount }: { discardPile: Card[]; handCount: number }) {
  const { t } = useLocale();
  return (
    <span className="seat-cards">
      {discardPile.length === 0 ? (
        <span className="muted pile-empty">—</span>
      ) : (
        <span className="pile" title={t('table.discards', { count: discardPile.length })}>
          {discardPile.map((c, i) => (
            <CardThumb key={i} rank={c.rank} />
          ))}
        </span>
      )}
      <span className="hand-info" title={t('table.handTitle', { count: handCount })}>
        <span className="hand-backs">
          {Array.from({ length: handCount }).map((_, i) => (
            <img key={i} src="/cards/back-light.png" alt="" className="hand-back" draggable={false} />
          ))}
        </span>
        <span className={`hand-count ${handCount === 0 ? 'zero' : ''}`}>{handCount}</span>
      </span>
    </span>
  );
}

function CardView({ card, playable, selected, drawn, onSelect, onPlay }: { card: Card; playable: boolean; selected: boolean; drawn: boolean; onSelect: () => void; onPlay: () => void }) {
  const { cardName, t } = useLocale();
  return (
    <div className="card-slot">
      <button
        className={`card art ${playable ? 'playable' : ''} ${selected ? 'selected' : ''} ${drawn ? 'drawn' : ''}`}
        onClick={onSelect}
        disabled={!playable}
      >
        <CardThumb rank={card.rank} />
        <span className="name-caption">{cardName(card.rank)}</span>
      </button>
      {playable && selected && (
        <button className="play-chip" onClick={onPlay}>
          {t('game.playChip')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket 33: the tabletop ring
// ---------------------------------------------------------------------------

/** The opponents' seats across the top, around the center table. While the
 *  viewer holds a pending choice, the legal target seats light up
 *  (tap-the-seat, ticket 35) and a tap resolves it. */
function TableRing({
  view,
  selfId,
  away,
  deckPulse,
  choiceTargets,
  guardTarget,
  onPickTarget,
  choiceLocked,
}: {
  view: ViewState;
  selfId: string;
  away: string[];
  deckPulse: number;
  choiceTargets: string[];
  guardTarget: string | null;
  onPickTarget: (id: string) => void;
  choiceLocked: boolean;
}) {
  const others = view.players.filter((p) => p.id !== selfId);
  const layout = RING_LAYOUTS[others.length] ?? RING_LAYOUTS[1]!;
  return (
    <div className={`tabletop ${layout.className}`}>
      {others.map((p, i) => (
        <SeatTile
          key={p.id}
          player={p}
          view={view}
          away={away}
          position={layout.positions[i]!}
          chooseable={choiceTargets.includes(p.id) && !choiceLocked}
          chosen={guardTarget === p.id}
          onPick={() => onPickTarget(p.id)}
        />
      ))}
      <CenterTable view={view} deckPulse={deckPulse} />
    </div>
  );
}

/** One layout per opponent count — the viewer is always the dock (ticket 35),
 *  so the ring holds only opponents: 1 across (2p duel), 2 corners (3p),
 *  three across (4p). The class names keep the game-size vocabulary the
 *  smoke asserts (.duel for 2p). */
const RING_LAYOUTS: Record<number, { positions: string[]; className: string }> = {
  1: { positions: ['pos-top'], className: 'duel' },
  2: { positions: ['pos-tl', 'pos-tr'], className: 'three' },
  3: { positions: ['pos-tl', 'pos-top', 'pos-tr'], className: 'four' },
};

/**
 * One seat tile: name / hearts (tokens) / turn / protected / out / face-up
 * discards (an overlapping, shadowed pile — the raw material of deduction)
 * and how many cards they still hold (face-down backs plus an explicit
 * count). Tiles compress (smaller pile thumbs, ~2.2rem) to fit the band.
 */
function SeatTile({
  player: p,
  view,
  away,
  position,
  chooseable,
  chosen,
  onPick,
}: {
  player: PlayerView;
  view: ViewState;
  away: string[];
  position: string;
  chooseable: boolean;
  chosen: boolean;
  onPick: () => void;
}) {
  const { t } = useLocale();
  const isTurn = view.currentTurn === p.id && view.phase === 'round';
  return (
    <div
      data-player-id={p.id}
      className={`seat ${position} ${p.out ? 'out' : ''} ${isTurn ? 'turn' : ''} ${chooseable ? 'chooseable' : ''} ${chosen ? 'chosen' : ''}`}
      onClick={chooseable ? onPick : undefined}
    >
      {/* Ticket 36: the header — name, hearts, and badges share one line
          (wrapping on narrow tiles) so the tile stays short on phones. */}
      <div className="seat-head">
        <span className="name" title={p.name}>
          {p.name}
        </span>
        <span className="tokens" title={t('table.tokensTitle')}>♥ {p.tokens} / {view.tokenTarget}</span>
        {isTurn && <span className="turn-badge">{t('table.turn')}</span>}
        {p.protected && <span className="badge">{t('table.protected')}</span>}
        {p.out && <span className="badge out-badge">{t('table.out')}</span>}
        {away.includes(p.id) && <span className="badge away-badge">{t('table.reconnecting')}</span>}
      </div>
      {/* The cards row: face-up discards + the hand count side by side, so
          the tile stays short enough for the ring to fit the band. */}
      <SeatCards discardPile={p.discardPile} handCount={p.handCount} />
    </div>
  );
}

/**
 * The center table (ticket 33, Q8): the deck as a physical card-back stack
 * with its count (the ticket-28 draw anchor), the face-down burned card, and
 * the 2-player face-up removals as real card thumbs. Ticket 36: one compact
 * horizontal row — the text labels are gone (the tooltips and the manual
 * carry that info), so the row takes a fraction of the band's height.
 */
function CenterTable({ view, deckPulse }: { view: ViewState; deckPulse: number }) {
  const { t } = useLocale();
  return (
    <div className="center-table">
      <div className="deck" title={t('game.deck', { count: view.deckCount })}>
        <img src="/cards/back-light.png" alt="" className="deck-back" draggable={false} />
        <span key={`tableDeck${deckPulse}`} className="deck-count deck-total">
          {view.deckCount}
        </span>
      </div>
      {view.burnedCount > 0 && view.phase === 'round' && (
        <div className="burned" title={t('game.burned')}>
          <img src="/cards/back-light.png" alt="" className="card-back burned-back" draggable={false} />
        </div>
      )}
      {view.faceUpRemoved.length > 0 && (
        <div className="face-up" title={t('game.faceUp')}>
          {view.faceUpRemoved.map((c, i) => (
            <CardThumb key={i} rank={c.rank} className="face-up-thumb" />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket 33: the log — a strip in the top bar + a full-history modal
// ---------------------------------------------------------------------------

/**
 * The latest-event strip (issue 19 + 21, now merged into the top bar,
 * ticket 33): the newest entry rendered with a mini card thumbnail when it
 * carries a rank; tappable → the full-log modal. Room-layer status lines
 * (disconnects/reconnects, issue 11) ride along with it. Entries are
 * structured (ADR-0003); `formatLogEntry` renders them in the viewer's
 * locale.
 *
 * Ticket 24: while a scene animates, the strip shows the **beat** — the log
 * entry the current scene narrates — so it never races ahead of the
 * animation. Idle or reduced-motion → the newest entry by socket arrival,
 * exactly as before.
 */
function LogStrip({
  log,
  activity,
  logArrivals,
  selfId,
  roster,
  beat,
  onOpen,
}: {
  log: LogEntry[];
  activity: ActivityLine[];
  logArrivals: Record<number, number>;
  selfId: string;
  roster: Record<string, string>;
  beat: LogEntry | undefined;
  onOpen: () => void;
}) {
  const { t, cardName } = useLocale();
  const ctx: LogContext = { selfId, roster, t, cardName };
  const merged = mergeLog(log, activity, logArrivals);
  const strip = beat ?? merged[0]?.entry;
  const stripRank = strip !== undefined ? entryRank(strip) : undefined;
  return (
    <button className="log-strip" onClick={onOpen} title={t('game.logTitle')} aria-label={t('game.logTitle')}>
      {stripRank !== undefined && <CardThumb rank={stripRank} className="log-thumb" />}
      <span className={`log-strip-text ${strip === undefined ? 'muted' : ''}`}>
        {strip !== undefined ? formatLogEntry(strip, ctx) : t('game.logEmpty')}
      </span>
    </button>
  );
}

/**
 * The full newest-first history as a centered modal (ticket 33 — the old
 * in-place `<details>` expansion is gone; the strip stays, the history
 * floats). The list stays in the DOM (hidden when closed) so the strip and
 * the modal always agree; the modal closes on outside click / Esc / the
 * close button, and fills the viewport on phones (the chat precedent).
 */
function LogModal({
  open,
  onClose,
  log,
  activity,
  logArrivals,
  selfId,
  roster,
}: {
  open: boolean;
  onClose: () => void;
  log: LogEntry[];
  activity: ActivityLine[];
  logArrivals: Record<number, number>;
  selfId: string;
  roster: Record<string, string>;
}) {
  const { t, cardName } = useLocale();
  const ctx: LogContext = { selfId, roster, t, cardName };
  const merged = mergeLog(log, activity, logArrivals);
  return (
    <div
      className={`overlay log-modal ${open ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('game.logTitle')}
      onClick={onClose}
    >
      <div className="log-dialog panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-header">
          <p className="panel-title">{t('game.logTitle')}</p>
          <button className="chat-close" onClick={onClose} aria-label={t('chat.close')}>
            ×
          </button>
        </div>
        <ul className="log">
          {merged.map(({ key, entry }) => (
            <li key={key} className={`log-${entry.kind}`}>
              {formatLogEntry(entry, ctx)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The eight cards, rank / name / effect (the manual's second section). */
function CardAbilityList() {
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
  const { t, cardName, cardEffect } = useLocale();
  return (
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
  );
}

/**
 * The rules manual (ticket 34): one popup with three sections — ① quick
 * rules, ② the eight cards (rank / name / effect), ③ the four adopted
 * rulings (Q17, ADR-0001) — the rules that change how you must play but
 * appear on no card face. Localized en + zh (ADR-0004). Opens from the
 * top bar's Manual button (ticket 33); the old Abilities `<details>` panel
 * (ticket 12) is deleted. Closes on outside click / Esc / the close button
 * and fills the viewport on phones (the chat/log precedent).
 */
function ManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  if (!open) return null;
  return (
    <div
      className="overlay manual-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('manual.title')}
      onClick={onClose}
    >
      <div className="manual-dialog panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-header">
          <p className="panel-title">{t('manual.title')}</p>
          <button className="chat-close" onClick={onClose} aria-label={t('chat.close')}>
            ×
          </button>
        </div>
        <div className="manual-body">
          <section className="manual-section quick-rules">
            <h3 className="manual-heading">{t('manual.quickRules')}</h3>
            <ul className="manual-list">
              <li>{t('manual.rule.setup')}</li>
              <li>{t('manual.rule.turn')}</li>
              <li>{t('manual.rule.countess')}</li>
              <li>{t('manual.rule.protected')}</li>
              <li>{t('manual.rule.roundEnd')}</li>
              <li>{t('manual.rule.tokens')}</li>
              <li>{t('manual.rule.burned')}</li>
            </ul>
          </section>
          <section className="manual-section cards-section">
            <h3 className="manual-heading">{t('manual.cards')}</h3>
            <CardAbilityList />
          </section>
          <section className="manual-section rulings-section">
            <h3 className="manual-heading">{t('manual.rulings')}</h3>
            <ul className="manual-list rulings">
              <li>{t('manual.ruling.selfGuard')}</li>
              <li>{t('manual.ruling.tie')}</li>
              <li>{t('manual.ruling.countessTrade')}</li>
              <li>{t('manual.ruling.princeBurned')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Chat as a floating pill + modal dialog (issue 20): a fixed bottom-right
 * pill previews the newest message inline (or a muted "Chat" when empty) and
 * carries an unread-count badge that grows while the dialog is closed and
 * clears on open. Clicking the pill opens a modal with the message list and
 * input; it closes on outside click, Esc, or send (grilling Q12–Q15).
 * Ticket 33: the pill floats above the round/match-end overlays (z 38) so
 * chat stays reachable between rounds.
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
 * Ticket 35: the choice UI is tap-the-seat — the slot holds a thin hint line
 * (or the Guard's card-name chips); the targets themselves are the lit seats
 * in the ring (and the dock, for a forced self-Prince). Others' pending
 * choices render as a thin muted line.
 */
function ChoicePanel({
  pendingChoice,
  selfId,
  players,
  guardTarget,
  onChoice,
  disabled,
}: {
  pendingChoice: PendingChoice;
  selfId: string;
  players: PlayerView[];
  guardTarget: string | null;
  onChoice: (choice: Choice) => void;
  disabled: boolean;
}) {
  const { t, cardName } = useLocale();

  if (pendingChoice.playerId !== selfId) {
    const chooser = players.find((p) => p.id === pendingChoice.playerId)?.name ?? t('choice.someone');
    return <p className="choice-hint muted">{t('choice.choosing', { name: chooser })}</p>;
  }

  if (pendingChoice.kind !== 'guard') {
    const label: Record<'priest' | 'baron' | 'prince' | 'king', string> = {
      priest: t('choice.priest'),
      baron: t('choice.baron'),
      prince: t('choice.prince'),
      king: t('choice.king'),
    };
    return <p className="choice-hint">{label[pendingChoice.kind]}</p>;
  }

  // Guard: step 1 is a tap on a lit seat (the hint); step 2 names the card.
  if (guardTarget === null) {
    return <p className="choice-hint">{t('choice.guard')}</p>;
  }
  return (
    <div className="choice-stack">
      <p className="choice-hint">{t('choice.guardRank')}</p>
      <div className="choice-chips">
        {pendingChoice.namedOptions.map((rank) => (
          <button
            key={rank}
            disabled={disabled}
            onClick={() => onChoice({ kind: 'guard', targetPlayerId: guardTarget, namedRank: rank })}
          >
            {cardName(rank)}
          </button>
        ))}
      </div>
    </div>
  );
}
