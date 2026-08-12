# 27 — Baron compare: the animation and caption misrepresent the comparison

**What to build:** the Baron's scene shows the **Baron card itself** as one half of the comparison ("Alice's Baron vs Bob's Guard") — but the Baron does not participate in the compare. The rules (spec §4.3): the Baron compares the two players' *remaining hand cards* (the card Alice kept + Bob's card); only the loser's card is revealed. The animation/caption must not imply the Baron (the played card) was compared. Suggested direction: the caption stops naming the Baron as a comparator ("Alice compared hands with Bob — Bob's Guard was lower"), and the side-by-side flash shows what the viewer can actually know — the loser's revealed card, plus the actor's kept card **only on the actor's own stream** (it is private; other viewers must not see it).

**Blocked by:** 26 (the scene verdict arrives as data, not inference — the caption lives in `scene.baron.vs` / `scene.baron.tie` / `scene.baron.backfire`)

**Status:** needs-triage

- [ ] Caption accuracy: `scene.baron.vs` no longer reads "{actor}'s Baron vs …" — the Baron is not a comparator; the compared cards are the actor's kept card and the target's card
- [ ] Visual accuracy: the pair flash shows the actor's kept card (rank, actor's own stream only) vs the target's revealed card; other viewers see only what is public (the target's revealed card; a card-back or no flash for the actor's side)
- [ ] Privacy: the actor's kept card never reaches other viewers' streams (mirror the `peek`/`cardDrawn` per-viewer payload pattern)
- [ ] Tests: scene builder produces the accurate pair/verdict per viewer; no private card leaks to other viewers' scenes; i18n lines render in en + zh
- [ ] ui-smoke: the Baron scene caption + flash assert the accurate wording; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "baron's compare animation is not right, it shows baron compare with the other player's card, but actually, baron does not participate in the compare. He compares the card that are not shown to others, so the description shows needs to be more accurate."

**Context (2025):** today `sceneStages`' `baron` case flashes `rankA: playedRank` (the Baron) side by side with the target's revealed card, and `scene.baron.vs` renders "Alice's Baron vs Bob's Guard". Both imply the Baron itself was weighed. The Baron is the *instrument*, not the subject. Open question for the maintainer: what should other viewers see on the actor's side of the pair — a card-back flash (the comparison happened, the card is hidden), or nothing (the loser's card alone)? The actor's own stream can show their kept card for real.
