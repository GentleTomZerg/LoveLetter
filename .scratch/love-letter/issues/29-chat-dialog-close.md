# 29 — Chat dialog will not close unless you type and send

**What to build:** the reported behavior: the chat dialog "must input and send, or it will not shut down" — closing by outside click or Esc does not work for the reporter. The current implementation (ticket 20) closes on outside click (backdrop `onClick`), Esc (a `keydown` listener), and send; the ui-smoke `chatPill` scenario asserts all three on desktop. So either the report predates ticket 20's rework, or there is a device-specific gap (mobile? a modal that covers the whole viewport so "outside click" is the backdrop — which should still work? the input keeping focus?).

**Blocked by:** none

**Status:** ready-for-agent

- [x] Add a **visible close button** to the chat dialog (top-right ×/关闭, all screen sizes): on phones the dialog is near-fullscreen so there is no visible backdrop to tap, and there is no Esc key — the only working close was send
- [x] The close button uses the same `closeDialog` path (seen-baseline sync) as Esc/outside/send
- [x] ui-smoke: the chatPill scenario asserts the close button is visible and closes the dialog at phone size (the near-fullscreen case where outside-click is impractical)

## Comments

**Symptom (from to-discuss.md):** "The chat dialog must input and send, or it will not shut down"

**Context (2025):** the current `ChatDialog` (`Game.tsx`) closes via three paths: the backdrop's `onClick` (outside click), a window `keydown` Esc listener, and `send()` (which also clears the draft). The ui-smoke `chatPill` scenario drives Esc and outside-click closes and passes. Needs the reporter's device/browser + steps to distinguish a stale report from a real mobile gap. One candidate: on a phone the soft keyboard may stay up after the dialog closes, making it *feel* unclosed — the dialog itself may be gone while the keyboard remains.

**Repro (confirmed 2025):** iPhone Chrome — the dialog is near-fullscreen on phones, so "click outside" has no visible target, and there is no Esc key on a phone; the only working close was typing + sending. The desktop close paths (Esc / outside click / send) are covered by ui-smoke and remain.

**Implementation notes (ticket 29, 2025):** the dialog now has an explicit close button (×, top-right of the header, `aria-label` from the new `chat.close` key) that goes through the same `closeDialog` path as Esc/outside/send — so the seen-baseline stays in sync. On phones (the reported case: iPhone Chrome, near-fullscreen dialog with no visible backdrop and no Esc) it is now the always-available close. ui-smoke's chatPill scenario asserts the button is visible and closes the dialog at phone size.
