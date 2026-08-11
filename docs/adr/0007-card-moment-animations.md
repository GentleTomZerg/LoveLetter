# 0007 — Card-moment animations are functional, not decorative

The client shipped under a "functional-clean" ethos: `index.css` opens with "No animations, just readable" and DESIGN.md Q15 records "no animations" as the UI-polish choice. One exception already existed — the reconnect `away-pulse` badge (issue 11), a functional signal.

Decision: card-moment animations (ticket 22) are a second, deliberate exception — a played/resolved card flies from one seat to another (or to its pile), a revealed card flashes at its seat, elimination dims the seat, round/match wins get a short fading banner. These are **functional**: they make effect resolution legible at a glance ("who did what to whom, and did it work") in a turn-based game where the action is otherwise only readable by scanning log text. Decorative animation — motion that carries no game information — stays out.

Two hard rules bind the exception:

- **`prefers-reduced-motion` disables all of it.** The media query gates every animation rule, and the client checks `matchMedia` before enqueuing; motion-sensitive players get today's text-only behavior. Nothing is lost without animation.
- **Only cards move; only what the viewer's own log shows.** Seats never fly — elimination is the existing out-state opacity transition. The animations derive from the viewer's own structured log entries (ADR-0003) and the public fact of which card each player last played; a peeked card never renders for a non-peeker. The engine and the event stream are untouched — this is pure client presentation.

Status: accepted. Source: grilling session Q6 (2025).
