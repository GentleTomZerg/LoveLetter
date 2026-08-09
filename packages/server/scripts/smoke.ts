/**
 * End-to-end smoke test: two real WebSocket clients play a full 2-player match
 * with every card, through the real server + engine, to the 7-token target,
 * then rematch, then hit the error paths. Each client folds the event stream
 * with the same reducer the browser uses, so this exercises the whole vertical
 * spine programmatically — the automated twin of the two-tab hand check.
 *
 * Run: npm run smoke --workspace @love-letter/server
 */

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { reduceView } from '@love-letter/core';
import type { ClientPacket, ServerPacket, ViewState } from '@love-letter/core';
import WebSocket from 'ws';

class TestClient {
  ws: WebSocket;
  packets: ServerPacket[] = [];
  private waiters: Array<{
    pred: (p: ServerPacket) => boolean;
    resolve: (p: ServerPacket) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  selfId: string | null = null;
  view: ViewState | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (raw) => this.onPacket(JSON.parse(raw.toString()) as ServerPacket));
  }

  private onPacket(p: ServerPacket): void {
    this.packets.push(p);
    if (p.type === 'hello') this.selfId = p.playerId;
    if (p.type === 'snapshot') this.view = p.view;
    if (p.type === 'event' && this.selfId !== null && this.view !== null) {
      this.view = reduceView(this.view, p.event, this.selfId);
    }
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

  close(): void {
    this.ws.close();
  }
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  await once(ws, 'open');
  return new TestClient(ws);
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

async function run(port: number): Promise<void> {
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
  const alice = await connect(port);
  const bob = await connect(port);

  alice.send({ type: 'createRoom', name: 'Alice', capacity: 2 });
  const hello = await alice.waitFor((p) => p.type === 'hello');
  assert.equal(hello.type, 'hello');
  await alice.waitFor((p) => p.type === 'snapshot');
  assert.equal(alice.view!.phase, 'lobby');

  bob.send({ type: 'joinRoom', roomCode: hello.roomCode, name: 'Bob' });
  await bob.waitFor((p) => p.type === 'hello');
  await bob.waitFor((p) => p.type === 'snapshot');
  // the room auto-started when Bob joined
  assert.equal(bob.view!.phase, 'round');
  assert.equal(bob.view!.players.length, 2);
  await alice.waitFor((p) => p.type === 'event' && p.event.type === 'roundStarted');

  // --- drive the match to its end -----------------------------------------
  let guessIndex = 0;
  let steps = 0;
  while (alice.view!.phase !== 'matchEnded' && steps < 2000) {
    steps += 1;
    let acted = false;
    for (const c of [alice, bob]) {
      const v = c.view;
      if (v === null) continue;
      const before = c.packetCount;
      if (v.phase === 'roundEnded') {
        c.send({ type: 'nextRound' });
        await c.waitForNew(before);
        acted = true;
        break;
      }
      if (v.phase === 'round' && v.pendingChoice !== null && v.pendingChoice.playerId === c.selfId) {
        const pc = v.pendingChoice;
        if (pc.kind === 'guard') {
          const namedRank = pc.namedOptions[guessIndex % pc.namedOptions.length]!;
          guessIndex += 1;
          c.send({ type: 'choice', choice: { kind: 'guard', targetPlayerId: pc.targets[0]!, namedRank } });
        } else {
          c.send({ type: 'choice', choice: { kind: pc.kind, targetPlayerId: pc.targets[0]! } });
        }
        await c.waitForNew(before);
        acted = true;
        break;
      }
      if (v.phase === 'round' && v.currentTurn === c.selfId && v.pendingChoice === null) {
        c.send({ type: 'playCard', which: 0 });
        await c.waitForNew(before);
        acted = true;
        break;
      }
    }
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
  carol.send({ type: 'joinRoom', roomCode: hello.roomCode, name: 'Carol' });
  const fullErr = await carol.waitFor((p) => p.type === 'error');
  assert.equal(fullErr.type, 'error');
  carol.close();

  alice.close();
  bob.close();
}

const app = await createApp({ port: 0, staticRoot: null });
try {
  await run(app.port);
  console.log(`SMOKE OK — full 2-player match, rematch, and error paths on port ${app.port}`);
} catch (err) {
  console.error('SMOKE FAILED:', err);
  process.exitCode = 1;
} finally {
  await app.close();
}
