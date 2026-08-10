# 20 — Chat pill + modal dialog

**What to build:** the chat sidebar becomes a floating pill (bottom-right, all screen sizes) that previews the newest chat message and carries an unread-count badge; clicking opens a modal dialog with the existing message list + input (grilling Q2, Q12–Q15).

**Blocked by:** 15 (chat strings go through the dictionary)

**Status:** ready-for-agent

- [ ] Floating pill, fixed bottom-right: shows the newest chat message inline (`Alice: hi`, truncated) + unread-count badge (count only — no animation, per the no-animation ethos)
- [ ] Unread count increments while the dialog is closed, clears on open; the preview always shows the newest message
- [ ] Click pill → modal dialog: dimmed backdrop, close on outside click / Esc / send, near-fullscreen on phones; the existing list + input + send flow move in unchanged
- [ ] Desktop layout: the 20rem chat column and the mobile 22rem block are removed; `.game-layout` is single-column at the current 1080px max-width (Q15)
- [ ] Chat is empty → pill shows a muted default ("Chat")
- [ ] Manual check + ui-smoke on desktop and phone viewport: send/receive, unread badge, close behaviors
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q2 two separate elements (this ticket) vs the log strip (ticket 19). Q12 pill with inline preview + badge. Q13 badge only, cleared on open. Q14 modal (not popover/sheet). Q15 single column, keep 1080px. The pill replaces the sidebar on desktop and the static block on mobile.
