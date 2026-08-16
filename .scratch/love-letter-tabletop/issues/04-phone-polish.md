# 36 — Phone polish: seat piles, seat header, animation pacing, draw sequencing, center table

**What to build:** five fixes from a real iPhone playtest of the ticket-35 layout. ① Opponent discard piles must read as an overlapping **pile** when they accumulate — on narrow phones the wrap broke the overlap (a wrapped row's first card pulled left, so rows looked jagged, not stacked) — give every card the same overlap and compensate the row start, so rows wrap cleanly (two rows on phones). ② The seat header — **name + hearts tokens (+ badges) share one line** so tiles stay short. ③ The card-moment animations are **too quick** — slow the stage durations (STAGE_MS) by roughly a third. ④ The **draw pop** (ticket 28's in-hand card pop) must **wait for the previous play's scene to fully drain** — it currently fires while the last animation is still playing. ⑤ The **center table still takes too much space** — collapse it to one compact horizontal row (deck stack + burned card + 2p face-ups) and drop the text labels (the tooltips and the manual carry that info).

**Blocked by:** none — a follow-up polish pass on the ticket-35 dock layout.

**Status:** resolved

- [x] **Pile alignment** (ring + dock): every `.pile img` carries the same `margin-left: -1.4rem` (the `:first-child` exception is gone — it made wrapped-row first cards pull left of the row start); the pile containers gain `padding-left: 1.4rem` so the first card's negative margin lands at the row start. Wrapped rows now align like a real stack — on phones a full pile reads as two neat rows.
- [x] **Seat header**: the ring seat becomes a `.seat-head` flex row — name, ♥ tokens, and the turn/protected/out/away badges on one line (wrapping on narrow tiles) with the cards row below; the dock's `.seat-row` already had this shape.
- [x] **Animation pacing**: `STAGE_MS` slows ~a third — fly 1000→1400, flyDirect 900→1250, flash 900→1200, pair 1200→1600, backFly 900→1250, caption 1500→2000, banner 2200→2800 (the knob stays in `scenes.ts`).
- [x] **Draw pop sequencing**: the `drawn` pop effect in Game.tsx returns while `scenes.busy` and re-fires when the queue drains — the drawn card never pops over the previous play's scene.
- [x] **Center table**: one horizontal row — deck stack + count, burned card, 2p face-ups — labels removed (`.burned-label`/`.face-up-label` deleted; `title` tooltips keep the info); `.center-table` is `flex-direction: row` with a small gap.
- [x] **core + typecheck + smoke + ui-smoke green** (the smoke's animation-timing waits still hold at the slower paces)

## Comments

**Source (2025 playtest):** real iPhone feedback on the ticket-35 layout. The pile issue is geometry: with `:first-child { margin-left: 0 }`, the first card of each *wrapped* row has no overlap pull, so rows misalign and the pile reads as a jagged grid on narrow tiles. Uniform margins + a compensated row start fix it without shrinking the thumbs (Q3(a)'s deduction surface stays).

**Implementation notes:** the draw-pop deferral keys on `scenes.busy`, so it needs no scene machinery — the pop is still a pure CSS moment (ticket 28), just gated. The center-table labels were the vertical space hogs (a text line each); the physical-card metaphor (ticket 33 Q8) survives without them. `runDrawPop` still passes — it polls until the `drawn` class appears, which now happens after the preceding scene drains.
