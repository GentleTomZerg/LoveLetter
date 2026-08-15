# Love Letter — Visual Redesign: Light & Dark (the "Sealed Love Letter" reskin)

**Status:** ready-for-agent

**Type:** spec

**Effort:** love-letter-visual-redesign

## Problem Statement

The game is fully playable and well-engineered, but it looks like a productivity
app. The current client skin is a flat, light "functional-clean" theme: a cream
background, white panels, system fonts, and a terracotta accent. The card art —
ivory-parchment faces with jewel-toned illustrations and a deep crimson logo —
is the only part of the screen that feels like a game. Friends asked to play
deserve a frame that matches the cards: a table that feels like a real game of
court intrigue, and that respects whether they are playing in daylight or late
at night.

The redesign must not break any of the hard-won behavior behind the current UI:
the fixed-stage tabletop, the scene animations, the choice/tap-the-seat flow,
the deduction surface (everyone's discard piles), reconnect/grace, i18n, and the
portrait-lock for phones.

## Solution

Give the whole client two deliberate, cohesive themes that come from the card
art itself, with a first-class toggle:

- **Light — "Parchment"**: ivory surfaces, warm brown ink, the logo's crimson as
  the brand accent, antique gold for anything the active player can do. The
  cards sit on the table as if on the paper they were drawn on.
- **Dark — "Night court"**: a midnight indigo table, parchment-colored text,
  candlelight gold, a brighter crimson. The same ivory cards glow like lit
  lanterns.

Both themes share one token system (CSS custom properties), one type system
(Fraunces for display, Karla for body — bundled, so LAN play needs no CDN), and
one signature element: the **tokens of affection as wax-seal hearts** — each
seat shows its progress toward the match target as a row of heart seals; won
seals are crimson wax with a gold rim, empty slots are faint pressed outlines.
The active player's moments are marked in gold (turn ring, playable hand,
choice-lit seats), errors and outs in crimson/rose, protection in ice blue —
the semantics never rely on color alone.

No layout overhaul, no new gameplay: the fixed stage, the seat ring, the dock,
the overlays, and the scene animations keep their shape and their DOM hooks.
The single new piece of logic is theme resolution (system preference default,
manual toggle, persisted choice); the single new test seam is the existing CDP
UI smoke suite, extended with a theme section.

## User Stories

1. As a player opening the game for the first time, I want the app to match my
   system's light/dark preference, so that I'm not blinded at midnight or lost
   in a dark room at noon.
2. As a player, I want a visible toggle to switch between light and dark at any
   moment, so that I can choose what suits my lighting.
3. As a player, I want my theme choice to survive a reload and a reconnect, so
   that I don't have to re-pick every session.
4. As a player on the Home screen, I want the crest, tagline, name field, and
   room controls to read clearly on both themes, so that the entry point sets
   the mood of the game.
5. As a player in the Lobby, I want the room code and the seat list legible in
   both themes, so that I can confirm who is at the table.
6. As a player at the table, I want my seat and every opponent seat readable in
   both themes — name, tokens, turn/protected/out/reconnecting badges, discard
   pile, and hand count — so that the deduction surface never dims.
7. As a player, I want my tokens of affection shown as a row of wax-seal hearts
   that fill as I win rounds, so that the score reads as a story, not a number.
8. As a player, I want the numeric "♥ n/target" still present, so that the
   exact target stays available to anyone who wants it (and to the existing UI
   contract).
9. As a player whose turn it is, I want my seat ringed in gold candlelight in
   both themes, so that I always know the spotlight is on me.
10. As a player, I want my playable hand cards to read as "live" (gold) in both
    themes, so that I can see at a glance what I can do.
11. As a player holding a choice (Priest/Baron/Prince/King/Guard), I want the
    legal target seats lit in gold on both themes, so that tap-the-seat still
    guides my eye.
12. As a player with a selected card, I want the selection and the Play chip
    clearly distinct from the "playable" affordance in both themes.
13. As a Handmaid-protected player, I want my protection badge legible in both
    themes, so that I know I'm safe.
14. As an eliminated player, I want my seat visibly dimmed and struck through
    in both themes, so that the state change is unmistakable.
15. As a player watching a card scene, I want the fly/flash/tag/caption/banner
    animations to use theme-appropriate surfaces, so that they feel part of the
    table rather than white stickers on it.
16. As a player who prefers reduced motion, I want every theme change to keep
    the existing reduced-motion behavior intact, so that the reskin never adds
    unrequested animation.
17. As a keyboard user, I want a visible focus ring on every interactive
    element in both themes, so that I can tab through the game.
