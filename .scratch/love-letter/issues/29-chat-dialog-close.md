# 29 — Chat dialog will not close unless you type and send

**What to build:** the reported behavior: the chat dialog "must input and send, or it will not shut down" — closing by outside click or Esc does not work for the reporter. The current implementation (ticket 20) closes on outside click (backdrop `onClick`), Esc (a `keydown` listener), and send; the ui-smoke `chatPill` scenario asserts all three on desktop. So either the report predates ticket 20's rework, or there is a device-specific gap (mobile? a modal that covers the whole viewport so "outside click" is the backdrop — which should still work? the input keeping focus?).

**Blocked by:** none

**Status:** needs-info

- [ ] Reproduce on the current build: does the dialog close on Esc / outside click / send in the reporter's environment (device + browser)?
- [ ] If reproducible: fix the failing path(s); if not reproducible on any environment we can test: close as wontfix with the smoke coverage noted
- [ ] ui-smoke keeps asserting close-on-send / Esc / outside-click; add the device case if it reproduces

## Comments

**Symptom (from to-discuss.md):** "The chat dialog must input and send, or it will not shut down"

**Context (2025):** the current `ChatDialog` (`Game.tsx`) closes via three paths: the backdrop's `onClick` (outside click), a window `keydown` Esc listener, and `send()` (which also clears the draft). The ui-smoke `chatPill` scenario drives Esc and outside-click closes and passes. Needs the reporter's device/browser + steps to distinguish a stale report from a real mobile gap. One candidate: on a phone the soft keyboard may stay up after the dialog closes, making it *feel* unclosed — the dialog itself may be gone while the keyboard remains.
