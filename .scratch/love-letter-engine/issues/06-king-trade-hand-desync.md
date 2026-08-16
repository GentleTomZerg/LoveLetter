# 6 — Hand desync after a King trade: the client plays a card it is not showing

**Legacy:** was #30 in the love-letter effort.

**What to build:** the `handTraded` event carries only the received hand's **first** card (plus a public `count`), and `reduceView`'s `if (event.card)` guard skips the hand replacement entirely when the received hand is **empty** — leaving the actor's old card stale in the view. The scoreboard count already drops to 0 while the hand area still shows a card; clicking it sends `which` into an empty server slot → the reported **"no card on that position"** banner. The fix: `handTraded` carries the recipient's **full received hand** (per-viewer, like `cardDealt`/`cardDrawn`; other viewers still get only `count`), and `reduceView` rebuilds the hand from it — always, including the empty case. No log-entry change (the King trade has no log line — ADR-0003's one-event-one-entry is preserved).

**Blocked by:** none

**Status:** resolved

- [x] Engine/protocol: `handTraded` carries `cards: Card[] | null` — the recipient's full received hand (copied: the state hand is spliced later, and the logged event must stay an immutable record); `count` stays public for everyone else
- [x] Server filter: non-owners receive `cards: null` (like every other private payload); replay uses the same filter, so reconnects never leak
- [x] reduceView: the actor's view hand is rebuilt from the received cards — including an **empty** array (the live bug); `view.hand.length === handCount` holds after every fold
- [x] Tests: king — the full received hand in the payload (unequal 1↔2 and empty 0↔1 trades), the copy-isolation regression, and the empty-receive view regression (the exact reported sequence); view — the empty-received hand drops to `[]`; **new view-sync probe**: every player's view hand equals the engine hand after every apply's fold, through seeded full matches at 2/3/4 players — the probe caught this bug (failed at seed 1) and now pins the invariant
- [x] ui-smoke: `runKingTrade` — the hand area shows exactly as many cards as the scoreboard count at every turn-holder moment around King trades; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "Bugs: there are situations when player can see the card but when click, it says no card on that position which is really wierd"

**Root cause (corrected 2025, engine probe):** an earlier diagnosis claimed a King trade hands the actor **two** cards and the view shows one — a constructed state that is **unreachable in real play**: a probe over 900 seeded matches (2/3/4 players) recorded 6,990 trades with a max received count of **1** (the turn structure means the target always holds one card). The **reachable** manifestation is the opposite branch of the same payload defect: a player can legitimately hold **zero** cards mid-round (the Prince's target discards everything and, on a depleted deck — burned card included — draws nothing), and a King trade with that player hands the actor an **empty** hand. The old event carried `card: null`, and the view's `if (event.card)` guard skipped the rebuild — the actor's pre-trade card stayed in the view while the scoreboard already counted 0. The stale view is longer than the server's hand → clicking it sends an index into an empty slot → `no_card_at_index`. The probe (seed 1, 4 players) reproduced it exactly: `view=[3] server=[]` after the trade batch. The full received-hand payload fixes both branches (empty and 2-card) by construction.

**Note on ADR-0003:** carrying the full received hand in the private payload creates no new log entry — the King trade keeps no log line; only the event's private shape changes (array instead of single card).

**Status flipped to resolved (2026-08-16):** implementation and verification are recorded above; the tracker status lagged the commits (see `git log` for the ticket-30 commits).
