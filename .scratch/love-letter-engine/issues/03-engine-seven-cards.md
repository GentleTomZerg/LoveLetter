# 3 — Engine: remaining seven cards and rulings

**Legacy:** was #3 in the love-letter effort.

**What to build:** the full 16-card engine — every card plays, interacts, and resolves exactly per the rules spec, including the two-phase `pendingChoice` flows, mandatory effects, and all four adopted rulings as named tests. After this ticket the engine is complete and every other layer can rely on it.

**Blocked by:** 2

**Status:** resolved

- [x] Per-card test suites (all 7 remaining cards): Priest, Baron, Handmaid, Prince, King, Countess, Princess
- [x] Priest: target player's hand revealed to chooser only
- [x] Baron: compare hands, lower value eliminated (tie → nothing)
- [x] Handmaid: protects until start of your next turn; blocks being *chosen* but not your own Prince or the Countess
- [x] Prince: target discards and draws a new card (empty-deck → burned card in 2-player, ruling 4); Prince'd Princess = out with no replacement draw
- [x] King: trade hands — trading the Princess is legal; cannot trade with a Protected player; all Protected → does nothing
- [x] Countess: forced discard when holding King or Prince (including immediately after a King trade, ruling 2); does not trigger on the Princess; no effect when discarded
- [x] Princess: discarded or traded away → eliminated, regardless of cause
- [x] Mandatory self-destructive effects (e.g. forced self-Prince when all others are Protected)
- [x] Four adopted rulings as named tests (full tie → all get a token; Countess after King trade; Guard self-targeting disallowed; 2-player Prince empty-deck draw = burned card)
- [x] Engine remains ruleset-agnostic enough that deck composition is config, not hard-coded per card

## Comments

**Implemented (2025):** full 16-card engine, 91 core tests green, typecheck clean, server smoke (full matches with all cards over WS, incl. a private-card privacy assertion) green.

- **Spec deviation flagged:** the Princess checkbox says “traded away → eliminated”, but the authoritative rules spec (§4.6, §4.8, §8.5) and DESIGN.md both say a King trade is **not** a discard and is legal — the Princess simply changes hands. Implemented per the authoritative sources: she eliminates only on a discard (voluntary play or forced, e.g. the Prince). If the original intent was otherwise, relitigate.
- **Countess after King trade (ruling 2):** enforced at every hand change (draws and trades), and with immediate enforcement the trade case is unreachable in the standard deck — a single King and single-card hands mean a trade can never create the pair naturally; it only forms at the turn-start draw. The ruling-2 named test therefore exercises the enforcement mechanism from a hand-built pair state.
- **Priest privacy:** the peek is a public event whose card payload is sent only to the chooser (`card: null` elsewhere), same pattern as deals/draws; verified end-to-end by the smoke's privacy assertion.
- **Random-play sim (ticket 4 will make it exhaustive):** 30 seeded 2-player matches + 10 seeds at 2/3/4 players — every apply must succeed, matches must terminate, and all 8 card types must resolve across the batch.
- **Client kept honest:** the ChoicePanel gained a generic target picker for Priest/Baron/Prince/King so the browser can't deadlock on a non-Guard pending choice; the full Game-screen UI polish is love-letter-client/01.
- **Code review (post-implementation, two parallel axes):** no spec or standard blockers after fixes. One real bug found and fixed — the view reducer left the viewer's own hand stale on `cardDiscarded`/`handRevealed` (forced Countess discard, self-Prince, eliminated-by-own-Baron) and had no way to update it after a King trade. Fixed: those events now remove/replace the viewer's cards, and a King trade emits a private `handTraded` event per trader (card visible only to its owner; smoke's privacy assertion covers it). Regression tests in view.test.ts + king.test.ts. Also cleaned stale “Guard-only” comments and introduced a `TargetKind` alias.
