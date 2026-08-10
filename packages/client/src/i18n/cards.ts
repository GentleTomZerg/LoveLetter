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

export const CARD_TEXT: Record<Locale, CardText> = {
  en: fromInfo(),
  zh: fromInfo(), // stubs — real translations land in ticket 17
};
