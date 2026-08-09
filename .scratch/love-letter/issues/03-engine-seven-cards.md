# 03 — Engine: remaining seven cards and rulings

**What to build:** the full 16-card engine — every card plays, interacts, and resolves exactly per the rules spec, including the two-phase `pendingChoice` flows, mandatory effects, and all four adopted rulings as named tests. After this ticket the engine is complete and every other layer can rely on it.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Per-card test suites (all 7 remaining cards): Priest, Baron, Handmaid, Prince, King, Countess, Princess
- [ ] Priest: target player's hand revealed to chooser only
- [ ] Baron: compare hands, lower value eliminated (tie → nothing)
- [ ] Handmaid: protects until start of your next turn; blocks being *chosen* but not your own Prince or the Countess
- [ ] Prince: target discards and draws a new card (empty-deck → burned card in 2-player, ruling 4); Prince'd Princess = out with no replacement draw
- [ ] King: trade hands — trading the Princess is legal; cannot trade with a Protected player; all Protected → does nothing
- [ ] Countess: forced discard when holding King or Prince (including immediately after a King trade, ruling 2); does not trigger on the Princess; no effect when discarded
- [ ] Princess: discarded or traded away → eliminated, regardless of cause
- [ ] Mandatory self-destructive effects (e.g. forced self-Prince when all others are Protected)
- [ ] Four adopted rulings as named tests (full tie → all get a token; Countess after King trade; Guard self-targeting disallowed; 2-player Prince empty-deck draw = burned card)
- [ ] Engine remains ruleset-agnostic enough that deck composition is config, not hard-coded per card
