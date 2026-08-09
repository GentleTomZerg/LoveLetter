/**
 * Core domain types for the Love Letter engine.
 *
 * Vocabulary follows CONTEXT.md: Card, Intent, Event, Phase, Round, Match,
 * Token, Burned, Protected, PendingChoice. A "game" is a whole match.
 */

/** A card's numeric rank — higher is closer to the Princess. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** The eight card types of the original 16-card deck. */
export type CardName =
  | 'Guard'
  | 'Priest'
  | 'Baron'
  | 'Handmaid'
  | 'Prince'
  | 'King'
  | 'Countess'
  | 'Princess';

export interface Card {
  rank: Rank;
  name: CardName;
}

/** Top-level state machine: lobby → round → roundEnded → matchEnded. */
export type Phase = 'lobby' | 'round' | 'roundEnded' | 'matchEnded';

export interface PlayerState {
  /** Stable id, assigned by the server (never shown as identity). */
  id: string;
  name: string;
  /** Cards currently held (secret). 0, 1 or 2 during a round. */
  hand: Card[];
  /** Discarded cards, face-up in play order — public. */
  discardPile: Card[];
  /** Eliminated from the current round. */
  out: boolean;
  /** Handmaid immunity — blocks being chosen by others' cards until the
   *  start of your next turn (rules spec §4.4). */
  protected: boolean;
  /** Tokens of affection — round wins; first to the target wins the match. */
  tokens: number;
}

/**
 * The follow-up the engine needs before a turn is over (two-phase effects).
 * The four target-only cards (Priest/Baron/Prince/King) and the Guard's
 * target-plus-card-name guess. Targets are pre-computed as the legal player
 * ids; the chooser may only pick from them.
 */
export type PendingChoice =
  | { kind: 'guard'; playerId: string; targets: string[]; namedOptions: Rank[] }
  | { kind: 'priest'; playerId: string; targets: string[] }
  | { kind: 'baron'; playerId: string; targets: string[] }
  | { kind: 'prince'; playerId: string; targets: string[] }
  | { kind: 'king'; playerId: string; targets: string[] };

/** The five cards that ask for a target via `pendingChoice`. */
export type TargetKind = 'guard' | 'priest' | 'baron' | 'prince' | 'king';

/**
 * A resolved choice, discriminated by the pending choice it answers. The
 * Guard adds the named card; the other four just pick a target.
 */
export type Choice =
  | { kind: 'guard'; targetPlayerId: string; namedRank: Rank }
  | { kind: 'priest'; targetPlayerId: string }
  | { kind: 'baron'; targetPlayerId: string }
  | { kind: 'prince'; targetPlayerId: string }
  | { kind: 'king'; targetPlayerId: string };

/** The full, server-authoritative engine state. */
export interface GameState {
  phase: Phase;
  roomCode: string;
  /** Seats (2–4). Seat order = turn order; never reordered. */
  capacity: 2 | 3 | 4;
  /** Tokens needed to win the match (7 for 2 players, 5 for 3, 4 for 4). */
  tokenTarget: number;
  players: PlayerState[];
  /** Face-down draw deck; index 0 is the top. */
  deck: Card[];
  /** The single card removed face-down at setup, unknown to all. */
  burned: Card | null;
  /** 2-player only: the three cards removed face-up (public, unused). */
  faceUpRemoved: Card[];
  /** Id of the player whose turn it is. Null outside a round. */
  currentTurn: string | null;
  pendingChoice: PendingChoice | null;
  /** 0 in the lobby; incremented each round. */
  roundNumber: number;
  /** Winners of the last finished round; the next round's first player. */
  roundWinnerIds: string[];
  /** Set when the match ends; the match winner's id. */
  matchWinnerId: string | null;
}

/**
 * A client→server request to change game state. Validated by the engine;
 * illegal intents are rejected, never guessed at.
 *
 * createRoom/joinRoom are connection-level intents the server forwards from
 * the create/join packets; the server stamps playerId from the socket — the
 * client is never trusted to name itself. `fold` is a system-level intent the
 * server issues on behalf of a dropped socket whose grace window expired
 * (ticket 05) — same validation, different sender.
 */
export type Intent =
  | { type: 'createRoom'; roomCode: string; capacity: 2 | 3 | 4; playerId: string; playerName: string; tokenTarget?: number }
  | { type: 'joinRoom'; playerId: string; playerName: string }
  | { type: 'playCard'; playerId: string; which: 0 | 1 }
  | { type: 'choice'; playerId: string; choice: Choice }
  | { type: 'nextRound'; playerId: string }
  | { type: 'rematch'; playerId: string }
  | { type: 'fold'; playerId: string };

/**
 * An immutable, ordered record of a state transition, appended to the event
 * log. The log powers the client's rendered state, replay, and debugging.
 *
 * Two events carry a private payload: `cardDealt` and `cardDrawn` reach every
 * socket so the table state stays consistent, but the card itself is sent only
 * to the named player — other recipients receive `card: null`. The
 * authoritative room log always keeps the full event. `handPeeked` (Priest)
 * follows the same pattern: the peek is public, the card seen is not.
 *
 * `cardDiscarded` covers forced, effect-less discards (the Prince's target
 * discards their hand; the Countess's mandatory discard) — the card is face
 * up, so it is public.
 */
export type Event =
  | { type: 'roomCreated'; roomCode: string; capacity: number }
  | { type: 'playerJoined'; player: { id: string; name: string } }
  | { type: 'rematchStarted' }
  | { type: 'roundStarted'; roundNumber: number; firstPlayerId: string; deckCount: number; faceUpRemoved: Card[] }
  | { type: 'cardDealt'; playerId: string; card: Card | null } // card visible only to the named player
  | { type: 'turnStarted'; playerId: string }
  | { type: 'cardDrawn'; playerId: string; card: Card | null } // card visible only to the named player
  | { type: 'cardPlayed'; playerId: string; which: 0 | 1; card: Card }
  | { type: 'cardFizzled'; playerId: string; card: Card }
  | { type: 'choiceRequired'; playerId: string; pendingChoice: PendingChoice }
  | { type: 'choiceMade'; playerId: string; choice: Choice }
  | { type: 'choiceAbandoned'; playerId: string } // a dropped player's open choice is void (fold)
  | { type: 'handTraded'; playerId: string; card: Card | null } // card visible only to the named player
  | { type: 'handPeeked'; playerId: string; targetPlayerId: string; card: Card | null } // card visible only to the Priest's chooser
  | { type: 'cardDiscarded'; playerId: string; card: Card; reason: 'prince' | 'countess' }
  | { type: 'handRevealed'; playerId: string; card: Card }
  | { type: 'playerEliminated'; playerId: string; reason: EliminationReason }
  | { type: 'roundEnded'; winnerIds: string[]; reason: 'last-standing' | 'highest-hand' }
  | { type: 'matchEnded'; winnerId: string };

/** Why a player left the round (each card adds its own reason). */
export type EliminationReason = 'guard' | 'baron' | 'princess' | 'fold';
