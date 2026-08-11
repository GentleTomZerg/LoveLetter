/**
 * @love-letter/client — format structured log entries into display text
 * (ADR-0003).
 *
 * Entries carry ids and ranks, never display strings; this is the single
 * place that turns them into locale-aware sentences. The same formatter
 * feeds both the full log and (ticket 19) the collapsed latest-event strip.
 */

import type { LogEntry, Rank } from '@love-letter/core';
import type { MessageKey } from './messages';
import { joinLocalizedList, type TParams } from './index';

export interface LogContext {
  selfId: string;
  /** Every player who ever joined, id → name (never shrinks). */
  roster: Record<string, string>;
  t: (key: MessageKey, params?: TParams) => string;
  cardName: (rank: Rank) => string;
}

/** "You" for the viewer, else the roster name, else the raw id. */
function displayName(ctx: LogContext, playerId: string): string {
  if (playerId === ctx.selfId) return ctx.t('common.you');
  return ctx.roster[playerId] ?? playerId;
}

/** The plain stored name — join/leave lines never say "You". */
function rosterName(ctx: LogContext, playerId: string): string {
  return ctx.roster[playerId] ?? playerId;
}

/**
 * The card rank an entry carries for the collapsed strip's thumbnail, if
 * any. Only the rank-bearing kinds (`play`, `fizzle`, `guard`, `reveal`, a
 * `discard` with a rank, and the peeker's own `peek` with the card) set the
 * `rank` param; everything else renders text alone.
 */
export function entryRank(entry: LogEntry): Rank | undefined {
  const rank = entry.params.rank;
  return typeof rank === 'number' && rank >= 1 && rank <= 8 ? (rank as Rank) : undefined;
}

/**
 * The single newest entry across the game log and room activity — the
 * collapsed strip's content. Both sequences run oldest→newest; activity
 * lines are client-generated from live packets and share no clock with the
 * server log, so the strip follows the expanded list's convention: the
 * newest activity line when any exist, else the newest log entry — the same
 * entry the expanded list shows first. Undefined when both are empty (the
 * lobby placeholder).
 */
export function latestLogEntry(log: LogEntry[], activity: LogEntry[]): LogEntry | undefined {
  return activity.length > 0 ? activity[activity.length - 1]! : log[log.length - 1];
}

export function formatLogEntry(entry: LogEntry, ctx: LogContext): string {
  const { params } = entry;
  const name = (id: string) => displayName(ctx, id);
  const target = (id: string) => (id === ctx.selfId ? ctx.t('common.yourself') : name(id));
  const card = (rank: unknown) => ctx.cardName(rank as Rank);

  switch (entry.kind) {
    case 'play':
      return ctx.t('log.play', { name: name(params.playerId as string), card: card(params.rank) });
    case 'fizzle':
      return ctx.t('log.fizzle', { name: name(params.playerId as string), card: card(params.rank) });
    case 'choice':
      return params.playerId === ctx.selfId
        ? ctx.t('log.choice.self')
        : ctx.t('log.choice.other', { name: name(params.playerId as string) });
    case 'guard':
      return ctx.t('log.guard', {
        name: name(params.playerId as string),
        target: name(params.targetId as string),
        card: card(params.rank),
      });
    case 'baron':
      return ctx.t('log.baron', {
        name: name(params.playerId as string),
        target: name(params.targetId as string),
      });
    case 'prince':
      return ctx.t('log.prince', {
        name: name(params.playerId as string),
        target: target(params.targetId as string),
      });
    case 'king':
      return ctx.t('log.king', {
        name: name(params.playerId as string),
        target: name(params.targetId as string),
      });
    case 'miss':
      // The completion line names both cards: the played Guard and the guess
      // (ticket 26). The `.self` form avoids the possessive on "You".
      return params.playerId === ctx.selfId
        ? ctx.t('log.miss.self', {
          played: card(params.played),
          target: name(params.targetId as string),
          card: card(params.rank),
        })
        : ctx.t('log.miss', {
          name: name(params.playerId as string),
          played: card(params.played),
          target: name(params.targetId as string),
          card: card(params.rank),
        });
    case 'tie':
      return params.playerId === ctx.selfId
        ? ctx.t('log.tie.self', {
          played: card(params.rank),
          target: name(params.targetId as string),
        })
        : ctx.t('log.tie', {
          name: name(params.playerId as string),
          played: card(params.rank),
          target: name(params.targetId as string),
        });
    case 'peek':
      // Only the peeker's own stream carries the card (privacy redaction).
      if (params.rank !== undefined) {
        return ctx.t('log.peek.selfCard', { target: name(params.targetId as string), card: card(params.rank) });
      }
      return params.playerId === ctx.selfId
        ? ctx.t('log.peek.self', { target: name(params.targetId as string) })
        : ctx.t('log.peek.other', {
          name: name(params.playerId as string),
          target: name(params.targetId as string),
        });
    case 'discard':
      return params.reason === 'countess'
        ? ctx.t('log.discard.countess', { name: name(params.playerId as string) })
        : ctx.t('log.discard.prince', { name: name(params.playerId as string), card: card(params.rank) });
    case 'reveal':
      return ctx.t('log.reveal', { name: name(params.playerId as string), card: card(params.rank) });
    case 'eliminate':
      return params.reason === 'fold'
        ? ctx.t('log.eliminate.fold', { name: name(params.playerId as string) })
        : ctx.t('log.eliminate.out', { name: name(params.playerId as string) });
    case 'round': {
      const winners = joinLocalizedList((params.winners as string[]).map(name), ctx.t);
      return params.reason === 'last-standing'
        ? ctx.t('log.round.last', { names: winners })
        : ctx.t('log.round.hand', { names: winners });
    }
    case 'match':
      return ctx.t('log.match', { name: name(params.winnerId as string) });
    case 'join':
      return ctx.t('log.join', { name: rosterName(ctx, params.playerId as string) });
    case 'leave':
      return ctx.t('log.leave', { name: rosterName(ctx, params.playerId as string) });
    case 'info':
      return formatInfo(entry, ctx);
  }
}

/** Room-layer info lines — the `what` param picks the message (ADR-0003). */
function formatInfo(entry: LogEntry, ctx: LogContext): string {
  const { params } = entry;
  switch (params.what) {
    case 'roomCreated':
      return ctx.t('log.info.roomCreated', { roomCode: params.roomCode as string });
    case 'roundStarted':
      return ctx.t('log.info.roundStarted', { roundNumber: params.roundNumber as number });
    case 'rematchStarted':
      return ctx.t('log.info.rematchStarted');
    case 'choiceAbandoned':
      return ctx.t('log.info.choiceAbandoned', { name: displayName(ctx, params.playerId as string) });
    case 'playerGone':
      return ctx.t('log.info.playerGone', { name: params.name as string });
    case 'playerBack':
      return ctx.t('log.info.playerBack', { name: params.name as string });
    default:
      // Unknown info line (e.g. a newer server) — show raw params if any.
      return String(params.text ?? '');
  }
}
