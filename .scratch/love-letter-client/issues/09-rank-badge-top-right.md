# 9 — Card rank badge to the top-right

**Legacy:** was #18 in the love-letter effort.

**What to build:** the white rank pill on hand cards moves from the top-left to the top-right corner (grilling Q1). The art PNGs already carry a stylized rank numeral, so the pill stops stacking on it.

**Blocked by:** none

**Status:** resolved

- [x] CSS: `.card.art .rank-badge` — `left: 0.4rem` → `right: 0.4rem`
- [ ] Verify against the hand, the abilities list, and a narrow phone — the pill must not collide with the art numeral on the top-right

## Comments

**Decision (grilling session 2025, Q1):** keep the pill (removing it entirely was rejected — stylized art numerals may not read at a glance); move it, don't restyle. One-line change.

**Implemented (2025):** one-line change in `packages/client/src/index.css` — `.card.art .rank-badge` anchors `right: 0.4rem` instead of `left: 0.4rem`. Typecheck clean, full suite 136/136 green, client build OK. The abilities-list and choice-panel halves of the verify item are vacuous — those panels render bare art images with no badge; only hand cards (`CardView`) carry it. Pixel analysis of the art (8/7/6.png top strip) shows the stylized numeral sits top-left, exactly under the old pill position, so the move clears it. **Human pass (unchecked):** eyeball the hand on a narrow phone to confirm the pill doesn't collide with anything top-right.
