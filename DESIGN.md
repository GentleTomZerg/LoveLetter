# Love Letter Online — Design

Primary design record. Source: grilling session (stateless `/grilling` primitive, handoff `love-letter-handoff.md` — every decision Q1–Q21 was settled and approved; nothing left open). Rules details live in `docs/love-letter-rules-spec.md` (authoritative, cited); art licensing in `docs/love-letter-art-research.md`.

## The project

**"Love Letter Online"** — server-authoritative multiplayer Love Letter: original 16-card deck, 2–4 players, full multi-round matches scored by tokens of affection (target: 7/5/4 by player count), played in a web browser. Local-first (LAN play), but architected so hosting is a config step later.

## Goals (Q1)

1. **Learning project** — the user is learning TypeScript: clean, explainable code over cleverness.
2. **Playable with friends** — it must actually work for friends on a LAN.

## Locked decisions (Q1–Q21)

| # | Decision | Choice | Note |
|---|---|---|---|
| Q1 | Purpose | Learn TS **and** playable with friends | Clean code + it must actually work |
| Q2 | Ruleset | Original 16-card, 2–4 players | Engine ruleset-agnostic enough that an extended deck is a config change |
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
| Q15 | UI polish | **Functional-clean** | Readable cards, log, scoreboard; no *decorative* animation — card-moment motion is functional and reduced-motion aware (ADR-0007) |
| Q16 | Testing | **Vitest on `core`** | Per-card suites + rulings + random-play full-match simulation |
| Q17 | Rules rulings | **Adopt all four** (see below) | Matches AEG later editions / Board Game Arena |
| Q18 | Lobby | Creator picks capacity (2–4), **auto-start when full** | Rooms always support 2 |
| Q19 | MVP scope | **As proposed** | Lobby → full match → chat → event log → functional UI → engine tests |
| Q20 | Deploy target | **Local + on-demand tunnel for remote play** | `scripts/play.sh`: free cloudflared quick tunnel (https URL per session, no account) over the local server — matches "open it when a friend wants to play". Always-on hosting (Vercel/Render/Bonto/Fly) deferred: Vercel WS beta caps at 300s & pins connections to one instance; Render/Bonto free tiers sleep on idle; Fly has no free tier |
| Q21 | Card art | **User-provided PNGs** (rank-keyed in `client/public/cards`) | Replaces the game-icons plan; source/license TBD |

## Stack

- npm workspaces monorepo: `core` / `server` / `client`
- `core`: pure TypeScript, zero dependencies, deterministic
- `server`: Node 22 + `ws`, in-memory rooms
- `client`: React + Vite, no router
- Tests: Vitest on `core`

## Repo layout

```
love-letter/
├── packages/
│   ├── core/        # engine: types, state, intents, events, rulings — no I/O
│   │   └── test/    # Vitest suites (per-card, edge rulings, full-match sim)
│   ├── server/      # http + ws, room registry, event log, reconnect, chat relay
│   └── client/      # React app: Home → Lobby → Game, renders from event stream
└── package.json     # workspaces, dev scripts (dev = run server + client)
```

## Engine (`core`)

- **State**: `phase` (lobby → round → roundEnded → matchEnded), per-player `{hand, protected, out, tokens, discardPile}`, `deck`, `burned` (face-down removed card), `faceUpRemoved` (2-player), `currentTurn`, `pendingChoice` (when an effect needs a target/guess).
- **Flow**: clients send **intents** (`playCard`, `choice`, `rematch`, plus `createRoom`/`joinRoom`/`nextRound`) → `apply(state, intent, rng?)` validates, resolves effects step-by-step, returns `{state, events[]}`. Illegal intents rejected, never guessed at. `apply` clones the state first (callers keep their reference) and is deterministic for a given `rng` — tests inject a seeded PRNG.
- **Event log**: every transition appends events (`cardPlayed`, `choiceRequired`, `handRevealed`, `playerEliminated`, `roundEnded`, `matchEnded`, …). Log powers reconnect replay and debugging.
- **Two-phase play**: some effects need a follow-up choice (Guard: pick player + name a card; Priest/Baron/Prince/King: pick player) → model `pendingChoice` states; the turn isn't over until resolved.

