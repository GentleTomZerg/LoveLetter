# Love Letter Online

Server-authoritative multiplayer implementation of the original 16-card Love Letter (AEG 2012) in TypeScript. Two goals: a learning project for clean, explainable code, and a game friends can actually play on a LAN.

## Language

**Card**:
A member of the 16-card deck, each with a numeric rank (1–8) and an effect. Deck: Guard×5, Priest×2, Baron×2, Handmaid×2, Prince×2, King×1, Countess×1, Princess×1.
_Avoid_: role, suit, character (also a trademark-safety rule: never character names)

**Intent**:
A client→server request to change game state (`playCard`, `choice`, `rematch`). Validated by the engine; illegal intents are rejected, never guessed at.
_Avoid_: action, command, message

**Event**:
An immutable, ordered record of a state transition, appended to the event log (`cardPlayed`, `choiceRequired`, `handRevealed`, `playerEliminated`, `roundEnded`, `matchEnded`, …). The log powers reconnect replay and debugging.
_Avoid_: message, update, fact

**Phase**:
The top-level state machine of a game: lobby → round → roundEnded → matchEnded.

**Round**:
One play of the deck from setup to a winner — the last player standing, or the highest hand when the deck empties.
_Avoid_: game (a "game" is a whole match)

**Match**:
A series of rounds until a player reaches the token target (7 for 2 players, 5 for 3, 4 for 4).
_Avoid_: game, session

**Token**:
A unit of score awarded to the winner of a round; the first to the target wins the match.
_Avoid_: point, heart, win

**Grace**:
The 60-second window after a socket drop during which a player's seat is held. If their turn comes and they're still gone, they're folded out of the round; the seat is kept for the next round.

**Seat**:
A player's place at the table, carrying their public state — tokens, discards, hand count, and status (protected, out, reconnecting). Every player has exactly one; the viewer's own seat is their play area at the bottom of the stage, opponents' seats ring the table.
_Avoid_: dashboard (a seat is one concept whether it is the viewer's own or an opponent's)

**Protected**:
A player under the Handmaid's effect, unchoosable by other players' cards until the start of their next turn. Does not block their own Prince or the Countess.

**Burned**:
The card removed face-down from the deck at setup, unknown to all; used in the adopted 2-player ruling for a Prince empty-deck draw.

**Draw**:
The card taken from the deck — at the start of a turn, or for a Prince target after their forced discard. A draw on an empty deck takes the single face-down burned card (2-player ruling). The deck shrinking is public; the card itself is private to the drawer.
_Avoid_: supplement, refill

**PendingChoice**:
The engine state between the card's play and the resolution of its follow-up effect (Guard: player + card guess; Priest/Baron/Prince/King: target player). The turn is not over until resolved.

**Log entry**:
A display line derived from the event stream — who played what, who was eliminated, how the round ended — the deduction surface. Structured (a kind plus parameters) so each client renders it in its own language.
_Avoid_: news, feed, message, update

**Locale**:
The language a client renders the game in. Every client picks its own (auto-detected, with a manual toggle), so a single room can mix languages.
_Avoid_: language pack
