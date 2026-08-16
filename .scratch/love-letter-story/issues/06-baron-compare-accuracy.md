# 6 — Baron compare: the animation and caption misrepresent the comparison

**Legacy:** was #27 in the love-letter effort.

**What to build:** the Baron's scene shows the **Baron card itself** as one half of the comparison ("Alice's Baron vs Bob's Guard") — but the Baron does not participate in the compare. The rules (spec §4.3): the Baron compares the two players' *remaining hand cards* (the card Alice kept + Bob's card); only the loser's card is revealed. The animation/caption must not imply the Baron (the played card) was compared. Suggested direction: the caption stops naming the Baron as a comparator ("Alice compared hands with Bob — Bob's Guard was lower"), and the side-by-side flash shows what the viewer can actually know — the loser's revealed card, plus the actor's kept card **only on the actor's own stream** (it is private; other viewers must not see it).

**Blocked by:** love-letter-engine/05 (the scene verdict arrives as data, not inference — the caption lives in `scene.baron.vs` / `scene.baron.tie` / `scene.baron.backfire`)

**Status:** resolved

- [x] Caption accuracy: the Baron is never named as a comparator — the target-loses line names the compared cards where the viewer can know them (the actor's own stream: "Your {kept} vs {target}'s {revealed}"; everyone else: a generic "{actor} compared — {target}'s {revealed} was lower"); the tie line drops the card entirely ("{actor} tied with {target}"); the backfire line is already accurate (it names the loser's revealed card)
- [x] Visual accuracy: the pair flash shows the actor's kept card vs the target's revealed card **on the actor's own stream only**; other viewers see a **card-back** at the actor + the target's revealed card — never the actor's kept card
- [x] Privacy: the actor's kept card never reaches other viewers' streams — the scene is built per-viewer client-side; only the actor's own build injects their kept rank
- [x] Tests: scene builder produces the accurate pair/verdict per viewer; no private card leaks to other viewers' scenes; i18n lines render in en + zh
- [x] ui-smoke: the Baron scene caption + flash assert the accurate wording; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "baron's compare animation is not right, it shows baron compare with the other player's card, but actually, baron does not participate in the compare. He compares the card that are not shown to others, so the description shows needs to be more accurate."

**Context (2025):** today `sceneStages`' `baron` case flashes `rankA: playedRank` (the Baron) side by side with the target's revealed card, and `scene.baron.vs` renders "Alice's Baron vs Bob's Guard". Both imply the Baron itself was weighed. The Baron is the *instrument*, not the subject. Open question for the maintainer: what should other viewers see on the actor's side of the pair — a card-back flash (the comparison happened, the card is hidden), or nothing (the loser's card alone)? The actor's own stream can show their kept card for real.

**Decisions (design pass 2025):** the actor's own stream shows the true comparison — their kept card vs the target's revealed card ("你的 守卫 对 Bob 的 守卫"); **other viewers see a card-back at the actor** plus the target's revealed card, with a caption that never names the actor's card; the tie line becomes card-less ("Alice 与 Bob 打平"); the backfire line is already correct (the loser's card is public). The scene builder gains the viewer's own hand (`usePlayScenes`/`scenesFor`) so the actor's build can inject the kept rank — it is their own card, so injecting it on their stream leaks nothing.

**Implementation notes (ticket 6, 2025):** `scenesFor` gains a `viewer` ({selfId, hand}) — the actor's own build injects their kept rank into the scene (`actorKeptRank` + the caption's `keptRank` param); every other build sees a card-back pair and a caption naming neither the actor's card nor the Baron ("Bob's Guard was lower than Alice's"; zh "Bob 的守卫 比 Alice 的低"). The tie line dropped the card ("Alice tied with Bob" / "Alice 与 Bob 打平"); the backfire line was already accurate (it names the loser's revealed card — public). `pair`'s `rankA` is now `Rank | null` (null renders a card-back in PlayScenes).

**Status flipped to resolved (2026-08-16):** implementation and verification are recorded above; the tracker status lagged the commits (see `git log` for the ticket-27 commits).
