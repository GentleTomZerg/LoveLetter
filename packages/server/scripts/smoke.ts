/**
 * End-to-end smoke test: real WebSocket clients against the real server +
 * engine. Covers the whole vertical spine — a full 2-player match to the
 * 7-token target, rematch, error paths — plus the ticket 05 resilience layer:
 * resume/replay after a mid-round disconnect (both the fresh-snapshot and the
 * keep-your-view replay paths, with privacy on replayed events), grace + auto-
 * fold of a dropped turn owner, chat relay, duplicate-socket replacement, and
 * room expiry.
 *
 * Run: npm run smoke --workspace @love-letter/server
 */

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { reduceView } from '@love-letter/core';
import type {
  ChatMessage,
  ClientPacket,
  ServerPacket,
  ViewState,
} from '@love-letter/core';
import WebSocket from 'ws';

/** A client state can seed a resume: the seat id, an optional existing view,
 *  and the log id the view covers. */
interface ResumeSeed {
  selfId: string;
  view: ViewState | null;
  lastEventId: number;
}

class TestClient {
  ws: WebSocket;
  port: number;
  packets: ServerPacket[] = [];
  private waiters: Array<{
    pred: (p: ServerPacket) => boolean;
    resolve: (p: ServerPacket) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  selfId: string | null = null;
  view: ViewState | null = null;
  lastEventId = -1;
  chat: ChatMessage[] = [];

  constructor(ws: WebSocket, port: number, seed?: Partial<ResumeSeed>) {
    this.ws = ws;
    this.port = port;
    if (seed?.selfId !== undefined) this.selfId = seed.selfId;
    if (seed?.view !== undefined) this.view = seed.view;
    if (seed?.lastEventId !== undefined) this.lastEventId = seed.lastEventId;
    ws.on('message', (raw) => this.onPacket(JSON.parse(raw.toString()) as ServerPacket));
  }

  private onPacket(p: ServerPacket): void {
    this.packets.push(p);
    if (p.type === 'hello') this.selfId = p.playerId;
    if (p.type === 'snapshot' && this.view === null) {
      // Fresh client: the snapshot is the base; skip anything it covers.
      this.view = p.view;
      this.lastEventId = p.lastEventId;
    }
    // Keep-your-view resume and live play: fold only newer events.
    if (p.type === 'event' && this.view !== null && this.selfId !== null && p.id > this.lastEventId) {
      this.view = reduceView(this.view, p.event, this.selfId);
      this.lastEventId = p.id;
    }
    if (p.type === 'chat') this.chat.push(p.message);
    if (p.type === 'chatLog') this.chat = [...p.messages];
    for (const w of [...this.waiters]) {
      if (w.pred(p)) {
        clearTimeout(w.timeout);
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve(p);
      }
    }
  }

  get packetCount(): number {
    return this.packets.length;
  }

  send(packet: ClientPacket): void {
    this.ws.send(JSON.stringify(packet));
  }

  /** Resolve with the next packet matching the predicate (past or future). */
  waitFor(pred: (p: ServerPacket) => boolean, timeoutMs = 5000): Promise<ServerPacket> {
    const hit = this.packets.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x.resolve !== resolve);
        reject(new Error(`timeout waiting for a packet (received ${this.packets.length} so far)`));
      }, timeoutMs);
      this.waiters.push({ pred, resolve, timeout });
    });
  }

  /** Resolve when at least one more packet arrives than at `before`. */
  async waitForNew(before: number, timeoutMs = 5000): Promise<void> {
    if (this.packets.length > before) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.packets.length > before) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('timeout waiting for new packets');
  }

  /**
   * Reconnect this client's seat on a fresh socket: same playerId, same
   * lastEventId, and — when `keepView` — the existing view, so the replayed
   * events must fold onto it. A fresh (`keepView: false`) resume takes the
   * snapshot instead.
   */
  async resume(keepView: boolean): Promise<TestClient> {
    assert.ok(this.selfId !== null, 'cannot resume without a playerId');
    const ws = new WebSocket(`ws://localhost:${this.port}/ws`);
    await once(ws, 'open');
    const next = new TestClient(ws, this.port, {
      selfId: this.selfId,
      view: keepView ? this.view : null,
      lastEventId: this.lastEventId,
    });
    next.send({ type: 'resume', playerId: this.selfId, lastEventId: this.lastEventId });
    return next;
  }

  close(): void {
    this.ws.close();
  }
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  await once(ws, 'open');
  return new TestClient(ws, port);
}

