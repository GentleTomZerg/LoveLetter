/**
 * The rules engine: `apply(state, intent)` validates an intent, resolves the
 * resulting effects step-by-step, and returns `{ state, events[] }`. Illegal
 * intents are rejected with a human-readable error — never guessed at.
 *
 * Tracer scope (ticket 02): only the Guard resolves. The other seven cards
 * play with no effect until ticket 03 (their effects land there without
 * rewiring — each effect is dispatched from `resolvePlayedCard`).
 *
 * The engine is deterministic: all randomness flows through the injected
 * `rng`, and `apply` clones the incoming state before mutating, so callers
 * keep their previous reference untouched.
 */

import { buildDeck } from './cards.js';
import { shuffle } from './random.js';
import type {
  Card,
  Event,
  GameState,
  GuardChoice,
  Intent,
  PendingChoice,
  PlayerState,
  Rank,
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
  if (s === null) return err('room does not exist'); // only createRoom starts from null
  switch (intent.type) {
    case 'joinRoom': return joinRoom(s, intent, rng);
    case 'playCard': return playCard(s, intent);
    case 'choice': return makeChoice(s, intent);
    case 'nextRound': return nextRound(s, intent, rng);
    case 'rematch': return rematch(s, intent, rng);
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
  if (s !== null) return err('a room already exists');
  if (!ROOM_CODE_PATTERN.test(intent.roomCode)) return err('invalid room code');
  if (intent.capacity !== 2 && intent.capacity !== 3 && intent.capacity !== 4) {
    return err('capacity must be 2–4 players');
  }
  if (!validName(intent.playerName)) return err('invalid player name');

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
  if (s.phase !== 'lobby') return err('room has already started');
  if (s.players.length >= s.capacity) return err('room is full');
  if (!validName(intent.playerName)) return err('invalid player name');

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
  if (s.phase !== 'round') return err('not in a round');
  if (s.pendingChoice !== null) return err('a pending choice must be resolved first');
  if (s.currentTurn !== intent.playerId) return err('not your turn');
  const actor = findPlayer(s, intent.playerId);
  if (!actor || actor.out) return err('you are out of the round');
  if (intent.which !== 0 && intent.which !== 1) return err('invalid hand index');
  const card = actor.hand[intent.which];
  if (!card) return err('no card at that hand index');

  actor.hand.splice(intent.which, 1);
  actor.discardPile.push(card);
  const events: Event[] = [
    { type: 'cardPlayed', playerId: actor.id, which: intent.which, card },
  ];
  resolvePlayedCard(s, actor, card, events);
  return ok(s, events);
}

/**
 * Dispatch the played card's effect. Only the Guard exists in the tracer;
 * every other card is a deliberate no-op until ticket 03 implements it.
 */
function resolvePlayedCard(s: GameState, actor: PlayerState, card: Card, events: Event[]): void {
  switch (card.rank) {
    case 1: {
      // Guard: choose a player (not yourself, not protected, in the round)
      // and name a card other than Guard (ruling 3: self-targeting is illegal).
      const targets = s.players
        .filter((p) => !p.out && p.id !== actor.id && !p.protected)
        .map((p) => p.id);
      if (targets.length === 0) {
        events.push({ type: 'cardFizzled', playerId: actor.id, card });
        finishTurn(s, events);
        break;
      }
      s.pendingChoice = {
        kind: 'guard',
        playerId: actor.id,
        targets,
        namedOptions: GUARD_NAMED_OPTIONS,
      };
      events.push({ type: 'choiceRequired', playerId: actor.id, pendingChoice: s.pendingChoice });
      break;
    }
    default:
      // Ticket 03: Priest, Baron, Handmaid, Prince, King, Countess, Princess.
      finishTurn(s, events);
  }
}

function makeChoice(s: GameState, intent: Extract<Intent, { type: 'choice' }>): ApplyResult {
  if (s.phase !== 'round') return err('not in a round');
  const pc = s.pendingChoice;
  if (pc === null) return err('no pending choice');
  if (pc.playerId !== intent.playerId) return err('not your choice to make');

  if (pc.kind === 'guard') {
    const choice = intent.choice as GuardChoice;
    if (!pc.targets.includes(choice.targetPlayerId)) return err('illegal target');
    if (!pc.namedOptions.includes(choice.namedRank)) return err('illegal named card');

    const events: Event[] = [
      { type: 'choiceMade', playerId: pc.playerId, choice },
    ];
    const target = findPlayer(s, choice.targetPlayerId);
    if (target && target.hand.some((c) => c.rank === choice.namedRank)) {
      // Correct guess: the target is out and their hand is revealed face-up.
      const revealed = target.hand;
      target.hand = [];
      target.discardPile.push(...revealed);
      target.out = true;
      for (const card of revealed) {
        events.push({ type: 'handRevealed', playerId: target.id, card });
      }
      events.push({ type: 'playerEliminated', playerId: target.id, reason: 'guard' });
    }
    // A wrong guess reveals nothing and changes nothing else.
    s.pendingChoice = null;
    finishTurn(s, events);
    return ok(s, events);
  }

  // Other pendingChoice kinds arrive in ticket 03 (Priest/Baron/Prince/King).
  return err('unsupported pending choice');
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
  if (s.phase !== 'roundEnded') return err('no round is waiting to start');
  const events: Event[] = [];
  startRound(s, events, rng);
  return ok(s, events);
}

function rematch(s: GameState, _intent: Extract<Intent, { type: 'rematch' }>, rng: () => number): ApplyResult {
  if (s.phase !== 'matchEnded') return err('the match is not over');
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

  for (const p of s.players) {
    const card = s.deck.shift()!;
    p.hand.push(card);
    events.push({ type: 'cardDealt', playerId: p.id, card });
  }

  s.phase = 'round';
  s.pendingChoice = null;
  s.roundWinnerIds = [];
  s.currentTurn = firstId;
  events.push({
    type: 'roundStarted',
    roundNumber: s.roundNumber,
    firstPlayerId: firstId,
    deckCount: s.deck.length,
    faceUpRemoved: s.faceUpRemoved,
  });

  // The first turn starts with its draw.
  const first = findPlayer(s, firstId)!;
  first.protected = false;
  const drawn = s.deck.shift()!;
  first.hand.push(drawn);
  events.push({ type: 'turnStarted', playerId: firstId }, { type: 'cardDrawn', playerId: firstId, card: drawn });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPlayer(s: GameState, id: string): PlayerState | undefined {
  return s.players.find((p) => p.id === id);
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
