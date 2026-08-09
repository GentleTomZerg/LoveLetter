# 12 — Card abilities invisible on touch screens (no hover)

**What to build:** make every card's effect text readable on phones — the rules text currently lives in `title` tooltips, which only appear on desktop mouse hover.

**Blocked by:** none

**Status:** needs-triage

## Symptom (reported from real play, iPhones)

"My friend cannot see each roles ability, since iphone can not do mouse hover." Verified in code: `CardThumb` (`packages/client/src/screens/Game.tsx`) puts the effect text in the `title` attribute of each card image, and the discard-pile thumbs carry the same tooltip. Touch devices never see it — new players literally cannot learn what the cards do.

## Fix direction (decision needed — pick or combine)

- **(a) Rules reference panel** — a collapsible "Abilities" section (e.g. above the log or in the chat sidebar) listing all 8 cards with their effect text, always available. Also helps first-time players; likely the right primary fix.
- **(b) Effect line under each hand card** — a compact one-liner beneath the artwork in the hand. Always visible but adds vertical space.
- **(c) Tap-to-inspect** — tapping a card shows its text (needs care: hand cards currently play on click, so inspect would need a separate affordance or a play-confirmation step).

Existing behavior to preserve: the desktop tooltip can stay; rank badges and name captions already render on the card face.

## Acceptance

- [ ] On an iPhone, a player can read every card's effect without any mouse
- [ ] The card tooltips' information is fully represented in the UI (nothing hover-only)
- [ ] Hand click-to-play still works without accidental plays