function assertNoErrors(...clients: TestClient[]): void {
  for (const c of clients) {
    const err = c.packets.find((p): p is Extract<ServerPacket, { type: 'error' }> => p.type === 'error');
    assert.equal(err, undefined, `unexpected error packet: ${err?.message}`);
  }
}

/** Private card payloads (draw/deal/peek/trade) must never reach a non-owner. */
function assertPrivacy(...clients: TestClient[]): void {
  for (const c of clients) {
    for (const p of c.packets) {
      if (p.type !== 'event') continue;
      const e = p.event;
      if (
        (e.type === 'cardDealt' || e.type === 'cardDrawn'
          || e.type === 'handPeeked' || e.type === 'handTraded')
        && e.playerId !== c.selfId
        && e.card !== null
      ) {
        throw new Error(`private card leaked to a non-owner: ${e.type} for ${e.playerId} seen by ${c.selfId}`);
      }
    }
  }
}

/** Two views represent the same game if their public state and own hand match
 *  (the log is client-side and deliberately differs between paths). */
function assertSameGame(a: ViewState, b: ViewState): void {
  const strip = ({ log: _log, logSeq: _seq, ...rest }: ViewState) => rest;
  try {
    assert.deepStrictEqual(strip(a), strip(b));
  } catch (err) {
    console.error('[assertSameGame] replay view:', JSON.stringify(strip(a), null, 2));
    console.error('[assertSameGame] snapshot view:', JSON.stringify(strip(b), null, 2));
    throw err;
  }
}

/** Compare the public table state only — the private hand is per-player. */
function assertSamePublic(a: ViewState, b: ViewState): void {
  const strip = ({ log: _log, logSeq: _seq, hand: _hand, ...rest }: ViewState) => rest;
  assert.deepStrictEqual(strip(a), strip(b));
}

/** Play one legal move for `c` if it is their turn; returns whether it acted. */
async function playOneMove(c: TestClient): Promise<boolean> {
  const v = c.view;
  if (v === null) return false;
  const before = c.packetCount;
  if (v.phase === 'roundEnded') {
    c.send({ type: 'nextRound' });
    await c.waitForNew(before);
    return true;
  }
  if (v.phase === 'round' && v.pendingChoice !== null && v.pendingChoice.playerId === c.selfId) {
    const pc = v.pendingChoice;
    const choice: ClientPacket = pc.kind === 'guard'
      ? { type: 'choice', choice: { kind: 'guard', targetPlayerId: pc.targets[0]!, namedRank: pc.namedOptions[0]! } }
      : { type: 'choice', choice: { kind: pc.kind, targetPlayerId: pc.targets[0]! } };
    c.send(choice);
    await c.waitForNew(before);
    return true;
  }
  if (v.phase === 'round' && v.currentTurn === c.selfId && v.pendingChoice === null) {
    c.send({ type: 'playCard', which: 0 });
    await c.waitForNew(before);
    return true;
  }
  return false;
}

/** Open a room and fill it; returns the creator and the joiner. */
async function openRoom(port: number, capacity: 2 | 3 | 4, nameA = 'Alice', nameB = 'Bob') {
  const alice = await connect(port);
  alice.send({ type: 'createRoom', name: nameA, capacity });
  const hello = await alice.waitFor((p) => p.type === 'hello');
  assert.equal(hello.type, 'hello');
  await alice.waitFor((p) => p.type === 'snapshot');

  const bob = await connect(port);
  bob.send({ type: 'joinRoom', roomCode: hello.roomCode, name: nameB });
  await bob.waitFor((p) => p.type === 'hello');
  await bob.waitFor((p) => p.type === 'snapshot');
  await alice.waitFor((p) => p.type === 'event' && p.event.type === 'roundStarted');
  return { alice, bob, roomCode: hello.roomCode };
}

