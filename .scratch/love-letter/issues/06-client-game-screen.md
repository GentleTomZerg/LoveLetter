# 06 — Client: full Game screen and chat UI

**What to build:** the complete player experience — every card's choice prompt works from the browser, the state of the table is fully visible (discards, protection, scoreboard), and chat runs in the sidebar. Functional-clean: readable, no animations.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] All choice prompts render from `pendingChoice`: target picker (Priest/Baron/Prince/King), Guard guess (target + card name)
- [ ] Hand renders both held cards; click-to-play works for every card
- [ ] Discard piles shown in play order; public log shows who played what (deduction needs this)
- [ ] Handmaid Protected badge on players; eliminated players shown out
- [ ] Scoreboard with tokens per player; rematch button appears at match end
- [ ] Chat sidebar with free text, connected to the server relay
- [ ] Renders purely from the event stream (reducer rebuilds state from events), including resume replay on reconnect
- [ ] Home → Lobby → Game flow completes for 2–4 players; room code join works
