# 3 — zh-Hans content

**Legacy:** was #17 in the love-letter effort.

**What to build:** the actual Simplified Chinese translations (ADR-0004: one `zh` key). All content the plumbing in tickets 1–2 routed through the dictionary.

**Blocked by:** 1, 2

**Status:** resolved

- [x] Card names + effects for all 8 ranks
- [x] Log templates (all kinds + info sub-keys), including `You`/`yourself` forms and the list joiner (` and ` → `、`/`和`)
- [x] UI strings: Home, Lobby, Game screens, choice prompts, banners, round/match panels, chat, abilities list, leave confirm
- [x] Server error codes + room-closed texts
- [ ] Human pass: a Chinese speaker plays a round and reads every screen — any wording that reads as machine-translated gets fixed

## Comments

**Design (grilling session 2025, Q7):** Simplified only, single `zh` key. Traditional is a second dictionary later, not a fork.

**Implemented (2025):** all code boxes green — client vitest 7/7 (new seam), core 136, typecheck clean, smoke + ui-smoke green including a new locale round-trip scenario (en → 中文 → EN) with the browser locale forced to en-US via CDP.

- **Card names:** 守卫/祭司/男爵/侍女/王子/国王/伯爵夫人/公主. The ticket draft listed 僧侣 for Priest; the rules spec only cites English. Verified against the Taiwanese publisher's own demo rules (玩樂小子/Gokids PDF), which uses 祭司 (Traditional) — so **祭司** was chosen over 僧侣 and the deviation is intentional. If a Chinese player prefers 僧侣, it's a one-line change.
- **List joiner:** new shared `joinLocalizedList` — "A and B" / "A, B and C" in en, "A 和 B" / "A、B 和 C" in zh. Side effect: the en 3+ winner line changed from "A and B and C" to "A, B and C" (deliberate, arguably better English).
- **Human pass (unchecked):** rendering/completeness are covered by tests + the ui-smoke round-trip; naturalness — CJK spacing around `{name}` (e.g. "你 打出了 男爵"), tone, and phrasing — still needs a Chinese speaker to play a round and read every screen.
