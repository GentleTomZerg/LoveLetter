# 04 — Engine: full-match random-play simulation

**What to build:** a stress harness that plays thousands of full matches (2, 3, and 4 players) with random legal moves, asserting the engine never throws, never deadlocks, and always terminates with a legal round/match result. This is the confidence net that catches rules bugs hiding in interactions.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Random legal-move driver over the complete engine (chooses valid intents from the current `pendingChoice`/turn state)
- [ ] Simulation runs thousands of matches across 2, 3, and 4 players without throwing or deadlocking
- [ ] Every match terminates: round winner always determined (last standing or deck-empty highest hand), match winner always reaches the token target (7/5/4)
- [ ] Invariant checks during play: hands stay size ≤2, deck/setup counts match the spec, eliminated players never act, Protected expires at the right moment
- [ ] Test runtime is bounded (a few seconds, not minutes)