// ---------------------------------------------------------------------------
// Scenario 1 — the existing vertical spine: full match, rematch, error paths
// ---------------------------------------------------------------------------

async function runFullMatch(port: number): Promise<void> {
  // --- pre-flight error paths ---------------------------------------------
  {
    const c = await connect(port);
    c.send({ type: 'joinRoom', roomCode: 'ZZZZ', name: 'Lost' });
    assert.equal((await c.waitFor((p) => p.type === 'error')).type, 'error');
    c.ws.send('not json');
    assert.equal((await c.waitFor((p) => p.type === 'error')).type, 'error');
    c.send({ type: 'playCard', which: 0 });
    assert.equal((await c.waitFor((p) => p.type === 'error')).type, 'error');
    c.close();
  }

  // --- a full 2-player match ----------------------------------------------
  const { alice, bob } = await openRoom(port, 2);
  assert.equal(alice.view!.phase, 'round');
  assert.equal(bob.view!.players.length, 2);

  let guessIndex = 0;
  let steps = 0;
  while (alice.view!.phase !== 'matchEnded' && steps < 2000) {
    steps += 1;
    const acted = (await playOneMove(alice)) || (await playOneMove(bob));
    if (!acted) await new Promise((r) => setTimeout(r, 10));
    assertNoErrors(alice, bob);
    assertPrivacy(alice, bob);
  }

  assert.equal(alice.view!.phase, 'matchEnded', 'match did not end');
  const winner = alice.view!.players.find((p) => p.id === alice.view!.matchWinnerId);
  assert.ok(winner, 'a match winner exists');
  assert.ok(winner.tokens >= 7, `winner has ${winner.tokens} tokens`);
  const winnerText = alice.view!.log.find((e) => e.kind === 'match')?.text;
  assert.ok(winnerText && winnerText.includes('won the match'), `match log entry present: ${winnerText}`);

  // --- rematch -------------------------------------------------------------
  alice.send({ type: 'rematch' });
  await alice.waitFor((p) => p.type === 'event' && p.event.type === 'rematchStarted');
  await alice.waitFor((p) => p.type === 'event' && p.event.type === 'roundStarted');
  await bob.waitFor((p) => p.type === 'event' && p.event.type === 'roundStarted');
  assert.equal(alice.view!.roundNumber, 1);
  assert.equal(alice.view!.matchWinnerId, null);
  assert.ok(alice.view!.players.every((p) => p.tokens === 0), 'tokens reset');

  // --- illegal intent after rematch: Bob tries to play out of turn ---------
  assert.equal(alice.view!.currentTurn, alice.selfId); // first seat starts round 1
  bob.send({ type: 'playCard', which: 0 });
  const err = await bob.waitFor((p) => p.type === 'error');
  assert.equal(err.type, 'error');
  assert.match(err.message, /not your turn/);

  // --- joining a full room is rejected -------------------------------------
  const carol = await connect(port);
  carol.send({ type: 'joinRoom', roomCode: alice.view!.roomCode, name: 'Carol' });
  const fullErr = await carol.waitFor((p) => p.type === 'error');
  assert.equal(fullErr.type, 'error');
  carol.close();

  alice.close();
  bob.close();
}

// ---------------------------------------------------------------------------
// Scenario 2 — resume mid-round: replay correctness, privacy, duplicate sockets
// ---------------------------------------------------------------------------