## Protocol (JSON over WebSocket)

- C→S: `createRoom {name, capacity}` · `joinRoom {roomCode, name}` · `playCard {which: 0|1}` · `choice {…}` · `nextRound` · `rematch` · `resume {playerId, lastEventId}` · `chat {text}`
- S→C: `hello {playerId, roomCode}` · `snapshot {view, lastEventId}` · `event {id, event}` (stream) · `chat {from, name, text}` · `chatLog {messages}` (on resume) · `error`
- **Join flow**: server sends `hello` → `snapshot` (the player's private view, including their own hand) → then streams `event`s. A joiner's snapshot already reflects their own join (and any auto-start), so the join-triggered batch goes only to pre-existing sockets — no double-apply. Draw/deal/peek events are public table state (the deck count, the shrink, a Priest's look) but carry the card only to the named player — other recipients see `card: null`, while the authoritative room log keeps the full event. Every `event` packet carries its log id; `snapshot.lastEventId` is the id the snapshot covers.
- **Reconnect**: socket drops → 60s grace (configurable; the seat is held). If their turn comes and they're still gone when the window expires, the server auto-folds them out of the round (a system-issued engine intent — hand revealed like any elimination); the seat stays for the next round. `resume {playerId, lastEventId}` rebinds the seat to a new socket and replays every event after `lastEventId`, filtered per-player (private card payloads stay private through replay); a client that kept its view folds the replay onto it, a fresh client uses the snapshot. A room whose last socket left is deleted after one grace window. A duplicate resume replaces the old socket.
- **Chat**: `chat {text}` is relayed to the whole room (echo included) and kept on a bounded room-side chat log, resent as `chatLog` on resume. ~30 lines on the WS layer; the engine never sees it.

> Engine status: complete for the original 16-card deck (tickets 02 + 03). All eight cards resolve in `resolvePlayedCard` — Guard/Priest/Baron/King/Prince ask for a target (and the Guard a card name) via `pendingChoice`; Handmaid protects; the Countess forces an immediate discard while holding the King/Prince; the Princess eliminates whoever discards her. Effects are mandatory even when self-destructive. Ticket 05 adds one system-issued intent: `fold` — the server folds a dropped player whose grace window expired when their turn comes (hand revealed like any elimination, open choice abandoned, seat kept for the next round; the last in-round player is never folded).

## Server

- Node http server serving the client build + WS upgrade.
- Room registry: `Map<roomCode, Room>`; Room = `{code, state, sockets, event log}`. In-memory only.

## Client (React)

- **Home**: name + create room (capacity 2–4) or join by code.
- **Lobby**: seats fill, room code shown, auto-start when full.
- **Game**: hand (click to play), discard piles in play order, public log (who played what — deduction requires this), choice prompts (target picker, Guard guess), Handmaid protection badge, scoreboard with tokens, rematch.
- **Chat**: sidebar, free text.
- Renders from the event stream (reducer rebuilding state from events).

## Testing

- Per-card effect suites (all 8), the four rulings as named tests, 2-player setup, token targets (7/5/4).
- **Random-play simulation**: thousands of full matches with random legal moves must never throw or deadlock.

## Art (Q21)

- **Card art: user-provided PNGs** in `packages/client/public/cards/` — one 903×1296 full-card image per rank (`1.png`–`8.png`), two card backs, and a logo. Files are rank-keyed so the image filenames never leak display names. (Source/license of the PNGs: TBD — confirm with the author before any public release; see the original game-icons plan below.)
- Original plan (superseded): game-icons.net icons (CC BY 3.0) on our own card frames, with the required one-line attribution screen. Research verified no complete open-licensed Love Letter set exists.
- **No proprietary art** and trademark-safe role titles only (no character names) still apply. Note: the provided rank-2 artwork is captioned "Spy" in its filename (the 2019 Z-Man name); the game displays the original 2012 name "Priest" regardless. Confirmed with the author (2025): the art itself reads as a Spy — regenerate/replace `client/public/cards/2.png` before any public release (the file is rank-keyed, so swapping the image is a drop-in change with no code edits).
- **License status (2025):** the PNG set's provenance is unconfirmed (the author cannot verify the source; the images carry no metadata, and no verified-license complete Love Letter set exists per the art research). The set stays private — LAN play only. Any public release is blocked until the license is confirmed or the art is replaced with verified-licensed originals.

## Rules core facts

- **Deck (16)**: Guard×5 (1), Priest×2 (2), Baron×2 (3), Handmaid×2 (4), Prince×2 (5), King×1 (6), Countess×1 (7), Princess×1 (8).
- **Setup**: 1 card removed face-down; **2-player also removes 3 face-up** (visible, unused for the round).
- **Tokens to win**: 2p → **7**, 3p → **5**, 4p → **4**. Round winner = last standing, or highest hand at deck-empty (tie → higher total of *discarded* values).
- **Effects are mandatory even when self-destructive** — e.g. forced self-Prince if everyone else is Handmaid-protected (can eliminate yourself holding the Princess).
- **Prince'd Princess = out, no replacement draw** (the discard clause overrides "draw a new card").
- **Countess** (7): must discard immediately whenever holding King or Prince — including right after a King trade. Does *not* trigger on the Princess. No effect when discarded.
- **Handmaid** (4): blocks being *chosen* by others' cards until the start of your next turn; does not block your own Prince or the Countess.
- **King** (6) trading the **Princess is legal** (a trade is not a discard). Cannot trade with a protected player; if all others protected, King does nothing.
- **Guard** (1): cannot name Guard; disallowed self-targeting (adopted ruling).
- Full detail + citations: `docs/love-letter-rules-spec.md`.

## Adopted rulings (Q17 — 2012 rulebook silent on these)

1. **Full tie** at round end (equal hand value *and* equal discard totals) → **all tied players get a token**.
2. **Countess after a King trade** → discard **immediately**.
3. **Guard self-targeting** → **disallowed**.
4. **2-player Prince empty-deck draw** → the **single face-down burned card** (face-up removed cards are never drawn).

Recorded as ADR-0001 (`docs/adr/0001-four-rules-rulings.md`). Ruling 1 makes a second edge reachable — two players reaching the match target in the same round — resolved as ADR-0002 (`docs/adr/0002-match-winner-on-simultaneous-target.md`).

## Gotchas

- **Trademark-safe naming**: use generic role titles only (Guard, Priest, …). Do **not** use character names (Prince Arnaud, Princess Annette — protected). "Love Letter" title is fine for private use; flag if public release is ever considered.
- **Research gaps flagged**: 2-player Prince empty-deck draw and Countess-after-trade timing have no 2012-official FAQ text — adopted rulings above (BGA/later-edition consensus); implement them, don't relitigate.
- **Fly.io**: NOT a guaranteed free tier → deferred. Keep the server a single containerizable Node process.
- **No sensitive data** in this project; nothing to redact.

## Build order (multi-session, via tickets)

1. Scaffold monorepo + tooling (workspaces, tsconfigs, vitest, dev scripts)
2. `core` engine + rulings — **test-first** (TDD; rules bugs hide here)
3. `server`: rooms, WS, event log, reconnect/grace
4. `client`: three screens, event rendering, chat
5. End-to-end playtest (two browser tabs), fix, polish
6. Art integration (game-icons)
7. Later milestones (not v1): bots, deploy decision

Tickets live under `.scratch/love-letter/issues/` (see `docs/agents/issue-tracker.md`).
