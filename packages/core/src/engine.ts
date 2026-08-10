/**
 * The rules engine: `apply(state, intent)` validates an intent, resolves the
 * resulting effects step-by-step, and returns `{ state, events[] }`. Illegal
 * intents are rejected with a human-readable error — never guessed at.
 *
 * All eight cards resolve here (ticket 03): Guard/Priest/Baron/King and
 * Prince ask for a target (and the Guard a card name) via `pendingChoice`;
 * Handmaid protects; the Countess forces an immediate discard while holding
 * the King/Prince; the Princess eliminates whoever discards her.
 *
 * The engine is deterministic: all randomness flows through the injected
 * `rng`, and `apply` clones the incoming state before mutating, so callers
 * keep their previous reference untouched.
 */

import { buildDeck, forcedDiscard } from './cards.js';
import { shuffle } from './random.js';
import type {
  Card,
  Choice,
  EliminationReason,
  Event,
  GameState,
  Intent,
  PendingChoice,
  PlayerState,
  Rank,
  TargetKind,
} from './types.js';

export type ApplyResult =
  | { ok: true; state: GameState; events: Event[] }
  | { ok: false; error: string };

/** Tokens needed to win the match at each player count (rules spec §7). */
export function defaultTokenTarget(capacity: number): number {
  switch (capacity) {
    case 2: return 7;
    case 3: return 5;
    case 4: return 4;
    default: throw new Error(`invalid capacity: ${capacity}`);
  }
}

const MAX_NAME_LENGTH = 20;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;
/** A Guard may name any card except the Guard itself (rules spec §4.1). */
const GUARD_NAMED_OPTIONS: Rank[] = [2, 3, 4, 5, 6, 7, 8];
/** Ranks whose combination with the Countess forces her discard (§4.7). */
const COUNTESS: Rank = 7;
const PRINCESS: Rank = 8;

/**
 * Validate and apply an intent to the state, returning the new state and the
 * events that describe the transition. `state` is null only for `createRoom`.
 */
export function apply(
  state: GameState | null,
  intent: Intent,
  rng: () => number = Math.random,
): ApplyResult {
  // Clone once so every helper can mutate freely and callers never see their
  // previous state change underneath them.
  const s = state === null ? null : structuredClone(state);
  if (intent.type === 'createRoom') return createRoom(s, intent);
  if (s === null) return err('room_missing'); // only createRoom starts from null
  switch (intent.type) {
    case 'joinRoom': return joinRoom(s, intent, rng);
    case 'playCard': return playCard(s, intent);
    case 'choice': return makeChoice(s, intent);
    case 'nextRound': return nextRound(s, intent, rng);
    case 'rematch': return rematch(s, intent, rng);
    case 'fold': return foldPlayer(s, intent);
    case 'leave': return leaveRoom(s, intent);
  }
}

function ok(state: GameState, events: Event[]): ApplyResult {
  return { ok: true, state, events };
}

