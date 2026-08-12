/**
 * zh-Hans content contract (ticket 17) — tests the pure i18n seam:
 * `t`/`tCode`/`formatLogEntry`/`CARD_TEXT` rendered in Chinese.
 *
 * The compile-time guarantee (`zh: Record<MessageKey, string>`) forces key
 * completeness; these tests guard the two things it can't: that the English
 * stub was actually replaced, and that no `{token}` placeholder leaks into
 * rendered output (a typo'd template would show a literal "{card}" to
 * players).
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@love-letter/core';
import { t, tCode } from './index';
import { CARD_TEXT } from './cards';
import { formatLogEntry, type LogContext } from './logFormat';
import { en, zh } from './messages';

/** A zh rendering context: viewer is A; roster knows Alice/Bob/Carol. */
function ctx(selfId = 'A'): LogContext {
  return {
    selfId,
    roster: { A: 'Alice', B: 'Bob', C: 'Carol' },
    t: (key, params) => t('zh', key, params),
    cardName: (rank) => CARD_TEXT.zh.name[rank],
  };
}

describe('zh-Hans content (ticket 17)', () => {
  it('replaces the English stub for every message key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(zh[key], `zh.${key} is still the English stub`).not.toBe(en[key]);
    }
  });

  it('localizes card names and effects for all 8 ranks', () => {
    expect(CARD_TEXT.zh.name[1]).toBe('守卫');
    expect(CARD_TEXT.zh.name[2]).toBe('祭司');
    expect(CARD_TEXT.zh.name[3]).toBe('男爵');
    expect(CARD_TEXT.zh.name[4]).toBe('侍女');
    expect(CARD_TEXT.zh.name[5]).toBe('王子');
    expect(CARD_TEXT.zh.name[6]).toBe('国王');
    expect(CARD_TEXT.zh.name[7]).toBe('伯爵夫人');
    expect(CARD_TEXT.zh.name[8]).toBe('公主');
    for (const rank of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(CARD_TEXT.zh.name[rank]).not.toBe(CARD_TEXT.en.name[rank]);
      expect(CARD_TEXT.zh.effect[rank]).not.toBe(CARD_TEXT.en.effect[rank]);
      expect(CARD_TEXT.zh.effect[rank].length).toBeGreaterThan(4);
    }
  });

  it('localizes representative UI strings', () => {
    expect(t('zh', 'home.createRoom')).toBe('创建房间');
    expect(t('zh', 'game.turnBanner')).toBe('轮到你了——打出一张牌。');
    expect(t('zh', 'chat.send')).toBe('发送');
    expect(t('zh', 'common.you')).toBe('你');
  });

  it('renders the rules manual in zh (ticket 34)', () => {
    expect(t('zh', 'manual.title')).toBe('玩法手册');
    expect(t('zh', 'manual.quickRules')).toBe('快速规则');
    expect(t('zh', 'manual.cards')).toBe('八张卡牌');
    expect(t('zh', 'manual.rulings')).toBe('采用裁定');
    expect(t('zh', 'manual.rule.turn')).toContain('抽一张牌');
    expect(t('zh', 'manual.ruling.countessTrade')).toContain('立即弃掉');
  });

  it('translates wire error codes and falls back for unknown codes', () => {
    expect(tCode('zh', 'room_not_found')).toBe('找不到房间。');
    expect(tCode('zh', 'countess_forced')).toBe('持有国王或王子时必须弃掉伯爵夫人。');
    expect(tCode('zh', 'no_such_code_xyz')).toBe('出了点问题。');
  });
});

describe('rules manual keys (ticket 34)', () => {
  const manualKeys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith('manual.'));

  it('renders every manual key in en and zh with no leftover placeholders', () => {
    expect(manualKeys.length).toBeGreaterThan(0);
    for (const key of manualKeys) {
      const enOut = t('en', key);
      const zhOut = t('zh', key);
      expect(enOut, `en ${key}`).not.toMatch(/[{}]/);
      expect(zhOut, `zh ${key}`).not.toMatch(/[{}]/);
      expect(enOut.length, `en ${key} empty`).toBeGreaterThan(0);
      expect(zhOut.length, `zh ${key} empty`).toBeGreaterThan(0);
    }
  });
});

