# 0002 — Match winner when two players reach the token target in the same round

The 2012 rulebook says the match ends when a player accumulates the target tokens. The four rulings in ADR-0001 cover *round*-end ties (full tie → all tied players get a token). That ruling makes it possible for **two players to reach the match's token target in the same round** (both tied for the round win, both at the target). The rulebook is silent on this — a match can have only one winner.

**Decision:** when a round ends and more than one player has reached the token target, the match winner is the first of them in seat order. Every qualifying player still receives their token; the scoreboard shows the result.

**Status:** accepted. Found during ticket 02 (tracer bullet) implementation; the full-tie-at-target case is only reachable through ruling 1 (ADR-0001).
