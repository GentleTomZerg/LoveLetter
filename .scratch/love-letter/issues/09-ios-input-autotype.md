# 09 — iOS Safari: typing in the Home inputs auto-types extra characters

**What to build:** fix the iPhone input bug where typing in the Home screen's name (and possibly room-code) field produces extra, repeated characters.

**Blocked by:** none

**Status:** needs-triage

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

- [ ] On an iPhone, typing in the name field inserts exactly the typed characters, one per keystroke
- [ ] Room-code field behaves the same
- [ ] Chat input checked for the same issue
- [ ] No regression on desktop