function err(error: string): ApplyResult {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function createRoom(
  s: GameState | null,
  intent: Extract<Intent, { type: 'createRoom' }>,
): ApplyResult {
  if (s !== null) return err('room_already_exists');
  if (!ROOM_CODE_PATTERN.test(intent.roomCode)) return err('invalid_room_code');
  if (intent.capacity !== 2 && intent.capacity !== 3 && intent.capacity !== 4) {
    return err('invalid_capacity');
  }
  if (!validName(intent.playerName)) return err('invalid_player_name');

  const player = makePlayer(intent.playerId, intent.playerName);
  const state: GameState = {
    phase: 'lobby',
    roomCode: intent.roomCode,
    capacity: intent.capacity,
    tokenTarget: intent.tokenTarget ?? defaultTokenTarget(intent.capacity),
    players: [player],
    deck: [],
    burned: null,
    faceUpRemoved: [],
    currentTurn: null,
    pendingChoice: null,
    roundNumber: 0,
    roundWinnerIds: [],
    matchWinnerId: null,
  };
  return ok(state, [
    { type: 'roomCreated', roomCode: state.roomCode, capacity: state.capacity },
    { type: 'playerJoined', player: { id: player.id, name: player.name } },
  ]);
}

function joinRoom(
  s: GameState,
  intent: Extract<Intent, { type: 'joinRoom' }>,
  rng: () => number,
): ApplyResult {
  if (s.phase !== 'lobby') return err('room_already_started');
  if (s.players.length >= s.capacity) return err('room_full');
  if (!validName(intent.playerName)) return err('invalid_player_name');

  const player = makePlayer(intent.playerId, intent.playerName);
  s.players.push(player);
  const events: Event[] = [
    { type: 'playerJoined', player: { id: player.id, name: player.name } },
  ];

  // Auto-start when the room is full (DESIGN Q18).
  if (s.players.length === s.capacity) startRound(s, events, rng);

  return ok(s, events);
}

// ---------------------------------------------------------------------------
// Round: play a card / resolve a choice
// ---------------------------------------------------------------------------

function playCard(s: GameState, intent: Extract<Intent, { type: 'playCard' }>): ApplyResult {
  if (s.phase !== 'round') return err('not_in_round');
  if (s.pendingChoice !== null) return err('pending_choice_open');
  if (s.currentTurn !== intent.playerId) return err('not_your_turn');
  const actor = findPlayer(s, intent.playerId);
  if (!actor || actor.out) return err('out_of_round');
  if (intent.which !== 0 && intent.which !== 1) return err('invalid_hand_index');
  const card = actor.hand[intent.which];
  if (!card) return err('no_card_at_index');
  // The engine forces the Countess discard at every hand change, so this state
  // should never occur — but never play through an illegal hand (rules §4.7).
  if (forcedDiscard(actor.hand) !== null) return err('countess_forced');

  actor.hand.splice(intent.which, 1);
  actor.discardPile.push(card);
  const events: Event[] = [
    { type: 'cardPlayed', playerId: actor.id, which: intent.which, card },
  ];
  resolvePlayedCard(s, actor, card, events);
  return ok(s, events);
}

/**
 * Dispatch the played card's effect. Effects are mandatory, even when
 * self-destructive (rules spec §8.7). Cards that need a follow-up choice set
 * `pendingChoice`; the turn is not over until it resolves.
 */
function resolvePlayedCard(s: GameState, actor: PlayerState, card: Card, events: Event[]): void {
  switch (card.rank) {
    case 1: // Guard — name a target and a card
      chooseTarget(s, actor, card, events, 'guard');
      break;
    case 2: // Priest — look at one player's hand, chooser only
      chooseTarget(s, actor, card, events, 'priest');
      break;
    case 3: // Baron — compare hands, lower rank is out
      chooseTarget(s, actor, card, events, 'baron');
      break;
    case 4: // Handmaid — immune to others' cards until your next turn
      actor.protected = true;
      finishTurn(s, events);
      break;
    case 5: // Prince — target discards and draws
      chooseTarget(s, actor, card, events, 'prince');
      break;
    case 6: // King — trade hands
      chooseTarget(s, actor, card, events, 'king');
      break;
    case 7: // Countess — no effect when discarded
      finishTurn(s, events);
      break;
    case 8: // Princess — discarded for any reason → out of the round
      eliminate(s, actor.id, 'princess', events);
      finishTurn(s, events);
      break;
  }
}

/**
 * Compute the legal targets for a targeting card and, if any, store the
 * pending choice. With every other player protected these cards fizzle
 * (rules spec §5: Guard/Priest/Baron/King do nothing; only the Prince is
 * always actionable, because it may target yourself).
 */
function chooseTarget(
  s: GameState,
  actor: PlayerState,
  card: Card,
  events: Event[],
  kind: TargetKind,
): void {
  const targets = legalTargets(s, actor, kind);
  if (targets.length === 0) {
    events.push({ type: 'cardFizzled', playerId: actor.id, card });
    finishTurn(s, events);
    return;
  }
  const pendingChoice: PendingChoice =
    kind === 'guard'
      ? { kind: 'guard', playerId: actor.id, targets, namedOptions: GUARD_NAMED_OPTIONS }
      : { kind, playerId: actor.id, targets };
  s.pendingChoice = pendingChoice;
  events.push({ type: 'choiceRequired', playerId: actor.id, pendingChoice });
}

function legalTargets(
  s: GameState,
  actor: PlayerState,
  kind: TargetKind,
): string[] {
  switch (kind) {
    case 'prince':
      // Any in-round player, including yourself; a protected player blocks
      // everyone except their own Prince (rules spec §4.5, §5).
      return s.players
        .filter((p) => !p.out && (p.id === actor.id || !p.protected))
        .map((p) => p.id);
    case 'guard':
    case 'priest':
    case 'baron':
    case 'king':
      // These four target only other, unprotected players in the round.
      return s.players
        .filter((p) => !p.out && p.id !== actor.id && !p.protected)
        .map((p) => p.id);
  }
}

function makeChoice(s: GameState, intent: Extract<Intent, { type: 'choice' }>): ApplyResult {
  if (s.phase !== 'round') return err('not_in_round');
  const pc = s.pendingChoice;
  if (pc === null) return err('no_pending_choice');
  if (pc.playerId !== intent.playerId) return err('not_your_choice');
  if (pc.kind !== intent.choice.kind) return err('choice_mismatch');
  if (!pc.targets.includes(intent.choice.targetPlayerId)) return err('illegal_target');
  if (pc.kind === 'guard'
    && !pc.namedOptions.includes((intent.choice as Extract<Choice, { kind: 'guard' }>).namedRank)) {
    return err('illegal_named_card');
  }

  const events: Event[] = [{ type: 'choiceMade', playerId: pc.playerId, choice: intent.choice }];
  switch (pc.kind) {
    case 'guard':
      resolveGuardChoice(s, intent.choice as Extract<Choice, { kind: 'guard' }>, events);
      break;
    case 'priest':
      resolvePriestChoice(s, pc.playerId, intent.choice as Extract<Choice, { kind: 'priest' }>, events);
      break;
    case 'baron':
      resolveBaronChoice(s, pc.playerId, intent.choice as Extract<Choice, { kind: 'baron' }>, events);
      break;
    case 'prince':
      resolvePrinceChoice(s, intent.choice as Extract<Choice, { kind: 'prince' }>, events);
      break;
    case 'king':
      resolveKingChoice(s, pc.playerId, intent.choice as Extract<Choice, { kind: 'king' }>, events);
      break;
  }
  s.pendingChoice = null;
  finishTurn(s, events);
  return ok(s, events);
}

/** Guard: a correct guess eliminates the target and reveals their hand. */
function resolveGuardChoice(
  s: GameState,
  choice: Extract<Choice, { kind: 'guard' }>,
  events: Event[],
): void {
  const target = findPlayer(s, choice.targetPlayerId);
  if (target && target.hand.some((c) => c.rank === choice.namedRank)) {
    eliminate(s, target.id, 'guard', events);
  }
  // A wrong guess reveals nothing and changes nothing else.
}

/** Priest: the chooser alone sees the target's hand (rules spec §4.2). */
function resolvePriestChoice(
  s: GameState,
  chooserId: string,
  choice: Extract<Choice, { kind: 'priest' }>,
  events: Event[],
): void {
  const target = findPlayer(s, choice.targetPlayerId);
  if (!target) return;
  for (const card of target.hand) {
    // card is private: the server sends it only to the chooser.
    events.push({ type: 'handPeeked', playerId: chooserId, targetPlayerId: target.id, card });
  }
}

/** Baron: compare the remaining hands; lower rank is out, tie → nothing. */
function resolveBaronChoice(
  s: GameState,
  chooserId: string,
  choice: Extract<Choice, { kind: 'baron' }>,
  events: Event[],
): void {
  const actor = findPlayer(s, chooserId)!;
  const target = findPlayer(s, choice.targetPlayerId)!;
  const actorRank = Math.max(...actor.hand.map((c) => c.rank), 0);
  const targetRank = Math.max(...target.hand.map((c) => c.rank), 0);
  // A Baron can knock out the player who played it — effects are mandatory
  // even when self-destructive (rules spec §4.3, §8.7).
  if (actorRank < targetRank) eliminate(s, actor.id, 'baron', events);
  else if (targetRank < actorRank) eliminate(s, target.id, 'baron', events);
}

/**
 * Prince: the target discards their hand face up (no effect) and draws a new
 * card; on an empty deck the single burned card (ruling 4). Discarding the
 * Princess — no matter how or why — is an elimination with no replacement
 * draw (rules spec §8.2).
 */
function resolvePrinceChoice(
  s: GameState,
  choice: Extract<Choice, { kind: 'prince' }>,
  events: Event[],
): void {
  const target = findPlayer(s, choice.targetPlayerId)!;
  const discarded = target.hand;
  target.hand = [];
  for (const card of discarded) {
    target.discardPile.push(card);
    events.push({ type: 'cardDiscarded', playerId: target.id, card, reason: 'prince' });
  }
  if (discarded.some((c) => c.rank === PRINCESS)) {
    target.out = true;
    events.push({ type: 'playerEliminated', playerId: target.id, reason: 'princess' });
    return;
  }
  const drawn = drawCard(s);
  if (drawn !== null) {
    target.hand.push(drawn);
    events.push({ type: 'cardDrawn', playerId: target.id, card: drawn });
    enforceCountess(s, target.id, events);
  }
}

/**
 * King: swap hands — a trade is not a discard, so the Princess may change
 * hands freely. A King/Prince received while holding the Countess forces her
 * immediate discard (ruling 2), checked for both players after the swap.
 */
function resolveKingChoice(
  s: GameState,
  chooserId: string,
  choice: Extract<Choice, { kind: 'king' }>,
  events: Event[],
): void {
  const actor = findPlayer(s, chooserId)!;
  const target = findPlayer(s, choice.targetPlayerId)!;
  const tmp = actor.hand;
  actor.hand = target.hand;
  target.hand = tmp;
  // Each trader learns the card they received; others only see that a trade
  // happened (the card payload is private, like deals and draws).
  for (const [id, hand] of [[actor.id, actor.hand], [target.id, target.hand]] as const) {
    events.push({ type: 'handTraded', playerId: id, card: hand[0] ?? null, count: hand.length });
  }
  enforceCountess(s, actor.id, events);
  enforceCountess(s, target.id, events);
}

// ---------------------------------------------------------------------------
// Turn / round lifecycle
// ---------------------------------------------------------------------------

/**
 * The turn is over (a card was played and any follow-up resolved). Either the
 * round ends — last player standing, or the deck empty at end of turn — or the
 * turn passes to the next player in the round, who draws a card.
 */
function finishTurn(s: GameState, events: Event[]): void {
  const inRound = s.players.filter((p) => !p.out);
  if (inRound.length === 1) {
    endRound(s, events, [inRound[0]!.id], 'last-standing');
    return;
  }
  if (s.deck.length === 0) {
    // Deck empty at the end of a turn: everyone still in the round reveals
    // their hands; the highest hand wins (tie → higher total discarded).
    // Compute the winner from the intact hands before revealing them.
    const winners = highestHandWinners(inRound);
    for (const p of inRound) {
      const card = p.hand.shift();
      if (card) {
        p.discardPile.push(card);
        events.push({ type: 'handRevealed', playerId: p.id, card });
      }
    }
    endRound(s, events, winners, 'highest-hand');
    return;
  }

  const nextId = nextInRound(s, s.currentTurn!);
  s.currentTurn = nextId;
  const next = findPlayer(s, nextId)!;
  // Handmaid immunity ends at the start of your next turn (rules spec §8.3).
  next.protected = false;
  events.push({ type: 'turnStarted', playerId: nextId });
  const drawn = s.deck.shift()!;
  next.hand.push(drawn);
  events.push({ type: 'cardDrawn', playerId: nextId, card: drawn });
  // Drawing the King/Prince while holding the Countess forces her discard
  // immediately (rules spec §4.7).
  enforceCountess(s, nextId, events);
}

/**
 * Award the round: every winner gets a token; if any winner reaches the match
 * target the match ends. Match winner when several players reach the target in
 * the same round (only possible via a full tie, ruling 1): the first winner in
 * seat order — see docs/adr/0002.
 */
function endRound(
  s: GameState,
  events: Event[],
  winnerIds: string[],
  reason: 'last-standing' | 'highest-hand',
): void {
  for (const id of winnerIds) findPlayer(s, id)!.tokens += 1;
  s.roundWinnerIds = winnerIds;
  s.currentTurn = null;
  s.pendingChoice = null;
  events.push({ type: 'roundEnded', winnerIds, reason });

  const matchWinner = winnerIds.find((id) => findPlayer(s, id)!.tokens >= s.tokenTarget);
  if (matchWinner) {
    s.phase = 'matchEnded';
    s.matchWinnerId = matchWinner;
    events.push({ type: 'matchEnded', winnerId: matchWinner });
  } else {
    s.phase = 'roundEnded';
  }
}

/** Highest hand at deck-empty; tie → higher total of discarded values. */
function highestHandWinners(inRound: PlayerState[]): string[] {
  const handRank = (p: PlayerState) => Math.max(...p.hand.map((c) => c.rank), 0);
  const discardTotal = (p: PlayerState) => p.discardPile.reduce((sum, c) => sum + c.rank, 0);
  const bestHand = Math.max(...inRound.map(handRank));
  const topHand = inRound.filter((p) => handRank(p) === bestHand);
  if (topHand.length === 1) return [topHand[0]!.id];
  const bestDiscard = Math.max(...topHand.map(discardTotal));
  const topDiscard = topHand.filter((p) => discardTotal(p) === bestDiscard);
  // Full tie (equal hand value and equal discard totals): all tied players
  // get a token (ruling 1).
  return topDiscard.map((p) => p.id);
}

function nextRound(s: GameState, _intent: Extract<Intent, { type: 'nextRound' }>, rng: () => number): ApplyResult {
  if (s.phase !== 'roundEnded') return err('no_round_to_start');
  const events: Event[] = [];
  startRound(s, events, rng);
  return ok(s, events);
}

function rematch(s: GameState, _intent: Extract<Intent, { type: 'rematch' }>, rng: () => number): ApplyResult {
  if (s.phase !== 'matchEnded') return err('match_not_over');
  // Same seats, fresh match: tokens reset, every round-only field cleared.
  for (const p of s.players) {
    p.tokens = 0;
    p.out = false;
    p.protected = false;
    p.discardPile = [];
    p.hand = [];
  }
  s.roundNumber = 0;
  s.matchWinnerId = null;
  s.roundWinnerIds = [];
  s.deck = [];
  s.burned = null;
  s.faceUpRemoved = [];
  const events: Event[] = [{ type: 'rematchStarted' }];
  startRound(s, events, rng);
  return ok(s, events);
}

/**
 * Auto-fold a dropped player (DESIGN Q12, ticket 05): the server issues this
 * on their behalf when their turn comes and their grace window has expired.
 * The folded player is out of the round — their hand is revealed like any
 * other elimination — and their seat stays for the next round. An open
 * pending choice (their turn's card effect) is abandoned.
 *
 * Refused only when they are the last player in the round: folding them would
 * leave nobody to end the round. The server reacts by scheduling the room's
 * expiry (one more grace window to return, then the room is reclaimed).
 */
function foldPlayer(s: GameState, intent: Extract<Intent, { type: 'fold' }>): ApplyResult {
  if (s.phase !== 'round') return err('no_round_in_progress');
  if (s.currentTurn !== intent.playerId) return err('fold_turn_owner_only');
  const player = findPlayer(s, intent.playerId);
  if (!player || player.out) return err('player_not_in_round');
  const others = s.players.filter((p) => !p.out && p.id !== intent.playerId);
  if (others.length === 0) return err('fold_last_player');

  const events: Event[] = [];
  if (s.pendingChoice !== null) {
    s.pendingChoice = null;
    events.push({ type: 'choiceAbandoned', playerId: intent.playerId });
  }
  eliminate(s, intent.playerId, 'fold', events);
  finishTurn(s, events);
  return ok(s, events);
}

/**
 * Intentional leave (issue 11): the player is gone for good — the seat is
 * removed, not held. In the lobby the room can refill; mid-match (3+ seats)
 * the leaver's hand is revealed like any elimination, an open choice of
 * theirs is abandoned, and the turn passes on (or the round ends) as if the
 * turn owner had finished. A match that would drop below two seats is
 * rejected: the server tears the room down with a `roomClosed` message
 * instead of asking the engine.
 */
function leaveRoom(s: GameState, intent: Extract<Intent, { type: 'leave' }>): ApplyResult {
  const idx = s.players.findIndex((p) => p.id === intent.playerId);
  if (idx === -1) return err('player_not_in_room');
  const player = s.players[idx]!;
  const events: Event[] = [];

  if (s.phase === 'lobby') {
    s.players.splice(idx, 1);
    events.push({ type: 'playerLeft', playerId: player.id, name: player.name });
    return ok(s, events);
  }

  if (s.players.length <= 2) return err('room_needs_two');

  // An open follow-up choice of theirs is void (same as a fold).
  if (s.pendingChoice?.playerId === player.id) {
    s.pendingChoice = null;
    events.push({ type: 'choiceAbandoned', playerId: player.id });
  }

  // Reveal the leaver's hand like any elimination; the seat then leaves.
  const revealed = player.hand;
  player.hand = [];
  player.discardPile.push(...revealed);
  for (const card of revealed) {
    events.push({ type: 'handRevealed', playerId: player.id, card });
  }

  // A turn owner who vanishes mid-turn resolves exactly like a fold: the
  // leaver counts as out, so `finishTurn` ends the round (last-standing or
  // highest-hand on an empty deck) or passes the turn to the next in-round
  // seat without breaking seat order.
  const heldTurn = s.currentTurn === player.id;
  player.out = true;
  if (heldTurn) finishTurn(s, events);

  // A round winner who leaves between rounds must not anchor the next
  // round's first turn (startRound falls back to the first seat).
  s.roundWinnerIds = s.roundWinnerIds.filter((id) => id !== player.id);
  s.players.splice(idx, 1);
  events.push({ type: 'playerLeft', playerId: player.id, name: player.name });

  return ok(s, events);
}

/**
 * Set up and deal a new round (rules spec §2): shuffle, burn one face-down,
 * remove three face-up in 2-player games, deal one card to each seat, and give
 * the first turn to the previous round's winner (first seat in round 1). The
 * first turn begins immediately with its draw.
 */
function startRound(s: GameState, events: Event[], rng: () => number): void {
  s.roundNumber += 1;
  const firstId =
    s.roundNumber === 1 ? s.players[0]!.id : (s.roundWinnerIds[0] ?? s.players[0]!.id);

  for (const p of s.players) {
    p.out = false;
    p.protected = false;
    p.discardPile = [];
    p.hand = [];
  }

  s.deck = shuffle(buildDeck(), rng);
  s.burned = s.deck.shift()!;
  s.faceUpRemoved = s.players.length === 2
    ? [s.deck.shift()!, s.deck.shift()!, s.deck.shift()!]
    : [];

  s.phase = 'round';
  s.pendingChoice = null;
  s.roundWinnerIds = [];
  s.currentTurn = firstId;
  // Announce the round before dealing: clients reset their tables on
  // `roundStarted`, then the deals arrive on top of the clean state.
  events.push({
    type: 'roundStarted',
    roundNumber: s.roundNumber,
    firstPlayerId: firstId,
    deckCount: s.deck.length - s.players.length, // what remains once every seat is dealt
    faceUpRemoved: s.faceUpRemoved,
  });

  for (const p of s.players) {
    const card = s.deck.shift()!;
    p.hand.push(card);
    events.push({ type: 'cardDealt', playerId: p.id, card });
  }

  // The first turn starts with its draw.
  const first = findPlayer(s, firstId)!;
  first.protected = false;
  const drawn = s.deck.shift()!;
  first.hand.push(drawn);
  events.push({ type: 'turnStarted', playerId: firstId }, { type: 'cardDrawn', playerId: firstId, card: drawn });
  enforceCountess(s, firstId, events);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPlayer(s: GameState, id: string): PlayerState | undefined {
  return s.players.find((p) => p.id === id);
}

/** A player is out: their hand is revealed face-up and added to the discards. */
function eliminate(s: GameState, playerId: string, reason: EliminationReason, events: Event[]): void {
  const p = findPlayer(s, playerId)!;
  p.out = true;
  const revealed = p.hand;
  p.hand = [];
  p.discardPile.push(...revealed);
  for (const card of revealed) {
    events.push({ type: 'handRevealed', playerId, card });
  }
  events.push({ type: 'playerEliminated', playerId, reason });
}

/**
 * Draw from the top of the deck; on an empty deck the single face-down card
 * removed at setup (ruling 4 — the face-up 2-player removals are never drawn).
 */
function drawCard(s: GameState): Card | null {
  const fromDeck = s.deck.shift();
  if (fromDeck) return fromDeck;
  if (s.burned !== null) {
    const burned = s.burned;
    s.burned = null; // the removed card is now in someone's hand
    return burned;
  }
  return null;
}

function enforceCountess(s: GameState, playerId: string, events: Event[]): void {
  const p = findPlayer(s, playerId);
  if (!p || forcedDiscard(p.hand) === null) return;
  const index = p.hand.findIndex((c) => c.rank === COUNTESS);
  const [countess] = p.hand.splice(index, 1);
  p.discardPile.push(countess!);
  events.push({ type: 'cardDiscarded', playerId, card: countess!, reason: 'countess' });
}

function nextInRound(s: GameState, fromId: string): string {
  const start = s.players.findIndex((p) => p.id === fromId);
  for (let i = 1; i <= s.players.length; i++) {
    const p = s.players[(start + i) % s.players.length]!;
    if (!p.out) return p.id;
  }
  // Caller guarantees at least one other in-round player before advancing.
  throw new Error('no next player in round');
}

function makePlayer(id: string, name: string): PlayerState {
  return { id, name: name.trim(), hand: [], discardPile: [], out: false, protected: false, tokens: 0 };
}

function validName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}