describe('zh interpolation integrity', () => {
  /** Every log kind and every variant, rendered from a zh context. */
  const entries: LogEntry[] = [
    { id: 1, kind: 'play', params: { playerId: 'A', rank: 3 } },
    { id: 2, kind: 'fizzle', params: { playerId: 'B', rank: 1 } },
    { id: 3, kind: 'choice', params: { playerId: 'A' } },
    { id: 4, kind: 'choice', params: { playerId: 'B' } },
    { id: 5, kind: 'guard', params: { playerId: 'A', targetId: 'B', rank: 8 } },
    { id: 6, kind: 'baron', params: { playerId: 'A', targetId: 'B' } },
    { id: 7, kind: 'prince', params: { playerId: 'A', targetId: 'A' } },
    { id: 8, kind: 'prince', params: { playerId: 'A', targetId: 'B' } },
    { id: 9, kind: 'king', params: { playerId: 'A', targetId: 'B' } },
    { id: 10, kind: 'peek', params: { playerId: 'A', targetId: 'B', rank: 8 } },
    { id: 11, kind: 'peek', params: { playerId: 'A', targetId: 'B' } },
    { id: 12, kind: 'peek', params: { playerId: 'B', targetId: 'A' } },
    { id: 13, kind: 'discard', params: { playerId: 'B', rank: 7, reason: 'countess' } },
    { id: 14, kind: 'discard', params: { playerId: 'B', rank: 2, reason: 'prince' } },
    { id: 15, kind: 'reveal', params: { playerId: 'B', rank: 8 } },
    { id: 16, kind: 'eliminate', params: { playerId: 'B', reason: 'guard' } },
    { id: 17, kind: 'eliminate', params: { playerId: 'B', reason: 'fold' } },
    { id: 18, kind: 'round', params: { winners: ['A', 'B'], reason: 'last-standing' } },
    { id: 19, kind: 'round', params: { winners: ['A'], reason: 'highest-hand' } },
    { id: 20, kind: 'match', params: { winnerId: 'A' } },
    { id: 21, kind: 'join', params: { playerId: 'B' } },
    { id: 22, kind: 'leave', params: { playerId: 'B' } },
    { id: 23, kind: 'info', params: { what: 'roomCreated', roomCode: 'ABCD', capacity: 2 } },
    { id: 24, kind: 'info', params: { what: 'roundStarted', roundNumber: 3 } },
    { id: 25, kind: 'info', params: { what: 'rematchStarted' } },
    { id: 26, kind: 'info', params: { what: 'choiceAbandoned', playerId: 'B' } },
    // Resolution completions (ticket 26)
    { id: 27, kind: 'miss', params: { playerId: 'A', targetId: 'B', rank: 8, played: 1 } },
    { id: 28, kind: 'tie', params: { playerId: 'A', targetId: 'B', rank: 3 } },
  ];

  it('renders every log kind without leftover placeholders', () => {
    for (const entry of entries) {
      const out = formatLogEntry(entry, ctx());
      expect(out, `kind ${entry.kind}`).not.toMatch(/[{}]/);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('renders the viewer-relative forms ("你" / "自己")', () => {
    // I played the Baron → 你 打出了 男爵 (space after the name, like en)
    expect(formatLogEntry({ id: 1, kind: 'play', params: { playerId: 'A', rank: 3 } }, ctx())).toBe('你 打出了 男爵');
    // I targeted myself with the Prince
    expect(formatLogEntry({ id: 1, kind: 'prince', params: { playerId: 'A', targetId: 'A' } }, ctx())).toContain('自己');
  });

  it('renders the completion lines with the viewer-relative forms (ticket 26)', () => {
    // I am the actor — the miss/tie lines take the .self forms.
    expect(formatLogEntry({ id: 1, kind: 'miss', params: { playerId: 'A', targetId: 'B', rank: 8, played: 1 } }, ctx())).toBe(
      '你的 守卫 猜错了——Bob 没有 公主',
    );
    expect(formatLogEntry({ id: 2, kind: 'tie', params: { playerId: 'A', targetId: 'B', rank: 3 } }, ctx())).toBe(
      '你的 男爵 与 Bob 打平',
    );
    // A different viewer sees the plain forms with the roster name.
    const c = ctx('X');
    expect(formatLogEntry({ id: 3, kind: 'miss', params: { playerId: 'A', targetId: 'B', rank: 8, played: 1 } }, c)).toBe(
      'Alice 的 守卫 猜错了——Bob 没有 公主',
    );
    expect(formatLogEntry({ id: 4, kind: 'tie', params: { playerId: 'A', targetId: 'B', rank: 3 } }, c)).toBe(
      'Alice 的 男爵 与 Bob 打平',
    );
  });

  it('joins round winners with 和 (and 、 for 3+)', () => {
    // Viewer X is not among the winners, so plain roster names render.
    const c = ctx('X');
    const two = formatLogEntry({ id: 1, kind: 'round', params: { winners: ['A', 'B'], reason: 'last-standing' } }, c);
    expect(two).toBe('Alice 和 Bob 赢得了这一轮（最后存活）');
    const three = formatLogEntry({ id: 1, kind: 'round', params: { winners: ['A', 'B', 'C'], reason: 'highest-hand' } }, c);
    expect(three).toBe('Alice、Bob 和 Carol 赢得了这一轮（手牌最大）');
  });
});
