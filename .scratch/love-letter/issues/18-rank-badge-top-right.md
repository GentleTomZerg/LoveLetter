# 18 — Card rank badge to the top-right

**What to build:** the white rank pill on hand cards moves from the top-left to the top-right corner (grilling Q1). The art PNGs already carry a stylized rank numeral, so the pill stops stacking on it.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] CSS: `.card.art .rank-badge` — `left: 0.4rem` → `right: 0.4rem`
- [ ] Verify against the hand, the abilities list, and a narrow phone — the pill must not collide with the art numeral on the top-right

## Comments

**Decision (grilling session 2025, Q1):** keep the pill (removing it entirely was rejected — stylized art numerals may not read at a glance); move it, don't restyle. One-line change.
