# 07 — End-to-end playtest and polish

**What to build:** a human-playable full game, verified by hand — two (or more) browser tabs, a complete match with all 8 cards, every ruling exercised, then fixes and functional-clean polish. This is the "friends can genuinely play this" gate.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Full 2-player match played by hand: all cards, both rounds of the deck, match end, rematch
- [ ] 3- and 4-player matches start, play, and end correctly (token targets 5 and 4)
- [ ] Rulings exercised by hand: Countess forced discard after King trade, Prince'd Princess, Guard guess elimination, full-tie round
- [ ] Disconnect/reconnect mid-match verified through the UI
- [ ] Chat works between tabs
- [ ] Edge cases fixed from playtest findings (illegal intents rejected with clear errors, no dead-ends in the UI)
- [ ] Functional-clean pass: readable layout, obvious click targets, no broken states
