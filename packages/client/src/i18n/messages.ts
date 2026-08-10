/**
 * @love-letter/client — locale dictionaries (ADR-0004).
 *
 * One typed dictionary per language; `zh` is type-checked against the `en`
 * key set so a missing translation is a compile error. Ticket 17 fills the
 * real Simplified Chinese — for now `zh` renders English (plumbing only).
 */

export type Locale = 'en' | 'zh';

export const en = {
  // --- common ---
  'common.you': 'You',
  'common.yourself': 'yourself',
  'common.listAnd': ' and ',
  'common.listComma': ', ',
  'common.leaveConfirm': 'Leave the game? Your seat will be freed immediately.',

  // --- App ---
  'app.connecting': 'Connecting…',
  'app.connectionLost': 'Connection lost — refresh to resume your seat. Your room is held for a minute after the drop.',
  'app.backHome': 'Back to Home',

  // --- Home ---
  'home.tagline': 'A game of risk, deduction, and luck for 2–4 players.',
  'home.yourName': 'Your name',
  'home.namePlaceholder': 'e.g. Alice',
  'home.players': 'Players',
  'home.createRoom': 'Create room',
  'home.or': 'or',
  'home.roomCode': 'Room code',
  'home.joinRoom': 'Join room',

  // --- Lobby ---
  'lobby.room': 'Room {code}',
  'lobby.tagline': 'Share this code with your friends — the match starts automatically when all seats are full.',
  'lobby.you': 'you',
  'lobby.reconnecting': 'reconnecting…',
  'lobby.waiting': 'Waiting…',
  'lobby.statusWaiting': '{seated}/{capacity} players seated — waiting for the rest…',
  'lobby.statusStarting': '{seated}/{capacity} players seated — starting!',
  'lobby.leaveGame': 'Leave game',

  // --- Game header ---
  'game.room': 'Room {code}',
  'game.round': 'Round {number}',
  'game.deck': 'Deck: {count}',
  'game.leaveGame': 'Leave game',
  'game.turnBanner': "It's your turn — play a card.",
  'game.emptyHand': 'Your hand is empty.',
  'game.faceUp': 'Removed face-up: {cards}',
  'game.burned': 'face-down removed card — unknown to all',
  'game.roundWonTail': 'won the round.',
  'game.startNextRound': 'Start next round',
  'game.matchWon': '{name} won the match!',
  'game.matchRematch': 'First to {count} tokens — rematch with the same seats?',
  'game.rematch': 'Rematch',
  'game.protected': 'You are protected by the Handmaid',
  'game.abilities': 'Card abilities',

  // --- Table panel ---
  'table.title': 'Table',
  'table.youSuffix': ' (you)',
  'table.tokensTitle': 'hearts (tokens) won',
  'table.turn': 'turn',
  'table.protected': 'protected',
  'table.out': 'out',
  'table.reconnecting': 'reconnecting…',
  'table.discards': 'Discarded: {count}',
  'table.hand': 'hand',
  'table.handTitle': 'Hand: {count}',

  // --- Choice prompts ---
  'choice.priest': 'Your Priest: whose hand do you want to see?',
  'choice.baron': 'Your Baron: who do you challenge?',
  'choice.prince': 'Your Prince: who discards and draws?',
  'choice.king': 'Your King: who do you trade hands with?',
  'choice.guard': 'Your Guard: who do you accuse, and of holding what?',
  'choice.choosing': '{name} is choosing…',
  'choice.someone': 'Someone',

  // --- Chat ---
  'chat.title': 'Chat',
  'chat.empty': 'No messages yet.',
  'chat.placeholder': 'Say something…',
  'chat.send': 'Send',

  // --- Log (ADR-0003: structured entries formatted here) ---
  'log.play': '{name} played {card}',
  'log.fizzle': "{name}'s {card} had no legal target",
  'log.choice.self': 'You must choose a target and a card',
  'log.choice.other': '{name} is choosing…',
  'log.guard': '{name} guessed {target} has {card}',
  'log.baron': '{name} compared hands with {target}',
  'log.prince': '{name} targeted {target} with the Prince',
  'log.king': '{name} traded hands with {target}',
  'log.peek.self': "You looked at {target}'s hand",
  'log.peek.selfCard': "You looked at {target}'s hand: {card}",
  'log.peek.other': "{name} looked at {target}'s hand",
  'log.discard.countess': '{name} discarded the Countess (forced)',
  'log.discard.prince': '{name} discarded {card} (Prince)',
  'log.reveal': '{name} revealed {card}',
  'log.eliminate.out': '{name} is out',
  'log.eliminate.fold': '{name} folded (disconnected)',
  'log.round.last': '{names} won the round (last player standing)',
  'log.round.hand': '{names} won the round (highest hand)',
  'log.match': '{name} won the match!',
  'log.join': '{name} joined',
  'log.leave': '{name} left the game',
  'log.info.roomCreated': 'Room {roomCode} created',
  'log.info.roundStarted': 'Round {roundNumber} begins',
  'log.info.rematchStarted': 'Rematch — a new match begins',
  'log.info.choiceAbandoned': "{name} left — their choice was abandoned",
  'log.info.playerGone': '{name} disconnected — seat held',
  'log.info.playerBack': '{name} reconnected',

  // --- Errors and room teardown (ADR-0005: codes over the wire) ---
  'error.unknown': 'Something went wrong.',
  // protocol errors (server app.ts)
  'error.invalid_json': 'invalid JSON',
  'error.unknown_packet': 'unknown packet type: {type}',
  'error.already_in_room': 'you are already in a room',
  'error.room_not_found': 'room not found',
  'error.not_in_room': 'you are not in a room',
  'error.invalid_packet': 'invalid packet',
  'error.cannot_leave_room': 'you cannot leave this room',
  'error.invalid_resume_packet': 'invalid resume packet',
  'error.no_seat_found': 'no seat found for this player',
  'error.empty_chat': 'empty chat message',
  // engine errors (packages/core/src/engine.ts)
  'error.room_missing': 'room does not exist',
  'error.room_already_exists': 'a room already exists',
  'error.invalid_room_code': 'invalid room code',
  'error.invalid_capacity': 'capacity must be 2–4 players',
  'error.invalid_player_name': 'invalid player name',
  'error.room_already_started': 'room has already started',
  'error.room_full': 'room is full',
  'error.not_in_round': 'not in a round',
  'error.pending_choice_open': 'a pending choice must be resolved first',
  'error.not_your_turn': 'not your turn',
  'error.out_of_round': 'you are out of the round',
  'error.invalid_hand_index': 'invalid hand index',
  'error.no_card_at_index': 'no card at that hand index',
  'error.countess_forced': 'the Countess must be discarded when you hold the King or Prince',
  'error.no_pending_choice': 'no pending choice',
  'error.not_your_choice': 'not your choice to make',
  'error.choice_mismatch': 'choice does not match the pending choice',
  'error.illegal_target': 'illegal target',
  'error.illegal_named_card': 'illegal named card',
  'error.no_round_to_start': 'no round is waiting to start',
  'error.match_not_over': 'the match is not over',
  'error.no_round_in_progress': 'no round in progress',
  'error.fold_turn_owner_only': 'only the turn owner may be folded',
  'error.player_not_in_round': 'player is not in the round',
  'error.fold_last_player': 'the last player in the round cannot fold',
  'error.player_not_in_room': 'player is not in this room',
  'error.room_needs_two': 'the room cannot continue with one player',
  // roomClosed codes
  'error.roomClosed.player_left': '{name} left the game — match over',
  'error.roomClosed.no_show': "{name} didn't return — the match is over",
} as const;

export type MessageKey = keyof typeof en;

export const zh: Record<MessageKey, string> = {
  // Ticket 17 fills real Simplified Chinese; stubs render English for now.
  ...en,
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, zh };
