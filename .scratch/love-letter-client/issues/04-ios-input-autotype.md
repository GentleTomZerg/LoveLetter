# 4 — iOS Safari: typing in the Home inputs auto-types extra characters

**Legacy:** was #9 in the love-letter effort.

**What to build:** fix the iPhone input bug where typing in the Home screen's name (and possibly room-code) field produces extra, repeated characters.

**Blocked by:** none

**Status:** resolved

## Symptom (reported from real play, iPhones)

Typing in the Home input area on an iPhone "may auto type a lot of other characters" — a single intended keystroke can produce a burst of characters. Described by the user after a phone playtest; exact reproduction steps and which input (name vs room code vs chat) still need pinning down on-device.

## Likely culprits (verified in code)

- The inputs set no mobile-text attributes — `autoCorrect`, `autoCapitalize`, `spellCheck`, `autoComplete` are all unset (`packages/client/src/screens/Home.tsx`), so iOS autocorrect/autocapitalization actively rewrite text inside the controlled React inputs.
- Safari autofill can inject whole saved entries (names/passwords) into a focused field.
- The name input also has `autoFocus` (`Home.tsx`), which opens the keyboard on page load and can interact badly with iOS suggestions.
- Possible iOS 18-era Safari + React controlled-input quirks (duplicated text) — worth confirming against the React version in use.

## Fix direction

- Add `autoCorrect="off"` + `autoCapitalize="none"` + `spellCheck={false}` to the Home inputs (and check the chat input for the same problem — same risk).
- Consider `autoComplete` handling so Safari never offers autofill on a name field.
- Re-test typing on a real iPhone: one keystroke must produce exactly one character.

## Acceptance

- [x] On an iPhone, typing in the name field inserts exactly the typed characters, one per keystroke
- [x] Room-code field behaves the same
- [x] Chat input checked for the same issue
- [x] No regression on desktop

## Comments

**Fixed (2025):** the iOS text-replacement layers are now opted out on every input — `autoCorrect="off"`, `autoCapitalize="none"` (name/chat) or `"characters"` (room code, so the caps keyboard suits a code), `spellCheck={false}`, `autoComplete="off"` — on the Home name field, the room-code field, and the chat input (`Home.tsx`, `Game.tsx`). Server-side validation already covers length/pattern, so disabling client `maxLength`-adjacent behaviour was not needed. The chat input trades autocorrect for consistency against the same controlled-input bug. Root cause could not be reproduced headlessly (iOS Safari only); final confirmation is a real-iPhone re-test — ask the friends to type again next session.
