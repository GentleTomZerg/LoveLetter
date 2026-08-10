# 17 — zh-Hans content

**What to build:** the actual Simplified Chinese translations (ADR-0004: one `zh` key). All content the plumbing in tickets 15–16 routed through the dictionary.

**Blocked by:** 15, 16

**Status:** ready-for-agent

- [ ] Card names + effects for all 8 ranks (match official 2012 names where applicable: 守卫/僧侣/男爵/侍女/王子/国王/伯爵夫人/公主 — verify against the rules spec)
- [ ] Log templates (all kinds + info sub-keys), including `You`/`yourself` forms and the list joiner (` and ` → `、`/`和`)
- [ ] UI strings: Home, Lobby, Game screens, choice prompts, banners, round/match panels, chat, abilities list, leave confirm
- [ ] Server error codes + room-closed texts
- [ ] Human pass: a Chinese speaker plays a round and reads every screen — any wording that reads as machine-translated gets fixed

## Comments

**Design (grilling session 2025, Q7):** Simplified only, single `zh` key. Traditional is a second dictionary later, not a fork.