async function runResumeReplay(port: number): Promise<void> {
  const { alice, bob } = await openRoom(port, 2);

  // Chat before disconnecting — resume must resend the history.
  alice.send({ type: 'chat', text: '  hello room  ' });
  await bob.waitFor((p) => p.type === 'chat' && p.message.text === 'hello room');
  await alice.waitFor((p) => p.type === 'chat' && p.message.text === 'hello room'); // own echo
  assert.equal(bob.chat[0]?.from, alice.selfId);
  assert.equal(bob.chat[0]?.name, 'Alice');

  // Play until alice has completed a turn and the turn sits with bob, so her
  // view holds real mid-round state when she drops. Round ends are played
  // through (nextRound); the loop is bounded so a driver bug fails loudly.
  assert.equal(alice.view!.currentTurn, alice.selfId, 'creator starts round 1');
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const acted = (await playOneMove(alice)) || (await playOneMove(bob));
    if (!acted) { await new Promise((r) => setTimeout(r, 10)); continue; }
    assertNoErrors(alice, bob);
    if (
      alice.view!.phase === 'round'
      && alice.view!.pendingChoice === null
      && alice.view!.currentTurn === bob.selfId
    ) break;
  }
  assert.ok(guard < 200, 'alice completed a turn with the turn on bob');

  // Drop alice mid-round; bob keeps playing while she is away, so the replay
  // below has real missed events to cover. Bob takes one complete turn (a play
  // plus any follow-up choice), then stops — his next turn would sit on the
  // gone alice.
  const aliceGone = alice;
  aliceGone.close();
  let bobGuard = 0;
  while (bobGuard < 100) {
    bobGuard += 1;
    const acted = await playOneMove(bob);
    if (!acted) { await new Promise((r) => setTimeout(r, 10)); continue; }
    // Bob's turn is complete once the turn has moved on (or the round ended).
    if (bob.view!.phase !== 'round' || bob.view!.currentTurn !== bob.selfId) break;
  }
  assert.ok(bobGuard < 100, 'bob completed a turn while alice was away');

  // --- resume keeping the stale view: replay must fold onto it -------------
  const aliceBack = await aliceGone.resume(true);
  // The chatLog arrives after the replay, so it marks the replay complete.
  await aliceBack.waitFor((p) => p.type === 'chatLog');
  assertNoErrors(aliceBack, bob);
  assertPrivacy(aliceBack, bob);

  // --- a fresh resume (page reload) takes the snapshot path ----------------
  const aliceFresh = await aliceGone.resume(false);
  await aliceFresh.waitFor((p) => p.type === 'chatLog');
  assertNoErrors(aliceFresh, bob);

  // The stale-view replay and the fresh snapshot must agree exactly — same
  // player, same state, same private hand — so replay is faithful.
  assertSameGame(aliceBack.view!, aliceFresh.view!);
  // …and both agree with bob's live view on the public table state.
  assertSamePublic(aliceBack.view!, bob.view!);
  // No events were skipped: the client caught up to the authoritative log.
  assert.ok(aliceBack.lastEventId >= bob.lastEventId, `caught up (${aliceBack.lastEventId} >= ${bob.lastEventId})`);
  assert.equal(aliceBack.chat.length, bob.chat.length, 'chat history restored');

  // --- duplicate sockets: the old socket is replaced, the new one acts -----
  const aliceAgain = await aliceBack.resume(false);
  await aliceAgain.waitFor((p) => p.type === 'chatLog');
  await once(aliceFresh.ws, 'close'); // the server kicked the stale socket
  assert.equal(aliceAgain.selfId, aliceBack.selfId);

  // The resumed seat is fully live: play until it is alice's turn and act.
  let steps = 0;
  while (steps < 2000 && aliceAgain.view!.phase !== 'matchEnded') {
    steps += 1;
    const acted = (await playOneMove(aliceAgain)) || (await playOneMove(bob));
    if (!acted) await new Promise((r) => setTimeout(r, 10));
    assertNoErrors(aliceAgain, bob);
  }

  aliceFresh.close();
  aliceAgain.close();
  bob.close();
}

// ---------------------------------------------------------------------------
// Scenario 3 — grace + auto-fold, seat kept, room expiry
// ---------------------------------------------------------------------------

