/**
 * @love-letter/core — the pure rules engine.
 *
 * Zero dependencies, deterministic, no I/O. All game rules live here so they
 * can be unit-tested exhaustively without a server or browser.
 */

export * from './types.js';
export * from './cards.js';
export { shuffle } from './random.js';
export { apply, defaultTokenTarget, type ApplyResult } from './engine.js';
export {
  buildView,
  reduceView,
  type ViewState,
  type PlayerView,
  type LogEntry,
  type LogKind,
} from './view.js';
export type { ClientPacket, ServerPacket, ChatMessage } from './protocol.js';
