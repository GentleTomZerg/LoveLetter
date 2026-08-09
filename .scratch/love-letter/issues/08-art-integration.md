# 08 — Art integration (user-provided PNGs)

**What to build:** the cards stop being text-only — full-card PNG artwork (user-provided, `~/Downloads/love_letter_cards/card-imgs/` → `client/public/cards/`) on every face, a card back for the face-down removed card, and the logo on Home. Supersedes the original game-icons-on-SVG-frames plan (DESIGN Q21 updated).

**Blocked by:** 06 (the card/table UI it enhances)

**Status:** ready-for-agent

- [x] Copy artwork into `client/public/cards/` as rank-keyed files (`1.png`…`8.png`, backs, logo)
- [x] Card faces render artwork + rank badge + name caption; effect text in the tooltip
- [x] Guard picker shows card thumbnails
- [x] Face-down removed card shows the card back
- [x] Home shows the logo
- [ ] Verify layout with real play (hand, discard piles, choice prompts all render without breaking)
- [ ] Confirm the PNG source/license with the author (no proprietary art for any public release)

## Comments

Integrated ahead of the original ticket schedule at the user's request (ticket 03 wrap-up). Rank 2 artwork is captioned "Spy" in its source filename — the game displays "Priest" (2012 original name); regenerate that image if the art itself depicts a spy. The "courtess" filename typo is irrelevant (rank-keyed names).
