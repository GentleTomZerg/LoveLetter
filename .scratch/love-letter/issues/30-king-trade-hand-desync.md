# 30 — Hand desync after a King trade: the client plays a card it is not showing

**What to build:** a King trade hands the actor **two** cards, but the client's view only ever shows **one**. Root cause confirmed: `reduceView`'s `handTraded` case sets `v.hand = [event.card]` — the event carries only the received hand's *first* card (plus a public `count`), so a 2-card received hand loses its second card in the view. From then on the view hand is permanently one short of the server's: the player sees card X but plays card Y (the server's index 0), the hand area and the scoreboard count disagree, and later index sends can land on an empty server slot — the reported "no card on that position" error. The fix: the private `handTraded` payload must deliver the actor's **full received hand** (per-viewer, like `cardDealt`/`cardDrawn`; other viewers still learn only `count`), and `reduceView` must rebuild the hand from it. No log-entry change needed (the King trade has no log line — ADR-0003's one-event-one-entry is untouched if the event carries the private array without a new public log kind).

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Engine/protocol: `handTraded` carries the recipient's full received hand (e.g. `cards: Card[]` or a per-card event series); the public part stays `{playerId, count}` for everyone else
- [ ] reduceView: the actor's view hand is rebuilt from the received cards; handCount and hand array can never diverge again (assert invariant in tests: after every event fold, `view.hand.length === handCount`)
- [ ] The Prince self-correct path (a later Prince/elimination wiping the hand) stops mattering — the view is correct from the trade onward
- [ ] Tests: core — a King trade where the actor receives 2 cards (and the 0-card edge) emits the full private payload, count-only for others; view — the actor's view hand equals the server's hand after every fold, including the turn-start draw that follows; the desync repro below is the regression test
- [ ] ui-smoke: a King-trade round plays through with no error banners and the hand/count agree after the trade
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "Bugs: there are situations when player can see the card but when click, it says no card on that position which is really wierd"

**Root cause (confirmed 2025, engine experiment):** with A holding `[King, x]` and B holding `[b1, b2]`, A plays the King and receives B's hand. Server hand becomes `[b1, b2]`; the actor's view becomes `[b1]` with `handCount` 2:

```
after King trade — server hand: 2,4 | view hand: 2 | count: 2
```

Every subsequent turn the view draws one card and plays its only index, but the server plays its own index 0 — a *different* card than displayed (potentially the Princess: the player clicks a Guard and loses). The view stays one short until a Prince/elimination wipes it or the round resets. The literal `no_card_at_index` banner is the downstream symptom when a desynced client sends an index whose server slot is empty. Existing tests never caught it: the King suites use 1↔1 trades ("A played the King, so both hands are one card"), and the view tests never fold a 2-card received trade.

**Note on ADR-0003:** carrying the full received hand in the private payload does not create a new log entry — the King trade keeps no log line; the event shape changes (array instead of single card) but the one-event-one-entry projection is preserved.