18. As a player reading the game log or chat, I want the wells and text legible
    in both themes, so that the deduction surface stays readable at night.
19. As a player opening the rules manual, I want the three sections and the
    card list legible in both themes, so that rules lookup works in any light.
20. As a player on a phone, I want the portrait layout, hand sizing, and the
    rotate notice to keep working in both themes, so that the reskin never
    regresses mobile play.
21. As a Chinese-language player, I want the theme toggle labels translated and
    the game to keep rendering in Simplified Chinese in both themes, so that
    the reskin doesn't leak English (CJK text may fall back to system fonts —
    that is acceptable).
22. As a player, I want the deck at the center table to keep its count and
    pulse on draws in both themes, so that the public deck state is unchanged.
23. As a player, I want the round/match-end panels and the rematch flow to work
    in both themes, so that the end of a match feels as considered as the
    match itself.
24. As a player joining mid-match or reconnecting, I want the reconnect and
    grace flows visually unchanged in both themes, so that nothing about seat
    holding is obscured by the reskin.
25. As a developer, I want the entire existing UI smoke contract to keep
    passing, so that the reskin is provably presentation-only.
26. As a developer, I want a smoke assertion that the theme actually switches
    (system default → manual toggle → persistence), so that the one new piece
    of logic is guarded at the highest seam.

## Implementation Decisions

### Architecture: one token system, two themes

- Themes are selected by a `data-theme` attribute on the root element
  (`light` / `dark`), and every color in the client resolves through CSS custom
  properties defined for both themes. No component may hard-code a color.
- Theme resolution is a single small module: initial value = persisted choice
  (localStorage) if present, else the `prefers-color-scheme` media query;
  toggling updates the attribute and persists the choice. A tiny inline script
  runs before React mounts so there is no light→dark flash on first paint.
