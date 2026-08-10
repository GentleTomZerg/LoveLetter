/**
 * @love-letter/client — localized card names and effects (ADR-0004).
 *
 * The art PNGs stay language-neutral (rank-keyed, baked English rules text
 * accepted as flavor — ADR-0006); every *rendered* card name and effect
 * comes from here, keyed by rank. `en` sources from core's CARD_INFO so the
 * two can never drift; `zh` is stubbed until ticket 17.
 */

import { CARD_INFO } from '@love-letter/core';
import type { Rank } from '@love-letter/core';
import type { Locale } from './messages';

export interface CardText {
  name: Record<Rank, string>;
  effect: Record<Rank, string>;
}

function fromInfo(): CardText {
  const name = {} as Record<Rank, string>;
  const effect = {} as Record<Rank, string>;
  for (const rank of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    name[rank] = CARD_INFO[rank].name;
    effect[rank] = CARD_INFO[rank].effect;
  }
  return { name, effect };
}

/**
 * Simplified Chinese card text (ticket 17) — official Chinese edition names
 * (守卫/祭司/男爵/侍女/王子/国王/伯爵夫人/公主) and effect text.
 */
const zhCards: CardText = {
  name: {
    1: '守卫',
    2: '祭司',
    3: '男爵',
    4: '侍女',
    5: '王子',
    6: '国王',
    7: '伯爵夫人',
    8: '公主',
  },
  effect: {
    1: '选择一名其他玩家并说出一种卡牌（守卫除外）。若该玩家手中有此牌，则该玩家出局。',
    2: '查看另一名玩家的手牌——只有你能看到。',
    3: '与另一名玩家秘密比较手牌。点数较小者出局；平局则无事发生。',
    4: '你的下一回合开始前，你不受其他玩家卡牌效果的影响。',
    5: '选择一名玩家（包括你自己）。该玩家弃掉手牌并抽一张新牌。',
    6: '与另一名玩家交换手牌。交换不算弃牌。',
    7: '弃掉时无效果。若你同时持有她与国王或王子，则必须弃掉她。',
    8: '若你因任何原因弃掉公主，则你出局。',
  },
};

export const CARD_TEXT: Record<Locale, CardText> = {
  en: fromInfo(),
  zh: zhCards,
};
