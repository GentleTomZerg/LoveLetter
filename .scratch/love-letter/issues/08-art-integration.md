# 08 — Art integration (user-provided PNGs)

**What to build:** the cards stop being text-only — full-card PNG artwork (user-provided, `~/Downloads/love_letter_cards/card-imgs/` → `client/public/cards/`) on every face, a card back for the face-down removed card, and the logo on Home. Supersedes the original game-icons-on-SVG-frames plan (DESIGN Q21 updated).

**Blocked by:** 06 (the card/table UI it enhances)

**Status:** resolved

- [x] Copy artwork into `client/public/cards/` as rank-keyed files (`1.png`…`8.png`, backs, logo)
- [x] Card faces render artwork + rank badge + name caption; effect text in the tooltip
- [x] Guard picker shows card thumbnails
- [x] Face-down removed card shows the card back
- [x] Home shows the logo
- [x] Verify layout with real play (hand, discard piles, choice prompts all render without breaking)
- [ ] Confirm the PNG source/license with the author (no proprietary art for any public release) — **outcome: cannot confirm; see Comments**

## Comments

Integrated ahead of the original ticket schedule at the user's request (ticket 03 wrap-up). Rank 2 artwork is captioned "Spy" in its source filename — the game displays "Priest" (2012 original name); regenerate that image if the art itself depicts a spy. The "courtess" filename typo is irrelevant (rank-keyed names).

**Verified in the browser (2025-08-09):** the user played with the art live (`npm run dev`) and confirmed it renders well — hand cards, rank badge/name caption overlay, Guard-picker thumbnails, card back, and Home logo all look right. Layout box checked.

**Resolved (2025):** all 11 files verified byte-identical to their source (`1.png`–`8.png`, both backs, logo — `cmp` against `~/Downloads/love_letter_cards/card-imgs/`). Rendering is continuously re-verified by the ui-smoke playtest (rank-keyed discard images, Guard thumbnails, card back on the burned card, logo on Home).

Two follow-ups confirmed with the author — the integration is complete, but public release stays blocked until both are resolved:

1. **Rank-2 art mismatch (confirmed).** The author confirms the `2.png` artwork reads as a Spy while the game displays "Priest" (the 2012 original name, per the rules spec). The card must not be renamed (the rules and CARD_INFO use Priest); instead regenerate/replace `client/public/cards/2.png` before any public release. The file is rank-keyed, so a drop-in replacement needs no code changes.
2. **License unconfirmed (confirmed).** The author cannot verify where the PNGs came from; the files carry no embedded metadata (no title/author/copyright), and the art research found no verified-license complete Love Letter set matching them. The set is therefore private — LAN play only. Any public release is blocked until the license is confirmed or the art is replaced with verified-licensed originals. Recorded in DESIGN Q21.