- A `ThemeProvider` (context) exposes `{ theme, toggle }`; buttons live on the
  Home screen (beside the locale toggle, outside the create/join panel so the
  smoke's first-panel-button assertion is untouched) and in the game's merged
  top bar (a compact icon button, aria-labeled).
- Two new locale keys (`theme.light`, `theme.dark`) with real Simplified
  Chinese translations — the existing `zh: Record<MessageKey, string>` type and
  the zh-stub test force this.

### Palette (the token tables)

Derived from the card art: the card faces are warm ivory parchment
(`#D0C0A0`-family), the logo is deep crimson, and the decks' backs are
parchment with a crimson medallion (light) or crimson with a parchment
medallion (deep).

| Token | Light — "Parchment" | Dark — "Night court" | Role |
|---|---|---|---|
| `--bg` | `#F1EADC` | `#171820` | page / table ground |
| `--surface` | `#FCF8EF` | `#22232F` | panels, bars, docks |
| `--surface-2` | `#EAE1CC` | `#1A1B24` | wells (log, chat, lists) |
| `--ink` | `#3A2F24` | `#EDE4D0` | primary text |
| `--ink-soft` | `#7A6C57` | `#A49A83` | muted text |
| `--line` | `#DCD1B9` | `#343650` | hairlines |
| `--crimson` | `#A3311F` | `#D4624B` | brand / wax seal / errors |
| `--crimson-soft` | `#F7E6DE` | `#3B2621` | soft crimson ground |
| `--gold` | `#A87C1E` | `#DFB76B` | action: turn, playable, choice, selection |
| `--gold-soft` | `#F3E9CD` | `#3C3423` | soft gold ground |
| `--gold-ink` | `#2E2413` | `#2E2413` | text on gold fills |
| `--ice` / `--ice-soft` | `#5D7FB0` / `#E6ECF6` | `#96B1E2` / `#232C42` | Handmaid protection |
| `--rose` / `--rose-soft` | `#B0574C` / `#F7E9E4` | `#E08A96` / `#3A2429` | out / warn |

Semantic mapping (unchanged meaning, new hues): gold = the active player's
moments (turn ring, playable hand, choice-lit seats, selected chip) — these
states never co-occur, so one action color is unambiguous; crimson = brand,
primary buttons, Guard accusation, errors; ice = protected; rose = out /
reconnecting; neutral hairlines + surfaces carry everything else. All states
keep non-color signals (text badges, rings, strikethrough, opacity).

### Typography

- Display: **Fraunces** (regular + semibold + bold + italic) — a soft,
  high-contrast old-style serif with love-letter warmth. Used with restraint:
  Home tagline and title, Lobby room code, panel titles, manual headings,
  round/match-won moments, the log header.
- Body/UI: **Karla** (regular, medium, bold) — a warm humanist sans for log
  entries, chat, names, buttons, and captions at small sizes.
- Both are bundled via fontsource packages so the LAN-first deployment needs no
  runtime CDN. Neither covers CJK: Simplified Chinese falls back to system
  serif/sans — acceptable and unchanged from today's behavior.
- Numeric contexts (tokens, deck count, hand counts) keep tabular figures.

### Signature: the wax-seal hearts

- Each seat (ring tiles and the viewer's dock) shows its tokens as a row of
  heart seals sized to the match target (7/5/4). Filled seals are crimson wax
  with a gold rim and a subtle sheen; empty slots are faint pressed outlines.
- The existing numeric `♥ n / target` text stays inside the seat's tokens
  element — it is the accessible/dense form and part of the current UI
  contract (the smoke suite asserts it contains `♥`).
- This is the one memorable spend; everything else around it stays quiet and
  disciplined. The center table gains a barely-there radial "candle pool" glow
  behind the deck, and nothing else new animates (scene animations are
  untouched; the deck-count pulse stays).

### DOM contract (must not change)

The reskin preserves every hook the UI smoke suite asserts: the `.tokens`
element containing `♥`, `.hand button.card` (+ `.selected`), `.seat .hand-count`,
`.top-meta span`s, `.screen.lobby h1`, the dock's `.seat-row .name/.tokens/
.hand-count`, `.log-modal` + `.open`, `.abilities-list` rows, `.duel/.three/
.four` layout classes, `data-player-id` seat hooks, and the `.scenes`/`.scene-*`
layer. Only CSS and additive JSX change.

### Quality floor

- Visible `:focus-visible` outlines (gold ring) on every interactive element,
  in both themes.
- `prefers-reduced-motion` keeps disabling scenes, pops, and pulses exactly as
  today; the reskin adds no new ambient animation beyond the candle-pool glow,
  which is also gated behind `no-preference`.
- The portrait-lock rotate notice and phone sizing remain intact.

## Testing Decisions

### One seam: the CDP UI smoke suite

The redesign is presentation-only, so the engine (`core`) and server are
untouched. The client's CDP smoke suite — a real Chrome over a real server —
is the repo's existing highest UI seam (it already covers the log modal, chat
dialog, dock fields, hand selection, and layout classes) and is the single
place the reskin is guarded.

A good test asserts external behavior only, never CSS internals: after
navigation with an emulated dark system preference, the root `data-theme` is
`dark`; clicking the toggle flips it to `light`; reloading keeps the manual
choice; and every pre-existing assertion in the suite (♥ tokens, hand cards,
log modal open/close, seat turn/out classes, dock fields, selection) still
passes in both themes. The suite's existing helpers (`waitFor`, `eval`,
`setViewport`, `setReducedMotion`) are the prior art; system-preference
emulation follows the same `setReducedMotion` approach via the CDP media
emulation.

### Guardrails that already exist (no new seams)

- `tsc --noEmit`: the `zh: Record<MessageKey, string>` type makes a missing
  theme key a compile error.
- The zh-stub vitest test: new keys must have real translations, not English.
- `vite build`: font imports and assets must resolve.
- Manual visual critique via the CDP screenshot helper (light/dark ×
  Home/Lobby/Game × desktop/phone) is a dev tool, not an assertion.

## Out of Scope

- Any change to the engine, rules, rulings, or protocol.
- Any change to the smoke suite's existing DOM assertions (the contract is
  frozen; the reskin adapts to it).
- Layout overhaul: the fixed stage, seat ring, dock, and overlay structure stay
  as designed.
- New gameplay features (bots, timers, spectating, extended deck).
- Replacing or regenerating the card art, the card backs, or the logo.
- CJK display typography beyond system-font fallback.
- More than two themes.

## Further Notes

- **Why this direction (design review):** the light mode sits deliberately
  close to the card art's own ground (ivory parchment + crimson + serif), which
  is what makes it *not* a generic template: the parchment is the literal card
  face color and the crimson is the literal logo color. The dark mode is the
  bolder half — the ivory cards become the light source on a night table. The
  pair is differentiated from template designs by the gold candlelight action
  language, the wax-seal hearts, the Fraunces-soft + Karla pairing, and the
  fact that the whole thing is two themes sharing one token system.
- **Domain vocabulary:** "tokens of affection" (hearts) per CONTEXT.md — never
  "points"; the hearts are the game's own scoring unit, so the wax seals are
  structure-is-information, not decoration.
- **Trademark safety:** role titles only (Guard, Priest, …), no character
  names; unchanged by this spec.
- **Bundled fonts:** the game is LAN-first (Q20), so fonts must not depend on a
  runtime CDN; fontsource packages compile into the client build.
