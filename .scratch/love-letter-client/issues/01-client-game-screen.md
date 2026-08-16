# 06 — Client: full Game screen and chat UI

**What to build:** the complete player experience — every card's choice prompt works from the browser, the state of the table is fully visible (discards, protection, scoreboard), and chat runs in the sidebar. Functional-clean: readable, no animations.

**Blocked by:** 03, 05

**Status:** resolved

- [x] All choice prompts render from `pendingChoice`: target picker (Priest/Baron/Prince/King), Guard guess (target + card name)
- [x] Hand renders both held cards; click-to-play works for every card
- [x] Discard piles shown in play order; public log shows who played what (deduction needs this)
- [x] Handmaid Protected badge on players; eliminated players shown out
- [x] Scoreboard with tokens per player; rematch button appears at match end
- [x] Chat sidebar with free text, connected to the server relay
- [x] Renders purely from the event stream (reducer rebuilds state from events), including resume replay on reconnect
- [x] Home → Lobby → Game flow completes for 2–4 players; room code join works

## Comments

**Implemented (2025):** most of the checklist landed with earlier client work (choice prompts, click-to-play hand, public log, protected badge, scoreboard/rematch, event-stream rendering + resume replay, Home → Lobby → Game — all exercised by the server smoke). This ticket adds the two missing pieces and verifies the whole screen for real:

- **Discard piles** — a `Discards` panel under the scoreboard renders every player's `discardPile` in play order as rank-keyed card images (public table state; the log's play/discard/reveal lines are the text side of the same deduction surface). Rendered via a shared `CardThumb` component (also used by the hand and the Guard picker — one image pattern, three call sites).
- **Chat sidebar** — the Game screen is now a two-column grid (collapses to one column under 900px): the table column and a sticky chat panel fed by `game.chat` (live relay + `chatLog` replay on resume, server-relay verified) with a free-text input (Enter to send, disabled while empty, `maxLength` matches the server's 200).
- **UI smoke (`npm run ui-smoke`)** — a headless-Chrome CDP driver (`packages/server/scripts/ui-smoke.ts`) that plays the real client: two tabs create/join by room code, auto-start into a 2-player round, click cards until both players have face-up discards, and chat across tabs (own messages marked). It serves the built client (guards against a missing/stale build) and saves screenshots to a temp dir for a human look. This is the automated half of ticket 07's human playtest.

**Verification:** typecheck clean across all three workspaces, 109 core tests green, server smoke green, client build green, ui-smoke green (real game + chat in two headless tabs).

**Review:** two-axis code review (standards + spec) found no blockers. Fixed from findings: renamed the shared panel-title class (was `discards-title` on the chat panel), extracted `CardThumb` to kill the tripled card-image pattern, corrected the `Discards` doc comment, targeted `.screen.game` directly instead of a third class, consolidated the duplicated 900px media query, and added a build-freshness guard + move-order comment to the UI smoke. One deliberate non-fix: the discard-row name keeps its hover tooltip — names truncate at 7rem and the tooltip restores the full text.
