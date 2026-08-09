import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import type { Intent } from '../src/index.js';
import { eventsOf, makeLobby, seededRng } from './helpers.js';

const rng = seededRng(1);

describe('lobby: createRoom', () => {
  it('creates a lobby with the creator seated', () => {
    const result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('lobby');
    expect(result.state.players).toHaveLength(1);
    expect(result.state.players[0]).toMatchObject({ id: 'A', name: 'Alice', tokens: 0 });
    expect(eventsOf(result.events, 'roomCreated')).toHaveLength(1);
    expect(eventsOf(result.events, 'playerJoined')).toHaveLength(1);
  });

  it('defaults the token target to 7 for two players', () => {
    const result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' });
    expect(result.ok && result.state.tokenTarget).toBe(7);
  });

  it('rejects a second createRoom on an existing state', () => {
    const s = makeLobby(2, ['A']);
    const result = apply(s, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'B', playerName: 'Bob' });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects invalid capacity, room code, and empty names', () => {
    const bad = [
      { type: 'createRoom', roomCode: 'TEST', capacity: 5, playerId: 'A', playerName: 'Alice' },
      { type: 'createRoom', roomCode: 'bad!', capacity: 2, playerId: 'A', playerName: 'Alice' },
      { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: '   ' },
    ] as const;
    for (const intent of bad) {
      const result = apply(null, intent as unknown as Intent);
      expect(result.ok).toBe(false);
    }
  });
});

describe('lobby: joinRoom and auto-start', () => {
  it('keeps the room in the lobby until it is full', () => {
    let result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' }, rng);
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'joinRoom', playerId: 'B', playerName: 'Bob' }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players).toHaveLength(2);
    expect(result.state.phase).toBe('round');
    expect(eventsOf(result.events, 'playerJoined')).toHaveLength(1);
  });

  it('auto-starts the first round when the room fills (DESIGN Q18)', () => {
    let result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' }, rng);
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'joinRoom', playerId: 'B', playerName: 'Bob' }, rng);
    if (!result.ok) throw new Error(result.error);
    const s = result.state;
    expect(s.phase).toBe('round');
    expect(s.roundNumber).toBe(1);
    expect(s.currentTurn).toBe('A'); // first seat starts round 1
    expect(s.players[0]!.hand).toHaveLength(2); // A has drawn their first turn card
    expect(s.players[1]!.hand).toHaveLength(1);
    expect(eventsOf(result.events, 'roundStarted')).toHaveLength(1);
    expect(eventsOf(result.events, 'cardDealt')).toHaveLength(2);
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'A' });
  });

  it('rejects joining a nonexistent room', () => {
    const result = apply(null, { type: 'joinRoom', playerId: 'B', playerName: 'Bob' });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects joining an already-started room', () => {
    let result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 3, playerId: 'A', playerName: 'Alice' }, rng);
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'joinRoom', playerId: 'B', playerName: 'Bob' }, rng);
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'joinRoom', playerId: 'C', playerName: 'Carol' }, rng);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.phase).toBe('round');
    const late = apply(result.state, { type: 'joinRoom', playerId: 'D', playerName: 'Dave' }, rng);
    expect(late).toMatchObject({ ok: false });
  });

  it('rejects joining a full room', () => {
    const result = apply(makeLobby(2, ['A', 'B']), { type: 'joinRoom', playerId: 'C', playerName: 'Carol' });
    expect(result).toMatchObject({ ok: false });
  });
});
