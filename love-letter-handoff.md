# Handoff — Love Letter Online: build session

**From:** a completed grilling session (design tree fully visited — every decision settled, nothing left to grill).
**To:** a fresh agent building the game in a new workspace.

---

## What this is

A from-scratch, multiplayer web implementation of **Love Letter** (original 16-card edition by Seiji Kanai / AEG 2012) in **TypeScript**. Two goals, both live: (1) a **learning project** for the user (clean, explainable code), and (2) something **friends can genuinely play** on a LAN. The user has approved every decision below; this session is purely **build**.

## First actions in the new workspace (do these before writing code)

1. **Copy the two research artifacts into the repo** (they live in the OS temp dir — ephemeral, copy early; suggest `docs/`):
   - `love-letter-rules-spec.md` — authoritative, cited rules spec for the original AEG 2012 16-card deck (deck composition, setup per player count, all 8 card effects verbatim, 2-player rules, scoring/tie-breaks, token targets, edge cases, commonly misimplemented flags).
   - `love-letter-art-research.md` — licensed-art research (verified-license asset options for card faces).
2. **Write the locked design below into `DESIGN.md`** in the new repo. The grilling ran the *stateless* `/grilling` primitive, so there is **no** `CONTEXT.md`/ADR paper trail — this handoff and `DESIGN.md` become the primary design record. Optionally seed a `CONTEXT.md` (domain glossary: Card, Intent, Event, Phase, Round, Match, Token, Grace) and an ADR recording the four adopted rules rulings.

---

## The project

**"Love Letter Online"** — server-authoritative multiplayer Love Letter: original 16-card deck, 2–4 players, full multi-round matches scored by tokens of affection (target: 7/5/4 by player count), played in a web browser. Local-first (LAN play), but architected so hosting is a config step later.

## Locked decisions (the full design tree, Q1–Q21)

| # | Decision | Choice | Note |
|---|---|---|---|
| Q1 | Purpose | Learn TS **and** playable with friends | Clean code + it must actually work for friends |
| Q2 | Ruleset | Original 16-card, 2–4 players | Engine should stay ruleset-agnostic enough that an extended deck is a config change |
| Q3 | Client | Web browser | — |
| Q4 | Bots | **Later** (not v1) | After engine stabilizes |
| Q5 | Deployment | Local-first, deploy-ready | Single Node process, state in memory |
| Q6 | Client stack | **React + Vite** | Server owns all state → client stays thin |
| Q7 | Networking | **Raw WebSocket** (`ws` server-side, native browser `WebSocket`) | Turn-based → tiny message volume; learn the real protocol |
| Q8 | Server runtime | **Node 22** | — |
| Q9 | Repo | **npm workspaces monorepo** | `core` / `server` / `client` |
| Q10 | Match structure | **Full multi-round with tokens** (7/5/4) | Scoreboard + rematch |
| Q11 | State model | **Server-authoritative engine + event log** | Clients render from event stream; log powers reconnect/replay/debug |
| Q12 | Disconnect | **Grace + auto-fold** | 60s grace; if their turn comes and still gone → out of the round; rejoin next round |
| Q13 | Turn timer | **None** | Soft clock maybe later |
| Q14 | Chat | **Simple free-text room chat** | ~30 lines on the WS layer; friends-only |
| Q15 | UI polish | **Functional-clean** | Readable cards, log, scoreboard; no animations |
| Q16 | Testing | **Vitest on `core`** | Per-card suites + rulings + random-play full-match simulation |
| Q17 | Rules rulings | **Adopt all four** (see below) | Matches AEG later editions / Board Game Arena |
| Q18 | Lobby | Creator picks capacity (2–4), **auto-start when full** | Rooms always support 2 |
| Q19 | MVP scope | **As proposed** | Lobby → full match → chat → event log → functional UI → engine tests |
| Q20 | Deploy target | **Local now, revisit later** | Fly.io is *not* a guaranteed free tier anymore (pay-what-you-use, sub-$5 invoices waived, card required) → deferred |
| Q21 | Card art | **game-icons.net icons (CC BY 3.0)** | On our own SVG card frames; one-line attribution screen |

## Complete design

### Stack
- npm workspaces monorepo: `core` / `server` / `client`
- `core`: pure TypeScript, zero dependencies, deterministic
- `server`: Node 22 + `ws`, in-memory rooms
- `client`: React + Vite, no router
- Tests: Vitest on `core`

### Repo layout
```
love-letter/
├── packages/
│   ├── core/        # engine: types, state, intents, events, rulings — no I/O
│   │   └── test/    # Vitest suites (per-card, edge rulings, full-match sim)
│   ├── server/      # http + ws, room registry, event log, reconnect, chat relay
│   └── client/      # React app: Home → Lobby → Game, renders from event stream
└── package.json     # workspaces, dev scripts (dev = run server + client)
```

### Engine (`core`)
- **State**: `phase` (lobby → round → roundEnded → matchEnded), per-player `{hand, protected, out, tokens, discardPile}`, `deck`, `burned` (face-down removed card), `faceUpRemoved` (2-player), `currentTurn`, `pendingChoice` (when an effect needs a target/guess).
- **Flow**: clients send **intents** (`playCard`, `choice`, `rematch`) → `apply(state, intent)` validates, resolves effects step-by-step, returns `{state, events[]}`. Illegal intents rejected, never guessed at.
- **Event log**: every transition appends events (`cardPlayed`, `choiceRequired`, `handRevealed`, `playerEliminated`, `roundEnded`, `matchEnded`, …). Log powers reconnect replay and debugging.
- **Two-phase play**: some effects need a follow-up choice (Guard: pick player + name a card; Priest/Baron/Prince/King: pick player) → model `pendingChoice` states; the turn isn't over until resolved.