async function runGraceFold(port: number): Promise<void> {
  const { alice, bob } = await openRoom(port, 2);
  assert.equal(alice.view!.currentTurn, alice.selfId, 'alice holds the turn');

  // Alice drops on her own turn; the grace window (150ms) must fold her.
  alice.close();
  const eliminated = await bob.waitFor(
    (p) => p.type === 'event' && p.event.type === 'playerEliminated' && p.event.reason === 'fold',
    3000,
  );
  assert.equal(eliminated.type, 'event');
  await bob.waitFor((p) => p.type === 'event' && p.event.type === 'roundEnded');

  assert.equal(bob.view!.phase, 'roundEnded');
  const aliceSeat = bob.view!.players.find((p) => p.id === alice.selfId)!;
  assert.equal(aliceSeat.out, true, 'alice folded out of the round');
  assert.equal(aliceSeat.tokens, 0, 'folding awards no token');
  assert.equal(bob.view!.players.find((p) => p.id === bob.selfId)!.tokens, 1, 'bob wins by default');

  // Alice's seat is kept: next round still seats her.
  bob.send({ type: 'nextRound' });
  await bob.waitFor((p) => p.type === 'event' && p.event.type === 'roundStarted');
  assert.equal(bob.view!.roundNumber, 2);
  assert.equal(bob.view!.players.map((p) => p.id).length, 2, 'seat kept for the next round');
  assert.equal(bob.view!.players.find((p) => p.id === alice.selfId)!.out, false);

  // A folded player can resume: same seat, current state.
  const aliceBack = await alice.resume(false);
  await aliceBack.waitFor((p) => p.type === 'chatLog');
  assert.equal(aliceBack.view!.phase, 'round');
  assert.equal(aliceBack.view!.roundNumber, 2);
  assert.equal(aliceBack.view!.players.find((p) => p.id === alice.selfId)!.out, false);
  assertNoErrors(aliceBack, bob);

  aliceBack.close();
  bob.close();

  // --- an abandoned room is reclaimed after a grace window -----------------
  const c1 = await connect(port);
  c1.send({ type: 'createRoom', name: 'Solo', capacity: 2 });
  const h = await c1.waitFor((p) => p.type === 'hello');
  const c2 = await connect(port);
  c2.send({ type: 'joinRoom', roomCode: h.roomCode, name: 'Pal' });
  await c2.waitFor((p) => p.type === 'snapshot');
  const roomCode = h.roomCode;
  c1.close();
  c2.close();
  await new Promise((r) => setTimeout(r, 600)); // ≫ graceMs
  const lost = await connect(port);
  lost.send({ type: 'resume', playerId: c1.selfId!, lastEventId: 0 });
  const err = await lost.waitFor((p) => p.type === 'error');
  assert.match(err.message, /no seat found/);
  lost.close();
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  try {
    console.log('[smoke] full match, rematch, error paths…');
    const fullMatchApp = await createApp({ port: 0, staticRoot: null });
    apps.push(fullMatchApp);
    await runFullMatch(fullMatchApp.port);

    console.log('[smoke] resume/replay, chat, duplicate sockets…');
    const replayApp = await createApp({ port: 0, staticRoot: null, graceMs: 5000 });
    apps.push(replayApp);
    await runResumeReplay(replayApp.port);

    console.log('[smoke] grace/auto-fold, seat kept, room expiry…');
    const foldApp = await createApp({ port: 0, staticRoot: null, graceMs: 150 });
    apps.push(foldApp);
    await runGraceFold(foldApp.port);

    console.log(
      'SMOKE OK — full match, rematch, error paths, resume/replay (stale + fresh), '
      + 'grace/auto-fold with seat kept, duplicate-socket replacement, chat relay, room expiry',
    );
  } finally {
    for (const app of apps) await app.close();
  }
}

try {
  await main();
} catch (err) {
  console.error('SMOKE FAILED:', err);
  process.exitCode = 1;
}
