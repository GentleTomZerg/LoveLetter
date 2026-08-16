# 04 — Engine: full-match random-play simulation

**What to build:** a stress harness that plays thousands of full matches (2, 3, and 4 players) with random legal moves, asserting the engine never throws, never deadlocks, and always terminates with a legal round/match result. This is the confidence net that catches rules bugs hiding in interactions.

**Blocked by:** 03

**Status:** resolved

- [x] Random legal-move driver over the complete engine (chooses valid intents from the current `pendingChoice`/turn state)
- [x] Simulation runs thousands of matches across 2, 3, and 4 players without throwing or deadlocking
- [x] Every match terminates: round winner always determined (last standing or deck-empty highest hand), match winner always reaches the token target (7/5/4)
- [x] Invariant checks during play: hands stay size ≤2, deck/setup counts match the spec, eliminated players never act, Protected expires at the right moment
- [x] Test runtime is bounded (a few seconds, not minutes)

## Comments

**Implemented:** shared sim driver (`packages/core/test/sim.ts`) + exhaustive suite (`random-play-simulation.test.ts`); the old scripted file was slimmed onto the shared driver. 94 core tests green, typecheck clean, full 3000-match sweep ~5s.

- **Driver contract:** `runMatch(seed, capacity)` plays one full match from an empty room to `matchEnded` with random legal moves; it throws on any rejected legal intent, invariant violation, or failure to terminate within 500 steps. Runs are deterministic (seeded PRNG).
- **Invariants enforced after every `apply`:** hands ≤ 2 (eliminated players hold none); 16 cards always conserved with the exact rank composition; 3 face-up removals iff 2 players; turn owner in-round and never protected; pending choice belongs to the turn owner and its target list is *exhaustive* (set-equal to the spec-expected legal targets, so a card the engine forgot to offer would fail the run) and a Guard's named options are every rank but the Guard's; protection always cleared by the start of the protected player's turn.
- **Scale:** 1000 seeded matches per player count (3000 total; 2p ~1.3s, 3p ~1.8s, 4p ~2.1s). Every match ends with the winner at exactly 7/5/4 tokens, `roundStarted == roundEnded`, both round-end reasons occur across the batch, and all 8 ranks resolve.
- **Illegal intents:** a probe sweeps random states with guaranteed-illegal intents (out-of-turn play, bad hand index, mismatched choice kind, wrong-phase lifecycle, play-while-eliminated) — each must be rejected (`ok: false`) without throwing and without mutating the state.
- **Review:** two-axis code review (standards/spec) found no blockers. Fixed from findings: exported the shared `MAX_STEPS` cap (was duplicated), required/typed the invariant check's events param, and upgraded the target check from legality to exhaustiveness (the spec-axis reviewer's one real gap).