### Protocol (JSON over WebSocket)
- C→S: `createRoom {name, capacity}` · `joinRoom {roomCode, name}` · `playCard {which: 0|1}` · `choice {...}` · `chat {text}` · `resume {playerId, lastEventId}`
- S→C: `hello {playerId, roomCode}` · `event {…}` (stream) · `chat` · `error`
- **Reconnect**: socket drops → 60s grace → if their turn comes and still gone, auto-fold out of the round; reconnect replays missed events from `lastEventId`; seat kept for next round.

### Server
- Node http server serving the client build + WS upgrade.
- Room registry: `Map<roomCode, Room>`; Room = `{players, game state, event log, chat log}`. In-memory only.

### Client (React)
- **Home**: name + create room (capacity 2–4) or join by code.
- **Lobby**: seats fill, room code shown, auto-start when full.
- **Game**: hand (click to play), discard piles in play order, public log (who played what — deduction requires this), choice prompts (target picker, Guard guess), Handmaid protection badge, scoreboard with tokens, rematch.
- **Chat**: sidebar, free text.
- Renders from the event stream (reducer rebuilding state from events).

### Testing
- Per-card effect suites (all 8), the four rulings as named tests, 2-player setup, token targets (7/5/4).
- **Random-play simulation**: thousands of full matches with random legal moves must never throw or deadlock.

### Art
- **game-icons.net** icons (CC BY 3.0 — attribution required, exact format: *"Icons made by {author}; Available on https://game-icons.net"*, per-icon author listed on each icon page). Board & Card tag: https://game-icons.net/tags/board.html.
- Our own SVG card frame/back (no license needed — we design it).
- One-line attribution/credits screen in the client.
- **No proprietary art.** The research (see artifact) verified no complete open-licensed Love Letter set exists; game-icons was the confirmed best route.

### Build order
1. Scaffold monorepo + tooling (workspaces, tsconfigs, vitest, dev scripts)
2. `core` engine + rulings — **test-first** (TDD; rules bugs hide here)
3. `server`: rooms, WS, event log, reconnect/grace
4. `client`: three screens, event rendering, chat
5. End-to-end playtest (two browser tabs), fix, polish
6. Art integration (game-icons)
7. Later milestones (not v1): bots, deploy decision

---

## Critical rules facts (compact — full detail + citations in `love-letter-rules-spec.md`)

- **Deck (16)**: Guard×5 (1), Priest×2 (2), Baron×2 (3), Handmaid×2 (4), Prince×2 (5), King×1 (6), Countess×1 (7), Princess×1 (8).
- **Setup**: 1 card removed face-down; **2-player also removes 3 face-up** (visible, unused for the round).
- **Tokens to win**: 2p → **7**, 3p → **5**, 4p → **4**. Round winner = last standing, or highest hand at deck-empty (tie → higher total of *discarded* values).
- **Effects are mandatory even when self-destructive** — e.g. forced self-Prince if everyone else is Handmaid-protected (can eliminate yourself holding the Princess).
- **Prince'd Princess = out, no replacement draw** (the discard clause overrides "draw a new card").
- **Countess** (7): must discard immediately whenever holding King or Prince — including right after a King trade. Does *not* trigger on the Princess. No effect when discarded.
- **Handmaid** (4): blocks being *chosen* by others' cards until the start of your next turn; does not block your own Prince or the Countess.
- **King** (6) trading the **Princess is legal** (a trade is not a discard). Cannot trade with a protected player; if all others protected, King does nothing.
- **Guard** (1): cannot name Guard; disallowed self-targeting (adopted ruling).

## Adopted rulings (Q17 — the 2012 rulebook is silent on these)
1. **Full tie** at round end (equal hand value *and* equal discard totals) → **all tied players get a token**.
2. **Countess after a King trade** → discard **immediately**.
3. **Guard self-targeting** → **disallowed**.
4. **2-player Prince empty-deck draw** → the **single face-down burned card** (face-up removed cards are never drawn).

## Suggested skills (for the build session)

- `/setup-matt-pocock-skills` — precondition before the first engineering flow in a fresh repo (issue tracker, triage labels, doc layout the other skills assume). Optional if the user prefers no tracker.
- `/to-spec` — turn this handoff + DESIGN.md into a buildable spec (this is a genuine multi-session build).
- `/to-tickets` — split the spec into tracer-bullet tickets with blocking edges; work blockers-first.
- `/implement` — per ticket; drives `/tdd` internally, closes with `/code-review` before committing.
- `/tdd` — red-green slices for the rules engine (the rulings above are perfect named test cases).
- `/code-review` — two-axis review (Standards + Spec) of each diff before commit.
- `/codebase-design` — deep-module vocabulary when shaping the `core` engine seam (small interface, deep behavior).
- `/domain-modeling` — optional: record the four adopted rulings as an ADR and pin the domain glossary in `CONTEXT.md`.

## Context notes / gotchas

- **Learning project**: prioritize clean, explainable code over cleverness. The user is learning TypeScript through this.
- **Trademark-safe naming**: use generic role titles only (Guard, Priest, …). Do **not** use character names (Prince Arnaud, Princess Annette — protected). "Love Letter" title is fine for private use; flag if public release is ever considered.
- **Research gaps flagged in the artifacts**: 2-player Prince empty-deck draw and Countess-after-trade timing have no 2012-official FAQ text — we adopted the rulings above (BGA/later-edition consensus); implement them, don't relitigate.
- **Fly.io decision**: NOT a guaranteed free tier (pay-what-you-use; invoices < ~$5 waived; card on file required). Deferred — host locally; keep the server a single containerizable Node process.
- **No sensitive data** in this project; nothing to redact.
