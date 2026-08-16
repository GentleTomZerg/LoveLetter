# 20 — Chat pill + modal dialog

**What to build:** the chat sidebar becomes a floating pill (bottom-right, all screen sizes) that previews the newest chat message and carries an unread-count badge; clicking opens a modal dialog with the existing message list + input (grilling Q2, Q12–Q15).

**Blocked by:** 15 (chat strings go through the dictionary)

**Status:** resolved

- [x] Floating pill, fixed bottom-right: shows the newest chat message inline (`Alice: hi`, truncated) + unread-count badge (count only — no animation, per the no-animation ethos)
- [x] Unread count increments while the dialog is closed, clears on open; the preview always shows the newest message
- [x] Click pill → modal dialog: dimmed backdrop, close on outside click / Esc / send, near-fullscreen on phones; the existing list + input + send flow move in unchanged
- [x] Desktop layout: the 20rem chat column and the mobile 22rem block are removed; `.game-layout` is single-column at the current 1080px max-width (Q15)
- [x] Chat is empty → pill shows a muted default ("Chat")
- [x] Manual check + ui-smoke on desktop and phone viewport: send/receive, unread badge, close behaviors
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q2 two separate elements (this ticket) vs the log strip (ticket 19). Q12 pill with inline preview + badge. Q13 badge only, cleared on open. Q14 modal (not popover/sheet). Q15 single column, keep 1080px. The pill replaces the sidebar on desktop and the static block on mobile.

**Implemented (2025):** `ChatPanel` became `ChatDialog` — a fixed bottom-right pill previews the newest message (`You`/name + text, muted `chat.title` when empty) with a count-only badge; clicking opens a modal (dimmed backdrop, `role="dialog"`) reusing the unchanged list/input/send markup. Closes on outside click, Esc, or send; near-fullscreen (100vw/100dvh) under 640px. `.game-layout` is single-column at 1080px; the old `.chat` sidebar and the 900px block are gone.

- **Unread model:** counts *others'* messages beyond a seen baseline — own messages never badge (the relay echoes them back to this socket; the reviewer-flagged self-badge bug is fixed and locked by a ui-smoke assertion on the sender's pill). Baseline advances on open/close; a replaced/cleared chat (resume chatLog) resets it. Esc closes through the same path as outside click/send so the baseline stays in sync.
- **Review findings fixed:** self-echo badging, Esc bypassing the seen baseline, duplicated name ternary (extracted `isMine`/`fromName`), dead `inputRef` (now autofocuses on open).
- **Verification:** typecheck clean, client 13/13, core 136/136, server smoke OK, ui-smoke OK including the new `runChatPill` (empty default, badge 2→cleared on open→1, sender never badged, close on send/Esc/outside click, near-fullscreen at 375px) and updated render/reload chat flows.
- **Known edge:** after a page reload the restored chatLog history counts toward the badge until the dialog opens (accepted, transient).
- **Human pass (unchecked):** eyeball the pill and modal on a real phone.
