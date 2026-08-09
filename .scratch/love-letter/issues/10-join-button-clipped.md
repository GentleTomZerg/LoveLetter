# 10 — Home: Join-room button half-clipped on narrow phone screens

**What to build:** make the Home page's join row fit phone viewports so the Join room button is never cut off at the screen edge.

**Blocked by:** none

**Status:** needs-triage

## Symptom (reported from real play, iPhones)

"The home page join room button, only half appears in the screen of the phone" — the button is clipped at the right edge on iPhone-width viewports.

## Root cause (verified in code)

`.row` (`packages/client/src/index.css:104`) is a non-wrapping flex row. Its child `.code-input` has `flex: 1` but no `min-width` override — inputs default to `min-width: auto` and refuse to shrink below their intrinsic width, which the room code's `letter-spacing: 0.2em` widens further. On a narrow phone the intrinsic input + button exceeds the row, so the button overflows past the viewport edge.

## Fix direction

- `min-width: 0` on `.code-input` so it can actually shrink inside the flex row (the standard flexbox fix), and/or
- `flex-wrap: wrap` on `.row` so an overflow row wraps instead of clipping, and/or
- a small-screen padding reduction (`.screen` uses `1.5rem` horizontal padding on all devices).

## Acceptance

- [ ] On a 375pt-wide iPhone, both Create room and Join room buttons are fully visible
- [ ] Also verified at 320pt (small iPhone SE) and 430pt (Pro Max) widths
- [ ] No regression on desktop
