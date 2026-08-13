/**
 * UI smoke + playtest (tickets 06 + 07): drives the real client in headless
 * Chrome over CDP. Scenarios:
 *
 *  - render     Home → Lobby → Game, seats ring + discard piles, chat across
 *               tabs (ticket 06 render claims; screenshots saved for a look).
 *  - chatPill   chat is a floating pill + modal dialog (ticket 20): newest-
 *               message preview, unread badge that clears on open, close on
 *               send/Esc/outside click, near-fullscreen dialog on phones.
 *  - sceneAnimations  scene-based card animations (ticket 23): a scene plays
 *               through (the card appears, the verdict caption appears, the
 *               queue drains); prefers-reduced-motion disables all scenes.
 *  - drawPop   ticket 28: the drawer's own draw pops the new card in the
 *               hand (a ~0.6s pure-CSS moment, no scene, no round pause)
 *               and the deck count stays in step.
 *  - sceneBlocking  ticket 24: the round waits — the hand and choice buttons
 *               are disabled while a scene animates and re-enabled after the
 *               drain; the strip follows the animating beat (the win line
 *               appears only when the win banner plays); under reduced motion
 *               nothing enqueues, so the round never blocks.
 *  - roundEndWaits  ticket 37: the round/match-end overlays wait for the
 *               story — the panel exists only after the final scene + banner
 *               drain (mid-story there is no button to click); reduced-motion
 *               and reconnect show the panel immediately.
 *  - selectConfirm  ticket 25: hand plays are select-confirm — clicking a
 *               card selects it (highlight + a Play action bar naming it),
 *               clicking the other card switches the selection, and nothing
 *               is sent until the confirm; the log gains exactly one play
 *               line and the bar clears.
 *  - kingTrade   ticket 30: the hand area shows exactly as many cards as the
 *               scoreboard counts at every turn-holder moment, around King
 *               trades (the fixed desync left a stale card after a trade
 *               against an empty hand — clicking it bounced an error).
 *  - logStrip   the log is a strip in the merged top bar (ticket 33,
 *               reworking issue 21) collapsing to a latest-event strip
 *               (ticket 19): the strip shows the newest entry, tracks live
 *               play, keeps its thumbnail rank-keyed; tapping opens the
 *               full-log modal, near-fullscreen on phones.
 *  - fixedStage  ticket 33: the fixed stage — zero-scroll (100dvh, overflow
 *               hidden, all stage elements inside the viewport), the ring
 *               seats + center-table cards rank-keyed, the log modal and the
 *               round-end overlay open/close, a scene plays fully visible,
 *               and a narrow landscape viewport shows the rotate notice.
 *  - fullMatch  a complete 2-player match to the 7-token target: all eight
 *               cards appear in the public log, match end, rematch resets.
 *  - multiPlayer 3- and 4-player matches start, play, and end at the right
 *               token targets (5 and 4).
 *  - reload     a mid-match tab reload (the real disconnect path): the seat
 *               resumes from the snapshot, chat history comes back, and the
 *               tab keeps playing.
 *
 * Every scenario fails on any `.error-banner` — through legal play the UI
 * should never bounce a rejected intent back at the player (the forced
 * Countess discard is marked instead of clickable).
 *
 * Requires Google Chrome (override with CHROME_PATH) and a built client:
 * run `npm run build --workspace @love-letter/client` first.
 *
 * Run: npm run ui-smoke --workspace @love-letter/server
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { click, clickButton, launchChrome, openTabs, setInput, setSelect, sleep, waitFor, type CdpSession } from './cdp.js';

const SHOT_DIR = join(tmpdir(), 'loveletter-ui-smoke');
const STATIC_ROOT = resolve(import.meta.dirname, '../../client/dist');
const SRC_ROOT = resolve(import.meta.dirname, '../../client/src');

const ALL_CARD_NAMES = ['Guard', 'Priest', 'Baron', 'Handmaid', 'Prince', 'King', 'Countess', 'Princess'];
// The public log line for a card name — `\b` keeps "Prince" distinct from "Princess".
const hasName = (log: string, name: string) => new RegExp(`\\b${name}\\b`).test(log);

/** The newest mtime under a directory tree, or 0 if nothing is there. */
async function newestMtime(root: string): Promise<number> {
  let newest = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        await walk(path);
      } else {
        const s = await stat(path);
        newest = Math.max(newest, s.mtimeMs);
      }
    }
  };
  try {
    await walk(root);
  } catch {
    // missing tree → keep 0
  }
  return newest;
}

/** The built client must exist, and should be fresher than the sources. */
async function checkBuildFreshness(): Promise<void> {
  const distHtml = join(STATIC_ROOT, 'index.html');
  const distStat = await stat(distHtml).catch(() => null);
  if (distStat === null) {
    throw new Error(
      `client build missing at ${STATIC_ROOT} — run 'npm run build --workspace @love-letter/client' first`,
    );
  }
  const srcNewest = await newestMtime(SRC_ROOT);
  if (srcNewest > distStat.mtimeMs) {
    console.warn('[ui-smoke] client sources are newer than the build — rebuild for an accurate check');
  }
}

// ---------------------------------------------------------------------------
// Game-driving helpers
// ---------------------------------------------------------------------------

/** Every `.error-banner` on the page is a rejected intent the UI bounced. */
async function assertNoErrors(...tabs: CdpSession[]): Promise<void> {
  for (const t of tabs) {
    const text = (await t.eval(
      `document.querySelector('.error-banner')?.textContent ?? null`,
    )) as string | null;
    assert.equal(text, null, `unexpected error banner: ${text}`);
  }
}

/** One legal move on this tab, if it is that tab's turn. The Guard's card
 *  chips are tried before the target seats (tap-the-seat, ticket 35): once a
 *  seat is tapped the chips appear, so a chip tap must win whenever it
 *  exists, or the choice would never resolve.
 *
 *  Ticket 25: the hand is select-confirm — clicking a card only selects it,
 *  so the chip click must follow in the same step (the play leaves only
 *  after the confirm; a selected-but-unconfirmed card would be deselected by
 *  the next hand click).
 *
 *  Ticket 33: `skipRoundOver` stops the auto-"Start next round" click so a
 *  scenario can observe the round-end overlay before it is consumed. */
async function playOneMove(tab: CdpSession, skipRoundOver = false): Promise<boolean> {
  if (!skipRoundOver && (await click(tab, '.round-over button'))) return true; // start next round
  if (await click(tab, 'button.card.playable')) {
    if (await click(tab, '.play-chip')) return true; // select + chip confirm (ticket 35)
    await click(tab, 'button.card.playable.selected'); // no chip — deselect and retry
    return false;
  }
  if (await click(tab, '.choice-chips button')) return true; // Guard: name a card (ticket 35)
  if (await click(tab, '.seat.chooseable')) return true; // tap-the-seat target (ticket 35)
  return false;
}

/** Drive legal moves across the tabs until `done`; fail on error banners. */
async function playUntil(tabs: CdpSession[], done: () => Promise<boolean>, maxSteps = 3000): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    if (await done()) return;
    await assertNoErrors(...tabs);
    let acted = false;
    for (const t of tabs) {
      if (await playOneMove(t)) {
        acted = true;
        break; // one tab acts per step — no double nextRound / double plays
      }
    }
    if (!acted) await sleep(80);
  }
  throw new Error(`playUntil exceeded ${maxSteps} steps`);
}

/** Create a room from `tabs[0]` and join the rest by its code. */
async function openRoom(base: string, tabs: CdpSession[], capacity: number, names: string[]): Promise<string> {
  // Ticket 33: the stage is portrait-locked, so the smoke runs at a real
  // desktop size (headless Chrome's default 780×493 is a narrow landscape
  // and would correctly hide the stage behind the rotate notice).
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i]!.setViewport(1280, 800);
    await tabs[i]!.navigate(base);
  }
  await waitFor(tabs[0]!, `document.querySelector('.screen.home') !== null`, 10000, 'Home on tab 0');
  await setInput(tabs[0]!, '.home input[placeholder="e.g. Alice"]', names[0]!);
  await setSelect(tabs[0]!, '.home select', String(capacity));
  await clickButton(tabs[0]!, '.home', 'Create room');
  await waitFor(tabs[0]!, `document.querySelector('.screen.lobby') !== null`, 10000, 'Lobby on tab 0');
  const roomCode = (await tabs[0]!.eval(`document.querySelector('.screen.lobby h1').textContent`)) as string;
  const code = /Room ([A-Z]{4})/.exec(roomCode)![1]!;
  assert.ok(code.length === 4, `room code from Lobby: ${code}`);

  for (let i = 1; i < tabs.length; i++) {
    await waitFor(tabs[i]!, `document.querySelector('.screen.home') !== null`, 10000, `Home on tab ${i}`);
    await setInput(tabs[i]!, '.home input[placeholder="e.g. Alice"]', names[i]!);
    await setInput(tabs[i]!, '.code-input', code);
    await clickButton(tabs[i]!, '.home', 'Join room');
  }
  for (let i = 0; i < tabs.length; i++) {
    await waitFor(tabs[i]!, `document.querySelector('.screen.game') !== null`, 10000, `Game on tab ${i}`);
  }
  return code;
}

const nonEmptyPiles = (tab: CdpSession) =>
  tab.eval(
    `[...document.querySelectorAll('.seat .pile')].filter((p) => p.querySelectorAll('img').length > 0).length`,
  );

const logText = (tab: CdpSession) =>
  tab.eval(`[...document.querySelectorAll('.log li')].map((li) => li.textContent).join('\\n')`);

/** The public table state a resumed tab must reproduce exactly — a per-seat
 *  map keyed by player id. Every viewer renders each player's public state
 *  somewhere (opponents in the ring, the viewer themselves in the dock —
 *  ticket 35), so comparing on content rather than DOM order is the real
 *  invariant after a reload. */
const publicSnapshot = (tab: CdpSession) =>
  tab.eval(`(() => {
    const seats = {};
    for (const s of document.querySelectorAll('.seat')) {
      seats[s.getAttribute('data-player-id')] = {
        discards: [...s.querySelectorAll('.pile img')].map((i) => i.getAttribute('src')),
        count: s.querySelector('.hand-count')?.textContent ?? null,
        tokens: s.querySelector('.tokens')?.textContent ?? null,
      };
    }
    return { seats, header: [...document.querySelectorAll('.top-meta span')].map((s) => s.textContent) };
  })()`);

// ---------------------------------------------------------------------------
// Scenario 0 — narrow-phone layout (issue 10): no button may clip at the edge
// ---------------------------------------------------------------------------

async function runNarrowViewport(base: string, debugPort: number): Promise<void> {
  for (const width of [320, 375, 430]) {
    const [tab] = await openTabs(debugPort, 1);
    await tab.setViewport(width, 568);
    await tab.navigate(base);
    await waitFor(tab, `document.querySelector('.screen.home') !== null`, 10000, `Home at ${width}px`);
    await setInput(tab, '.home input[placeholder="e.g. Alice"]', 'Alice');
    const buttons = (await tab.eval(`(() => {
      const vw = window.innerWidth;
      return [...document.querySelectorAll('.home button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), left: r.left, right: r.right, vw };
      });
    })()`)) as Array<{ text: string; left: number; right: number; vw: number }>;
    for (const b of buttons) {
      assert.ok(
        b.left >= 0 && b.right <= b.vw + 0.5,
        `${b.text} clipped at ${b.vw}px (left ${b.left}, right ${b.right})`,
      );
    }
    console.log(`  viewport ${width}px: ${buttons.map((b) => b.text).join(', ')} fully visible`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — ticket 06 render claims
// ---------------------------------------------------------------------------
/**
 * Locale toggle (ticket 17): with the browser forced to en-US (cdp.ts), a
 * fresh visitor sees English; clicking 中文 switches every screen string to
 * Simplified Chinese, and clicking EN switches back. The automated slice of
 * the ticket's "a Chinese speaker reads every screen" pass — rendering and
 * completeness are covered here; naturalness still needs human eyes.
 */
async function runLocaleCheck(base: string, debugPort: number): Promise<void> {
  const [tab] = await openTabs(debugPort, 1);
  await tab.navigate(base);
  await waitFor(tab, `document.querySelector('.screen.home') !== null`, 10000, 'Home (en)');
  assert.equal(
    await tab.eval(`document.querySelector('.home .panel button').textContent.trim()`),
    'Create room',
    'fresh visitor defaults to English',
  );

  await clickButton(tab, '.locale-toggle', '中文');
  await waitFor(tab, `document.querySelector('.home .panel button').textContent.trim() === '创建房间'`, 5000, 'Home (zh)');
  assert.equal(
    await tab.eval(`document.querySelector('.home .panel button').textContent.trim()`),
    '创建房间',
    '中文 toggle renders Simplified Chinese',
  );

  await clickButton(tab, '.locale-toggle', 'EN');
  await waitFor(tab, `document.querySelector('.home .panel button').textContent.trim() === 'Create room'`, 5000, 'Home (en again)');
  console.log('  locale toggle: en → 中文 → EN round-trips');
}

async function runRenderChecks(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  assert.equal(await tabA.eval(`document.querySelectorAll('.tabletop .seat').length`), 1, 'one opponent seat in the ring (ticket 35)');
  assert.equal(await tabA.eval(`document.querySelector('.dock-seat') !== null`), true, 'the viewer seat docks at the bottom (ticket 35)');
  assert.equal(await tabA.eval(`document.querySelectorAll('.tabletop .seat.me').length`), 0, 'no self tile in the ring (ticket 35)');
  assert.equal(await tabA.eval(`document.querySelectorAll('.seat.turn').length`), 1, 'exactly one seat is the current turn');

  // Issue 14: the active player's tile is highlighted with a pill — exactly
  // one seat is marked at round start — and the tile internals never reuse
  // the bare `.hand` class (it would inherit the hand-dock min-height).
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.tabletop .seat .hand').length`),
    0,
    'no bare .hand class inside seats',
  );

  // The eight cards + the four rulings live in the manual (ticket 34) — the
  // old in-flow abilities `<details>` is gone; runFixedStage opens the manual
  // from the top bar and asserts the three sections there.

  // Ticket 33: the round-end overlay resets the piles on "Start next round",
  // so a round that ends exactly when the second pile lands could race the
  // snapshot — require a live round (no overlay) for a stable read.
  await playUntil(
    [tabA, tabB],
    async () =>
      (await nonEmptyPiles(tabA)) >= 2
      && (await tabA.eval(`document.querySelector('.round-over') === null`)),
    600,
  );
  const pileImgs = (await tabA.eval(
    `[...document.querySelectorAll('.seat .pile img')].map((i) => i.getAttribute('src'))`,
  )) as string[];
  assert.ok(pileImgs.length >= 2, 'discard piles show card images');
  assert.ok(pileImgs.every((src) => /^\/cards\/[1-8]\.png$/.test(src)), `discard images are rank-keyed: ${pileImgs}`);

  // Issue 13: every seat shows a public hand count; once anyone has played,
  // at least one seat holds cards represented by face-down backs.
  // One atomic snapshot: the counts and the face-down backs must agree — a
  // separate eval could straddle a draw release (ticket 38: the counts move
  // at the release, not the fold) and see them a frame apart.
  const hand = (await tabA.eval(`(() => {
    const counts = [...document.querySelectorAll('.seat .hand-count')].map((t) => Number(t.textContent));
    return { counts, backs: document.querySelectorAll('.seat .hand-back').length };
  })()`)) as { counts: number[]; backs: number };
  assert.equal(hand.counts.length, 2, 'both seats show a hand count');
  assert.ok(
    hand.counts.every((c) => /^[0-2]$/.test(String(c))),
    `hand counts are numbers 0-2: ${hand.counts}`,
  );
  const totalHeld = hand.counts.reduce((sum, c) => sum + c, 0);
  assert.equal(hand.backs, totalHeld, 'face-down backs equal the total cards held');

  // Chat lives behind a pill → modal dialog (issue 20): open on A, send
  // (which closes the dialog), then check the relay and previews on both tabs.
  await click(tabA, '.chat-pill');
  await waitFor(tabA, `document.querySelector('.chat-dialog') !== null`, 5000, 'chat dialog opens on A');
  await setInput(tabA, '.chat-input input', 'hello from Alice');
  await click(tabA, '.chat-input button');
  await waitFor(tabA, `document.querySelector('.chat-dialog') === null`, 5000, 'chat dialog closes on send');
  await waitFor(
    tabA,
    `document.querySelector('.chat-preview')?.textContent.includes('You: hello from Alice')`,
    10000,
    'own message previewed on A',
  );
  await waitFor(
    tabB,
    `document.querySelector('.chat-preview')?.textContent.includes('Alice: hello from Alice')`,
    10000,
    'chat relayed to B',
  );
  await click(tabB, '.chat-pill');
  await waitFor(tabB, `document.querySelector('.chat-dialog') !== null`, 5000, 'chat dialog opens on B');
  await waitFor(
    tabB,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('hello from Alice'))`,
    10000,
    'message in B list',
  );
  await tabB.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabB, `document.querySelector('.chat-dialog') === null`, 5000, 'chat dialog closes on Esc');

  await rm(SHOT_DIR, { recursive: true, force: true });
  await mkdir(SHOT_DIR, { recursive: true });
  await tabA.screenshot(join(SHOT_DIR, 'tab-a.png'));
  await tabB.screenshot(join(SHOT_DIR, 'tab-b.png'));
  console.log(`  screenshots: ${SHOT_DIR}`);
}

// ---------------------------------------------------------------------------
// Scenario 1b — tickets 19 + 21 + 33: the log is a latest-event strip in the
// merged top bar (tappable → the full-log modal; near-fullscreen on phones).
// The strip shows the newest entry (with a rank-keyed mini thumbnail when it
// carries a rank) and tracks live play.
// ---------------------------------------------------------------------------

async function runLogStrip(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // Ticket 33: the strip lives in the merged top bar, pinned to the top of
  // the viewport — visible without scrolling (the stage never scrolls).
  const pinned = (await tabA.eval(`(() => {
    const bar = document.querySelector('.stage-top');
    const strip = document.querySelector('.log-strip');
    if (bar === null || strip === null) return null;
    const br = bar.getBoundingClientRect();
    return { top: br.top, stripInBar: bar.contains(strip) };
  })()`)) as { top: number; stripInBar: boolean } | null;
  assert.ok(pinned !== null, 'top bar and log strip present');
  assert.equal(pinned!.top, 0, 'the merged top bar is at the top of the viewport');
  assert.equal(pinned!.stripInBar, true, 'the log strip lives in the top bar');

  // Some real play so the log has entries (a play line carries a rank).
  await playUntil([tabA, tabB], async () => (await nonEmptyPiles(tabA)) >= 2, 600);

  // Ticket 24: while a scene animates the strip follows the beat, so the
  // newest-entry snapshot must wait for the queue to drain first.
  await waitFor(tabA, `document.querySelectorAll('.scenes .scene').length === 0`, 20000, 'scenes idle before the strip snapshot');

  // One atomic snapshot: the strip and the top of the modal list must show
  // the same entry, and any thumbnail must stay rank-keyed (never a name).
  const snap = (await tabA.eval(`(() => {
    const strip = document.querySelector('.log-strip-text')?.textContent ?? null;
    const first = document.querySelector('.log li')?.textContent ?? null;
    const thumb = document.querySelector('.log-strip img.log-thumb')?.getAttribute('src') ?? null;
    const open = document.querySelector('.log-modal')?.classList.contains('open') ?? null;
    return { strip, first, thumb, open };
  })()`)) as { strip: string | null; first: string | null; thumb: string | null; open: boolean | null };
  assert.ok(snap.strip !== null && snap.strip.length > 0, 'strip shows a latest event');
  assert.equal(snap.strip, snap.first, 'strip shows the newest entry — the top of the modal list');
  assert.equal(snap.open, false, 'log modal starts closed');
  assert.ok(
    snap.thumb === null || /^\/cards\/[1-8]\.png$/.test(snap.thumb),
    `strip thumbnail is rank-keyed: ${snap.thumb}`,
  );

  // Tapping the strip opens the modal (ticket 33 — no more in-place
  // <details> expansion); the full list is visible; Esc and outside click
  // close it.
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === true`, 5000, 'log modal opens');
  const visible = (await tabA.eval(`(() => {
    const el = document.querySelector('.log-dialog .log');
    const modal = document.querySelector('.log-modal');
    return el !== null && modal !== null && getComputedStyle(modal).display !== 'none' && el.getBoundingClientRect().height > 0;
  })()`)) as boolean;
  assert.equal(visible, true, 'the modal history is visible when open');
  assert.ok(
    (await tabA.eval(`document.querySelectorAll('.log li').length`)) > 0,
    'the modal lists the history',
  );
  await tabA.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === false`, 5000, 'log modal closes on Esc');
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === true`, 5000, 'log modal reopens');
  await click(tabA, '.log-modal');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === false`, 5000, 'log modal closes on outside click');

  // Ticket 33, phones: the modal dialog fills the viewport (the chat
  // precedent) — the list gets all the room.
  await tabA.setViewport(375, 812);
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === true`, 5000, 'log modal opens at phone width');
  const fills = (await tabA.eval(`(() => {
    const r = document.querySelector('.log-dialog').getBoundingClientRect();
    return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
  })()`)) as { w: number; h: number; vw: number; vh: number };
  assert.ok(
    fills.w >= fills.vw - 1 && fills.h >= fills.vh - 1,
    `log dialog near-fullscreen at phone size: ${JSON.stringify(fills)}`,
  );
  await tabA.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === false`, 5000, 'log modal closes at phone width');

  // The strip tracks live play: one more move must change the newest entry.
  const before = (await tabA.eval(`document.querySelector('.log-strip-text')?.textContent ?? null`)) as string | null;
  await playUntil(
    [tabA, tabB],
    async () => (await tabA.eval(`document.querySelector('.log-strip-text')?.textContent ?? null`)) !== before,
    600,
  );
  await assertNoErrors(tabA, tabB);
}

// ---------------------------------------------------------------------------
// Scenario 1d — ticket 33: the fixed stage. Desktop has no scroll — the
// stage fills the viewport (`100dvh`, overflow hidden) and every stage
// element (top bar, dock, ring seats, center table) stays inside it; the
// ring seats and center-table cards render rank-keyed; the log modal and
// the round-end overlay open/close; a scene plays fully visible; a narrow
// landscape viewport shows the rotate notice instead of the stage.
// ---------------------------------------------------------------------------

async function runFixedStage(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // 1. Zero-scroll: the stage is 100dvh with overflow hidden; the document
  //    never scrolls; every stage element is inside the viewport.
  const stage = (await tabA.eval(`(() => {
    const s = document.querySelector('.screen.game');
    if (s === null) return null;
    const r = s.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      vh: window.innerHeight,
      overflow: getComputedStyle(s).overflow,
      rootScrollH: document.documentElement.scrollHeight,
      rootClientH: document.documentElement.clientHeight,
    };
  })()`)) as { top: number; bottom: number; vh: number; overflow: string; rootScrollH: number; rootClientH: number } | null;
  assert.ok(stage !== null, 'game stage present');
  assert.equal(stage!.top, 0, 'stage starts at the top of the viewport');
  assert.equal(stage!.bottom, stage!.vh, 'stage fills the viewport (100dvh)');
  assert.equal(stage!.overflow, 'hidden', 'the stage clips its own content');
  assert.ok(stage!.rootScrollH <= stage!.rootClientH + 1, 'the document has no scroll');

  const inside = (await tabA.eval(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return [...document.querySelectorAll('.stage-top, .stage-bottom, .dock-seat, .tabletop .seat, .center-table')]
      .every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= -0.5 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5;
      });
  })()`)) as boolean;
  assert.equal(inside, true, 'the top bar, dock, ring seats, and center table are all inside the viewport');

  // 2. The ring renders: two seats for a 2p duel, and every table image is
  //    rank-keyed or a card back (never a display name).
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.tabletop .seat').length`),
    1,
    'one opponent seat in the ring (2p, ticket 35)',
  );
  assert.equal(
    await tabA.eval(`document.querySelector('.dock-seat') !== null`),
    true,
    'the viewer seat docks at the bottom (ticket 35)',
  );
  assert.equal(
    await tabA.eval(`document.querySelector('.tabletop.duel') !== null`),
    true,
    'the ring is the duel layout for 2 players',
  );
  const tableSrcs = (await tabA.eval(
    `[...document.querySelectorAll('.tabletop img')].map((i) => i.getAttribute('src'))`,
  )) as string[];
  assert.ok(
    tableSrcs.every((src) => /^\/cards\/([1-8]|back-light)\.png$/.test(src)),
    `ring and center-table images are rank-keyed: ${tableSrcs}`,
  );

  // 3. The log modal opens and closes (the strip lives in the top bar).
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === true`, 5000, 'log modal opens');
  await click(tabA, '.log-modal .chat-close');
  await waitFor(tabA, `document.querySelector('.log-modal').classList.contains('open') === false`, 5000, 'log modal closes');

  // 3b. The Manual button in the top bar opens the rules manual (ticket 34)
  //     — three sections: quick rules, the eight cards, the four adopted
  //     rulings — and closes again (outside click / Esc covered by the log
  //     modal checks; the close button is exercised here).
  await click(tabA, '.manual-button');
  await waitFor(tabA, `document.querySelector('.manual-modal') !== null`, 5000, 'manual modal opens');
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.manual-section').length`),
    3,
    'the manual has three sections',
  );
  assert.ok(
    (await tabA.eval(`document.querySelectorAll('.manual-section .manual-list li').length`)) >= 7,
    'the quick-rules section lists the rules',
  );
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.cards-section .abilities-list li').length`),
    8,
    'all eight cards listed with their effects',
  );
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.rulings-section .manual-list li').length`),
    4,
    'the four adopted rulings are listed',
  );
  await click(tabA, '.manual-modal .chat-close');
  await waitFor(tabA, `document.querySelector('.manual-modal') === null`, 5000, 'manual modal closes');

  // 4. A scene plays fully visible — catch a fly mid-flight and assert its
  //    whole box is on screen (the stage never carries the animation away).
  //    Bring tabA to front so its animation clock actually runs.
  await tabA.bringToFront();
  await playUntil(
    [tabA, tabB],
    async () => {
      const r = (await tabA.eval(`(() => {
        const el = document.querySelector('.scenes .scene');
        if (el === null) return null;
        const b = el.getBoundingClientRect();
        return {
          inside: b.top >= -0.5 && b.bottom <= window.innerHeight + 0.5
            && b.left >= -0.5 && b.right <= window.innerWidth + 0.5,
        };
      })()`)) as { inside: boolean } | null;
      return r !== null && r.inside;
    },
    1200,
  );

  // 5. The round-end overlay opens (a centered card over the stage) and
  //    closes via its "Start next round" button. Scenes pause the round
  //    ~2.5s per move (ticket 24), so finish the round with motion off.
  //    The overlay is observed before it is consumed: playOneMove's auto-
  //    "Start next round" click would race the check (the roundStarted
  //    event can land between the check and the click), so drive with the
  //    click suppressed until the overlay is seen.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  let roundEnded = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !roundEnded) {
    if ((await tabA.eval(`document.querySelector('.round-over') !== null`)) as boolean) {
      roundEnded = true;
      break;
    }
    if (await click(tabA, '.match-over button')) continue; // a rematch mid-wait — keep going
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(roundEnded, 'a round ended — the round-end overlay appears');
  const overlay = (await tabA.eval(`(() => {
    const ov = document.querySelector('.round-end-overlay');
    const card = document.querySelector('.round-over');
    if (ov === null || card === null) return null;
    const or = ov.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return {
      display: getComputedStyle(ov).display,
      coversStage: or.top <= 0.5 && or.bottom >= window.innerHeight - 0.5,
      cardCentered: Math.abs(cr.top + cr.height / 2 - window.innerHeight / 2) < 150,
    };
  })()`)) as { display: string; coversStage: boolean; cardCentered: boolean } | null;
  assert.ok(overlay !== null, 'round-end overlay present');
  assert.notEqual(overlay!.display, 'none', 'round-end overlay is visible');
  assert.equal(overlay!.coversStage, true, 'the overlay covers the stage');
  assert.equal(overlay!.cardCentered, true, 'the round-end card is centered');
  await click(tabA, '.round-over button');
  await waitFor(tabA, `document.querySelector('.round-over') === null`, 10000, 'round-end overlay closes');

  // 6. Portrait lock: a narrow landscape viewport shows the rotate notice
  //    instead of the stage.
  await tabA.setViewport(812, 375);
  const locked = (await tabA.eval(`(() => {
    const stage = document.querySelector('.screen.game');
    const notice = document.querySelector('.rotate-notice');
    return {
      stageDisplay: stage !== null ? getComputedStyle(stage).display : null,
      noticeDisplay: notice !== null ? getComputedStyle(notice).display : null,
      noticeText: notice !== null ? notice.textContent?.trim() ?? '' : '',
    };
  })()`)) as { stageDisplay: string | null; noticeDisplay: string | null; noticeText: string };
  assert.equal(locked.stageDisplay, 'none', 'the stage hides on a narrow landscape viewport');
  assert.notEqual(locked.noticeDisplay, 'none', 'the rotate notice shows on a narrow landscape viewport');
  assert.ok(locked.noticeText.length > 0, 'the rotate notice has text');
  await assertNoErrors(tabA, tabB);
  console.log('  fixed stage: zero-scroll, rank-keyed ring, log modal + round-end overlay, scene in view, portrait lock');
}

// ---------------------------------------------------------------------------
// Scenario — ticket 35: the viewer's seat lives only in the dock. The ring
// holds only opponents; the dock is the viewer's full seat (name / tokens /
// pile / hand count) with the hand; the rank badge and the full-width play
// bar are gone; and a pending choice lights the target seats (tap-the-seat)
// — a tap resolves it, or opens the Guard's card-chip row.
// ---------------------------------------------------------------------------

async function runOwnSeatDock(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);

  // 1. Structure: the ring holds the one opponent; the dock is the viewer's
  //    seat carrying every field a ring seat carries.
  assert.equal(await tabA.eval(`document.querySelectorAll('.tabletop .seat').length`), 1, 'ring has no self tile');
  assert.equal(await tabA.eval(`document.querySelectorAll('.seat').length`), 2, 'two seats total (ring + dock)');
  assert.equal(await tabA.eval(`document.querySelector('.dock-seat.seat.me') !== null`), true, 'the dock is the viewer seat');
  const dockFields = (await tabA.eval(`(() => {
    const d = document.querySelector('.dock-seat');
    if (d === null) return null;
    return {
      name: d.querySelector('.seat-row .name')?.textContent ?? null,
      tokens: d.querySelector('.seat-row .tokens')?.textContent ?? null,
      pile: d.querySelector('.seat-row .pile') !== null || d.querySelector('.seat-row .pile-empty') !== null,
      count: d.querySelector('.seat-row .hand-count')?.textContent ?? null,
    };
  })()`)) as { name: string | null; tokens: string | null; pile: boolean; count: string | null } | null;
  assert.ok(dockFields !== null, 'the dock seat row exists');
  assert.equal(dockFields!.name, 'You', 'the dock names the viewer');
  assert.ok(dockFields!.tokens !== null && dockFields!.tokens.includes('♥'), 'the dock shows the viewer tokens');
  assert.equal(dockFields!.pile, true, 'the dock carries the viewer pile');
  assert.ok(dockFields!.count !== null && /^[0-2]$/.test(dockFields!.count!), 'the dock shows the viewer hand count');
  assert.equal(await tabA.eval(`document.querySelector('.card.art .rank-badge') === null`), true, 'the rank badge is gone');
  assert.equal(await tabA.eval(`document.querySelector('.play-bar') === null`), true, 'the full-width play bar is gone');

  // 2. Tap-the-seat: drive until a choice is pending on tabA — the legal
  //    target seat lights up; tapping it resolves the choice (a Guard opens
  //    the card-chip row instead, and a chip tap resolves it).
  let sawLit = false;
  for (let step = 0; step < 1500; step++) {
    const mine = (await tabA.eval(
      `document.querySelector('.choice-slot .choice-hint:not(.muted)') !== null
       || document.querySelector('.choice-slot .choice-chips') !== null`,
    )) as boolean;
    if (mine) {
      if (await click(tabA, '.seat.chooseable')) {
        sawLit = true;
        await click(tabA, '.choice-chips button'); // Guard step 2, if it appeared
      }
      await waitFor(
        tabA,
        `document.querySelector('.choice-slot .choice-hint:not(.muted)') === null
         && document.querySelector('.choice-slot .choice-chips') === null`,
        10000,
        'the choice resolved on tabA',
      );
      break;
    }
    await click(tabA, '.match-over button');
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(sawLit, 'a pending choice lit the target seat');
  await assertNoErrors(tabA, tabB);
  console.log('  own-seat dock: ring has no self tile, dock is the seat, rank badge gone, tap-the-seat resolves');
}

// ---------------------------------------------------------------------------
// Scenario 1c — ticket 20: chat is a floating pill + modal dialog. The pill
// previews the newest message (muted "Chat" when empty) with an unread badge
// that grows while the dialog is closed and clears on open; the dialog closes
// on send, Esc, and outside click, and fills the viewport on phones.
// ---------------------------------------------------------------------------

async function runChatPill(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // Fresh room: chat is empty — the pill shows the muted default, no badge.
  await waitFor(tabA, `document.querySelector('.chat-pill') !== null`, 10000, 'chat pill present');
  assert.equal(
    await tabA.eval(`document.querySelector('.chat-preview').textContent.trim()`),
    'Chat',
    'empty chat shows the muted default',
  );
  assert.equal(
    await tabA.eval(`document.querySelector('.chat-pill .chat-badge') === null`),
    true,
    'no badge with no messages',
  );

  // A sends two messages while B's dialog stays closed: the badge counts 2
  // and the preview always tracks the newest.
  for (const text of ['hi from Alice', 'one more']) {
    await click(tabA, '.chat-pill');
    await waitFor(tabA, `document.querySelector('.chat-dialog') !== null`, 5000, 'dialog opens on A');
    await setInput(tabA, '.chat-input input', text);
    await click(tabA, '.chat-input button');
    await waitFor(tabA, `document.querySelector('.chat-dialog') === null`, 5000, 'dialog closes on send');
  }
  await waitFor(tabA, `document.querySelector('.chat-preview')?.textContent.includes('You: one more')`, 10000, 'preview newest on A');
  assert.equal(
    await tabA.eval(`document.querySelector('.chat-pill .chat-badge') === null`),
    true,
    "the sender's own echoed messages never badge (seen baseline advances)",
  );
  await waitFor(tabB, `document.querySelector('.chat-badge')?.textContent === '2'`, 10000, 'unread badge 2 on B');
  await waitFor(
    tabB,
    `document.querySelector('.chat-preview')?.textContent.includes('Alice: one more')`,
    10000,
    'preview newest on B',
  );

  // Opening the dialog clears the badge; both messages are in the list; Esc closes.
  await click(tabB, '.chat-pill');
  await waitFor(tabB, `document.querySelector('.chat-dialog') !== null`, 5000, 'dialog opens on B');
  assert.equal(await tabB.eval(`document.querySelector('.chat-badge') === null`), true, 'badge clears on open');
  assert.equal(
    await tabB.eval(
      `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('one more'))`,
    ),
    true,
    'newest message in B list',
  );
  await tabB.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabB, `document.querySelector('.chat-dialog') === null`, 5000, 'dialog closes on Esc');

  // One more message while closed → badge back to 1; outside click closes.
  await click(tabA, '.chat-pill');
  await waitFor(tabA, `document.querySelector('.chat-dialog') !== null`, 5000, 'dialog opens on A');
  await setInput(tabA, '.chat-input input', 'third');
  await click(tabA, '.chat-input button');
  await waitFor(tabB, `document.querySelector('.chat-badge')?.textContent === '1'`, 10000, 'unread badge 1 on B');
  await click(tabB, '.chat-pill');
  await waitFor(tabB, `document.querySelector('.chat-dialog') !== null`, 5000, 'dialog opens on B');
  await click(tabB, '.chat-modal'); // outside click closes
  await waitFor(tabB, `document.querySelector('.chat-dialog') === null`, 5000, 'dialog closes on outside click');

  // Phone viewport: the dialog fills the viewport (near-fullscreen, Q14).
  await tabB.setViewport(375, 812);
  await click(tabB, '.chat-pill');
  await waitFor(tabB, `document.querySelector('.chat-dialog') !== null`, 5000, 'dialog opens at phone width');
  const fills = (await tabB.eval(`(() => {
    const r = document.querySelector('.chat-dialog').getBoundingClientRect();
    return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
  })()`)) as { w: number; h: number; vw: number; vh: number };
  assert.ok(
    fills.w >= fills.vw - 1 && fills.h >= fills.vh - 1,
    `dialog near-fullscreen at phone size: ${JSON.stringify(fills)}`,
  );
  // Ticket 29: at phone size the dialog fills the viewport — no backdrop to
  // tap and no Esc key — so the explicit close button must exist and work.
  assert.equal(
    await tabB.eval(`document.querySelector('.chat-dialog .chat-close') !== null`),
    true,
    'close button visible at phone width',
  );
  await click(tabB, '.chat-dialog .chat-close');
  await waitFor(tabB, `document.querySelector('.chat-dialog') === null`, 5000, 'dialog closes via the close button');
  await assertNoErrors(tabA, tabB);
}

// ---------------------------------------------------------------------------
// Scenario — ticket 28: the drawer's own draw pops the new card in the hand
// (~0.6s, pure CSS — no scene, no round pause) and the deck count stays in
// step. Catch a pop mid-flight while playing; the popped card stays
// rank-keyed. (The pop is drawer-only — the other tab just sees the deck
// move; reduced-motion disables the CSS, covered by the media query.)
// ---------------------------------------------------------------------------

async function runDrawPop(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  await tabA.bringToFront();
  await tabB.bringToFront();
  await tabA.bringToFront();

  await playUntil(
    [tabA, tabB],
    () => tabA.eval(`document.querySelector('.hand button.card.drawn') !== null`),
    600,
  );
  const drawnSrc = (await tabA.eval(
    `document.querySelector('.hand button.card.drawn img')?.getAttribute('src') ?? null`,
  )) as string | null;
  assert.ok(drawnSrc === null || /^\/cards\/[1-8]\.png$/.test(drawnSrc), `drawn card stays rank-keyed: ${drawnSrc}`);
  const header = (await tabA.eval(
    `document.querySelector('.meta-deck')?.textContent ?? ''`,
  )) as string;
  assert.ok(/Deck: \d+/.test(header), `deck count in the top bar: ${header}`);
  await assertNoErrors(tabA, tabB);
  console.log('  draw pop: the drawn card pops in the hand (rank-keyed), deck count in step');
}

// ---------------------------------------------------------------------------
// Scenario — ticket 38: the story owns the draw moment. A draw that lands
// while the scene queue is busy is **held** — the drawer's own card, the
// deck count, and the seat hand counts keep their pre-draw values — and
// **released** when the story reaches it (the queue drains), at which moment
// the card appears, the deck drops, and the seat counts bump (the ticket-28
// pop fires as the draw's narration). Every turn's draw lands mid-scene (the
// previous play's scene animates), so the hold is observable on the first
// moves. The other tab sees the deck + hand counts move at the same release
// moment (each client lags its own story by the same scene duration).
// ---------------------------------------------------------------------------

async function runDrawSync(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  // Both tabs must animate — hidden tabs freeze their animation clocks,
  // which would freeze the scene queues (and the held draws with them).
  await tabA.bringToFront();
  await tabB.bringToFront();
  await tabA.bringToFront();

  /** One atomic snapshot of the story-related display + the draw tally. */
  const snap = (t: CdpSession) =>
    t.eval(`(() => {
      const deckEl = document.querySelector('.deck-total');
      const counts = [...document.querySelectorAll('.seat .hand-count')].map((s) => Number(s.textContent));
      return {
        busy: document.querySelectorAll('.scenes .scene').length > 0,
        deck: deckEl === null ? -1 : Number(deckEl.textContent),
        sum: counts.reduce((a, b) => a + b, 0),
        dock: document.querySelectorAll('.dock-seat .hand button.card').length,
        draws: document.querySelectorAll('.log li.log-draw').length,
        roundOver: document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null,
      };
    })()`) as Promise<{
      busy: boolean;
      deck: number;
      sum: number;
      dock: number;
      draws: number;
      roundOver: boolean;
    }>;

  // Drive until a draw lands while a scene plays. The deck is the invariant
  // that survives a play: only draws change it, and a held draw never shows
  // — so a draw landing mid-scene leaves the deck display untouched, and the
  // release (the queue draining) drops it. `baseline` is the previous poll's
  // deck; the catch verifies the deck did NOT move when the draw landed. A
  // release crossing between polls, a round reset, or a same-burst countess
  // (its deck-drop folds at the cancellation) fails the verify and
  // re-baselines — the next draw lands clean.
  let seen = -1;
  let baseline: number | null = null;
  let caught: Awaited<ReturnType<typeof snap>> | null = null;
  let heldB: Awaited<ReturnType<typeof snap>> | null = null;
  for (let step = 0; step < 3000 && caught === null; step++) {
    const s = await snap(tabA);
    if (s.roundOver || (baseline !== null && s.deck > baseline)) {
      // The round ended — advance it (playOneMove's auto-"Start next round"
      // click never runs: this branch skips the move-driving), then
      // re-baseline on the new round.
      if (s.roundOver) {
        await click(tabA, '.round-over button');
        await click(tabA, '.match-over button');
      }
      seen = -1;
      baseline = null;
      continue;
    }
    if (baseline !== null && s.busy && s.draws > seen && s.deck === baseline) {
      // A draw landed while a scene played and the deck did not move — the
      // story is holding it. The other tab must be holding the same moment
      // too (its pre-release snapshot feeds the release assertions).
      const b = await snap(tabB);
      if (b.busy && b.deck === baseline) {
        caught = s;
        heldB = b;
        break;
      }
    }
    seen = s.draws;
    baseline = s.deck;
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  if (caught === null) {
    // Diagnose the stall: dump both tabs' state so a future failure is
    // self-explanatory (this is the last-resort branch — the catch above
    // normally fires within a handful of moves).
    const dump = (t: CdpSession, tag: string) =>
      t.eval(`(() => {
        const seats = [...document.querySelectorAll('.seat')].map((s) => ({
          turn: s.classList.contains('turn'),
          out: s.classList.contains('out'),
          count: s.querySelector('.hand-count')?.textContent ?? null,
          handCards: s.querySelectorAll('.hand button.card').length,
          playable: s.querySelectorAll('.hand button.card.playable').length,
          name: s.querySelector('.name')?.textContent ?? null,
        }));
        const deckEl = document.querySelector('.deck-total');
        return {
          busy: document.querySelectorAll('.scenes .scene').length,
          deck: deckEl === null ? -1 : Number(deckEl.textContent),
          strip: document.querySelector('.log-strip-text')?.textContent ?? '',
          seats,
          roundOver: document.querySelector('.round-over') !== null,
          error: document.querySelector('.error-banner')?.textContent ?? null,
        };
      })()`).then((d: unknown) => console.log(`[drawSync] ${tag} state:`, JSON.stringify(d)));
    await dump(tabA, 'A');
    await dump(tabB, 'B');
    throw new Error('drawSync: never caught a draw mid-scene');
  }
  // Stability: nothing moves for a moment — the draw is still held while the
  // scene plays out.
  await sleep(300);
  const held = await snap(tabA);
  assert.equal(held.deck, caught!.deck, 'the deck stays pre-draw while the draw is held');
  assert.equal(held.sum, caught!.sum, 'the seat hand counts stay pre-draw while the draw is held');
  assert.equal(held.dock, caught!.dock, "the drawer's dock stays pre-draw while the draw is held");
  const landed = held.draws - seen;
  assert.ok(landed >= 1, `at least one draw landed mid-scene (${landed})`);

  // The release — tab A's queue drains on its own (no moves are driven), the
  // story reaches the draw, and the deck drops. No round can end meanwhile:
  // rounds end only at a play, and the smoke stops driving.
  await waitFor(
    tabA,
    `document.querySelector('.deck-total') !== null && Number(document.querySelector('.deck-total').textContent) === ${caught!.deck - landed}`,
    25000,
    'the deck drops at the draw release',
  );
  const afterA = await snap(tabA);
  assert.equal(afterA.deck, caught!.deck - landed, 'the deck count shows the draw after the release');
  assert.equal(afterA.sum, caught!.sum + landed, 'the seat hand counts bump at the release');
  const grewA = afterA.dock - caught!.dock;

  // The other tab sees the same moment — it is a background tab (its clocks
  // are throttled), so bring it to front for its own drain + release.
  await tabB.bringToFront();
  await waitFor(
    tabB,
    `document.querySelector('.deck-total') !== null && Number(document.querySelector('.deck-total').textContent) === ${caught!.deck - landed}`,
    25000,
    'tab B deck drops at the draw release',
  );
  const afterB = await snap(tabB);
  assert.equal(afterB.deck, caught!.deck - landed, 'the other tab sees the same deck after the release');
  assert.equal(afterB.sum, heldB!.sum + landed, 'the other tab sees the hand counts bump at the release');
  const grewB = afterB.dock - heldB!.dock;
  // The drawers' own docks show the drawn cards (face-up) and the hand/count
  // stays consistent — the total dock growth equals the landed draws (in 2p,
  // the Prince's target and the next player can be the same seat, so one
  // drawer can gain two cards in one burst).
  assert.equal(grewA + grewB, landed, `the drawn cards appear in the drawers' docks (${landed} draws)`);
  assert.ok(grewA >= 0 && grewB >= 0, `each drawer's dock only grows (${grewA}/${grewB})`);
  for (const [t, grew] of [[tabA, grewA], [tabB, grewB]] as const) {
    if (grew === 0) continue;
    const { cards, count } = (await t.eval(`(() => {
      const dock = document.querySelector('.dock-seat');
      return {
        cards: dock === null ? -1 : dock.querySelectorAll('.hand button.card').length,
        count: dock === null ? -1 : Number(dock.querySelector('.hand-count')?.textContent ?? -1),
      };
    })()`)) as { cards: number; count: number };
    assert.equal(count, cards, "the drawer's hand count matches the shown cards");
    const lastSrc = (await t.eval(
      `[...document.querySelectorAll('.dock-seat .hand button.card img')].map((i) => i.getAttribute('src')).at(-1)`,
    )) as string | null;
    assert.ok(lastSrc !== null && /^\/cards\/[1-8]\.png$/.test(lastSrc), `the drawn card stays rank-keyed: ${lastSrc}`);
  }
  await assertNoErrors(tabA, tabB);
  console.log(`  draw sync: ${landed} draw(s) held mid-scene, released at the drain — drawer's dock, deck, and seat counts move together`);
}

// ---------------------------------------------------------------------------
// Scenario 1d — ticket 23: scene-based card animations. A scene plays
// through — the played card appears (Use), the verdict caption appears with
// the outcome (Effect) — and drains on its own; every animated card stays
// rank-keyed; under prefers-reduced-motion no scene ever appears.
// ---------------------------------------------------------------------------

async function runSceneAnimations(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // tabB was brought to front last in openTabs — make tabA visible again so
  // its animation clock runs (headless pages freeze animations while hidden).
  await tabA.bringToFront();

  // The played card appears mid-scene (the fly is ~0.9–1s, long enough for
  // playUntil's per-iteration poll to see one) and stays rank-keyed.
  await playUntil(
    [tabA, tabB],
    async () => (await tabA.eval(`document.querySelector('.scenes .scene-fly') !== null`)) as boolean,
    600,
  );
  const anySrc = (await tabA.eval(`(() => {
    const img = document.querySelector('.scenes img');
    return img === null ? null : img.getAttribute('src');
  })()`)) as string | null;
  assert.ok(
    anySrc === null || /^\/cards\/[1-8]\.png$/.test(anySrc),
    `animated cards stay rank-keyed: ${anySrc}`,
  );

  // The caught scene's effect beat ends with a verdict caption (~1.5s hold)
  // within a couple of seconds — no further moves are needed; the head scene
  // reaches it on its own. (Every scene with a fly also has a caption.)
  await waitFor(
    tabA,
    `(document.querySelector('.scene-caption')?.textContent ?? '').trim().length > 0`,
    10000,
    'verdict caption appears',
  );

  // The queue drains on its own — no input needed to clear the head scene
  // and anything that queued behind it while we played.
  await waitFor(tabA, `document.querySelectorAll('.scenes .scene').length === 0`, 25000, 'scenes drain');

  // Reduced motion: play more, no scene may ever appear. Progress is
  // measured by the log text growing — any entry means a real play/choice
  // happened, and under reduced motion the top-bar text is the moment
  // carrier (the spec's own framing). Non-empty pile COUNT can't be used:
  // it caps at the seat count, so a round where both seats already have
  // piles can never exceed its own baseline (a round reset only drops it).
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  const logBefore = (await logText(tabA)) as string;
  await playUntil([tabA, tabB], async () => ((await logText(tabA)) as string) !== logBefore, 600);
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scenes .scene').length`),
    0,
    'no scenes under prefers-reduced-motion',
  );
  await assertNoErrors(tabA, tabB);
}

async function runSceneBlocking(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  // Both tabs must animate — hidden headless tabs freeze their animation
  // clocks, which would freeze their scene queues (and with ticket 24's
  // blocking, their hands) forever.
  await tabA.bringToFront();
  await tabB.bringToFront();
  await tabA.bringToFront();

  // 1. Blocking: catch a scene mid-flight in a live round. While it plays,
  //    neither tab has a clickable hand; after the drain the turn holder's
  //    hand is enabled again. (A caught play can end the round a frame later
  //    — retry for a scene that leaves a live round behind it.)
  let turnTab: CdpSession | null = null;
  for (let attempt = 0; attempt < 10 && turnTab === null; attempt++) {
    await playUntil(
      [tabA, tabB],
      async () => {
        const sceneActive = (await tabA.eval(`document.querySelectorAll('.scenes .scene').length > 0`)) as boolean;
        const roundLive = (await tabA.eval(
          `document.querySelector('.round-over') === null && document.querySelector('.match-over') === null`,
        )) as boolean;
        return sceneActive && roundLive;
      },
      1200,
    );
    for (const t of [tabA, tabB]) {
      assert.equal(
        await t.eval(`document.querySelectorAll('button.card.playable').length`),
        0,
        'hand is disabled while a scene plays',
      );
    }
    // Both queues must drain — the caught scene plays on both clients, and
    // the turn holder could be either tab.
    for (const t of [tabA, tabB]) {
      await waitFor(t, `document.querySelectorAll('.scenes .scene').length === 0`, 25000, 'scenes drain');
    }
    for (const t of [tabA, tabB]) {
      if (await t.eval(`document.querySelector('.seat.turn.me') !== null`)) turnTab = t;
    }
  }
  assert.ok(turnTab !== null, 'a seat holds the turn after the drain');
  assert.ok(
    (await turnTab.eval(`document.querySelectorAll('button.card.playable').length`)) > 0,
    'hand is enabled again after the scene drains',
  );

  // 2. Strip follows the scene: the win line appears only at the win moment.
  //    Ticket 24's blocking pauses the round ~3s per move, so play the early
  //    rounds with motion off (nothing enqueues, nothing blocks — fast), and
  //    switch animations on when a player reaches 6/7 tokens: the next round
  //    ends the match and plays the final scene + win banner. The win
  //    transition is observed DURING play (ticket 37: the end overlay now
  //    appears only after the story drains, so the banner is gone by the
  //    time the overlay shows — the observation must ride the story): while
  //    the final scene (a non-banner head) plays, the strip must NOT show
  //    the win line and no end overlay may exist; when the win banner
  //    plays, the strip must show it.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(
      `[...document.querySelectorAll('.seat .tokens')].some((t) => t.textContent.includes('6 / 7'))`,
    ),
    5000,
  );
  await tabA.setReducedMotion(false);
  await tabB.setReducedMotion(false);
  // The media emulation propagates async — wait until the page actually
  // reports no-preference before the final round's first move, so the win
  // banner is guaranteed to enqueue (a stale "reduce" skips every scene and
  // the banner is never caught).
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === false`,
    5000,
    'motion emulation propagates',
  );
  let sawPreBanner = false;
  let sawBanner = false;
  let matchEnded = false;
  const winRe = /won the (round|match)/;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline && !matchEnded) {
    // One atomic snapshot per iteration — the win transition and the overlay
    // appearance can land between separate evals, and the assertions below
    // must see one consistent moment.
    const { banner, strip, sceneActive, endOverlay, matchOver } = (await tabA.eval(`(() => {
      return {
        banner: document.querySelector('.scene-banner') !== null,
        strip: document.querySelector('.log-strip-text')?.textContent ?? '',
        sceneActive: document.querySelectorAll('.scenes .scene').length > 0,
        endOverlay:
          document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null,
        matchOver: document.querySelector('.match-over') !== null,
      };
    })()`)) as { banner: boolean; strip: string; sceneActive: boolean; endOverlay: boolean; matchOver: boolean };
    const hasWin = winRe.test(strip);
    if (banner) {
      assert.equal(hasWin, true, 'the win line shows while the win banner plays');
      sawBanner = true;
    } else if (sceneActive) {
      assert.equal(hasWin, false, 'the win line never races ahead of the final scene');
      // Ticket 37: no end overlay may exist while the story plays — the
      // pre-drain panel cannot be clicked (there is no button).
      assert.equal(endOverlay, false, 'the end overlay never covers the story');
      sawPreBanner = true;
    }
    if (matchOver) {
      matchEnded = true;
      break; // the overlay waited for the story — it appears only at the drain
    }
    if (await click(tabA, '.round-over button')) continue; // a plain round end — keep going
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(sawBanner, 'the win banner was caught');
  assert.ok(sawPreBanner, 'the pre-banner final scene was caught — the strip does not race ahead');
  assert.ok(matchEnded, 'the match ended');
  await assertNoErrors(tabA, tabB);

  // 3. Reduced motion: nothing enqueues, so the round never blocks. Play a
  //    full round under reduced motion, asserting every step that no scene
  //    exists — if a move were ever blocked, the round could not end.
  //    (If phase 2 ended the match, start a rematch first.)
  if (await tabA.eval(`document.querySelector('.match-over') !== null`)) {
    await click(tabA, '.match-over button');
    await waitFor(tabA, `document.querySelector('.screen.game .round-over') === null`, 10000, 'rematch starts');
  }
  // Toggle motion off first — the wait below doubles as the media-emulation
  // propagation delay, so the first move of the loop cannot enqueue a scene.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  // Phase 2's queue may still be draining — let it finish before the checks.
  await waitFor(tabA, `document.querySelectorAll('.scenes .scene').length === 0`, 20000, 'phase-2 queue drains');
  const logBefore = (await logText(tabA)) as string;
  // The overlay is observed before it is consumed (playOneMove's auto-
  // "Start next round" click would race the check — ticket 33's overlay).
  let ended = false;
  for (let step = 0; step < 2000; step++) {
    if (await tabA.eval(`document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null`)) {
      ended = true;
      break;
    }
    assert.equal(
      await tabA.eval(`document.querySelectorAll('.scenes .scene').length`),
      0,
      'no scenes under prefers-reduced-motion',
    );
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(ended, 'a round ends under reduced motion — moves were never blocked');
  assert.notEqual((await logText(tabA)) as string, logBefore, 'moves happened under reduced motion');
  await assertNoErrors(tabA, tabB);
}

// ---------------------------------------------------------------------------
// Scenario — ticket 37: the round/match-end overlays wait for the story.
// The win panel ("Start next round" / "Rematch") exists only after the
// final scene + win banner have drained — it never covers the story, and
// the button cannot be clicked mid-story (there is no button). Reduced
// motion and reconnect never enqueue scenes, so the panel appears
// immediately there. No error banners anywhere.
// ---------------------------------------------------------------------------

async function runRoundEndWaits(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  // Both tabs must animate — hidden headless tabs freeze their animation
  // clocks, which would freeze their scene queues (and with ticket 24's
  // blocking, their hands) forever.
  await tabA.bringToFront();
  await tabB.bringToFront();
  await tabA.bringToFront();

  // Drive to 5/7 with motion off (fast — nothing enqueues, nothing blocks).
  // Round 6 then ends with a plain round-end overlay, round 7 ends the
  // match — both with the story playing (motion on), so the gate is
  // observable on both overlays.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`,
    5000,
    'motion off propagates',
  );
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(
      `[...document.querySelectorAll('.seat .tokens')].some((t) => t.textContent.includes('5 / 7'))`,
    ),
    5000,
  );
  // Consume the round-5 end overlay (it appeared instantly — motion was
  // off); the rounds observed below end with the story playing.
  await click(tabA, '.round-over button');
  await waitFor(tabA, `document.querySelector('.round-over') === null`, 10000, 'round 5 overlay consumed');
  await tabA.setReducedMotion(false);
  await tabB.setReducedMotion(false);
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === false`,
    5000,
    'motion emulation propagates',
  );

  // Observe the plain round end (round 6 — someone is at 5/7, so this round
  // can never end the match) with the story on. Invariant (ticket 37):
  // while any scene animates, no end overlay may exist — the pre-drain
  // panel cannot be clicked (there is no button); the overlay appears only
  // after the queue drains.
  let sawRoundOver = false;
  let sawPreDrain = false;
  const deadlineA = Date.now() + 120_000;
  while (Date.now() < deadlineA && !sawRoundOver) {
    // One atomic snapshot per iteration — the phase flip, the drain, and the
    // overlay appearance can all land between separate evals, and the
    // assertions below must see one consistent moment.
    const { sceneActive, roundOver, matchOver } = (await tabA.eval(`(() => {
      return {
        sceneActive: document.querySelectorAll('.scenes .scene').length > 0,
        roundOver: document.querySelector('.round-over') !== null,
        matchOver: document.querySelector('.match-over') !== null,
      };
    })()`)) as { sceneActive: boolean; roundOver: boolean; matchOver: boolean };
    if (sceneActive) {
      assert.equal(roundOver, false, 'the round-end overlay never covers the story');
      assert.equal(matchOver, false, 'the match-end overlay never covers the story');
      sawPreDrain = true;
    }
    if (roundOver) {
      assert.equal(sceneActive, false, 'the round-end overlay appears only after the story drains');
      sawRoundOver = true;
      await click(tabA, '.round-over button');
      break; // the plain round end is observed — the match continues
    }
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(sawRoundOver, 'a plain round-end overlay appeared after the story drained (motion on)');

  // Bridge to the match-deciding round with motion off (fast — nothing
  // enqueues, nothing blocks) so the story only plays for the two observed
  // rounds. After round 6 either the 5/7 player holds 6/7 or the round's
  // winner does; the next round that a 6/7 holder wins ends the match.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`,
    5000,
    'motion off propagates',
  );
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(
      `[...document.querySelectorAll('.seat .tokens')].some((t) => t.textContent.includes('6 / 7'))`,
    ),
    5000,
  );
  // Consume the bridge's round-over (motion off — it appeared instantly).
  await click(tabA, '.round-over button');
  await waitFor(tabA, `document.querySelector('.round-over') === null`, 10000, 'bridge overlay consumed');
  await tabA.setReducedMotion(false);
  await tabB.setReducedMotion(false);
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === false`,
    5000,
    'motion emulation propagates',
  );

  // Observe the match end (a 6/7 holder wins the final round) with the
  // story on — the match-end overlay gets the same gate as the round-end
  // one: it appears only after the story drains, never over it.
  let sawMatchOver = false;
  const deadlineB = Date.now() + 240_000;
  while (Date.now() < deadlineB && !sawMatchOver) {
    const { sceneActive, roundOver, matchOver } = (await tabA.eval(`(() => {
      return {
        sceneActive: document.querySelectorAll('.scenes .scene').length > 0,
        roundOver: document.querySelector('.round-over') !== null,
        matchOver: document.querySelector('.match-over') !== null,
      };
    })()`)) as { sceneActive: boolean; roundOver: boolean; matchOver: boolean };
    if (sceneActive) {
      assert.equal(roundOver, false, 'the round-end overlay never covers the story');
      assert.equal(matchOver, false, 'the match-end overlay never covers the story');
      sawPreDrain = true;
    }
    if (matchOver) {
      assert.equal(sceneActive, false, 'the match-end overlay appears only after the story drains');
      sawMatchOver = true;
      await click(tabA, '.match-over button');
      break; // the rematch feeds the reduced-motion leg below
    }
    if (roundOver) await click(tabA, '.round-over button'); // a 6/7 holder lost — keep going
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(sawMatchOver, 'the match-end overlay appeared after the story drained (motion on)');
  assert.ok(sawPreDrain, 'the pre-drain state was caught — the story played with no overlay');

  // The rematch click above started a fresh match — wait for it to land
  // before the reduced-motion leg, so its round-end overlay belongs to that
  // leg and not to the previous match.
  await waitFor(
    tabA,
    `document.querySelector('.log')?.textContent.includes('Rematch')`,
    10000,
    'rematch starts',
  );

  // The rematch click above started a fresh match (0/7). Reduced motion:
  // nothing ever enqueues, so the panel appears the moment the round ends —
  // the story has nothing to tell.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  await waitFor(
    tabA,
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`,
    5000,
    'motion off propagates',
  );
  let ended = false;
  for (let step = 0; step < 3000; step++) {
    if ((await tabA.eval(`document.querySelector('.round-over') !== null`)) as boolean) {
      ended = true;
      break;
    }
    assert.equal(
      await tabA.eval(`document.querySelectorAll('.scenes .scene').length`),
      0,
      'no scenes under prefers-reduced-motion',
    );
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t, true)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(ended, 'a round ended under reduced motion — the moves were never blocked');
  assert.equal(
    await tabA.eval(`document.querySelector('.round-over button') !== null`),
    true,
    'the round-end panel exists — and its button is clickable — under reduced motion',
  );

  // Reconnect: a reload mid-round-end resumes from the snapshot. The mount
  // baseline skips the replayed history, so the panel appears immediately —
  // nothing animates, nothing to wait for.
  await tabA.reload();
  await waitFor(tabA, `document.querySelector('.screen.game') !== null`, 15000, 'game screen after reload');
  await waitFor(tabA, `document.querySelector('.round-over') !== null`, 10000, 'round-end panel after reload');
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scenes .scene').length`),
    0,
    'no scenes on the resumed tab',
  );
  await click(tabA, '.round-over button');
  await waitFor(tabA, `document.querySelector('.round-over') === null`, 10000, 'start next round after resume');
  await assertNoErrors(tabA, tabB);
  console.log('  round-end waits: panel after the story (motion on), immediate under reduced motion + resume');
}

// ---------------------------------------------------------------------------
// Scenario — ticket 25: select-confirm regret for hand plays. Clicking a
// playable card selects it (a highlight + the fixed Play action bar naming
// the card); clicking the other card switches the selection; nothing is sent
// until the confirm — the log gains exactly one play line, then the bar
// clears and the played card leaves the hand.
// ---------------------------------------------------------------------------

async function runSelectConfirm(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  // The selection is pure React state — no animation involved. Motion off
  // keeps the round fast (no ~2.5s scene pauses per move).
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);

  // Every player holds exactly two cards at the start of their turn (the
  // turn-start draw) — wait until Alice's turn is live with two cards. (A
  // forced-Countess draw can leave a 1-card turn, so the exact-2 condition
  // is what pins down a real switchable hand.)
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(
      `document.querySelectorAll('.hand button.card').length === 2
       && document.querySelectorAll('.hand button.card.playable').length === 2
       && document.querySelector('.seat.turn.me') !== null`,
    ),
    1200,
  );

  const selectedIndex = () =>
    tabA.eval(
      `[...document.querySelectorAll('.hand button.card')].findIndex((b) => b.classList.contains('selected'))`,
    ) as Promise<number>;
  const chipText = () =>
    tabA.eval(`document.querySelector('.play-chip')?.textContent?.trim() ?? null`) as Promise<string | null>;
  const playLines = () => tabA.eval(`document.querySelectorAll('.log li.log-play').length`) as Promise<number>;
  const nameAt = (i: number) =>
    tabA.eval(
      `document.querySelectorAll('.hand button.card')[${i}]?.querySelector('.name-caption')?.textContent ?? null`,
    ) as Promise<string | null>;
  const card0 = await nameAt(0);
  const card1 = await nameAt(1);
  assert.ok(card0 !== null && card1 !== null, 'both hand cards have names');

  // 1. Select: no play chip before any selection; clicking a card raises the
  //    chip on it (ticket 35 — the card's own name caption still names it) —
  //    and nothing is sent (no new play line).
  assert.equal(
    await tabA.eval(`document.querySelector('.play-chip') === null`),
    true,
    'no play chip before a selection',
  );
  await click(tabA, '.hand button.card');
  await waitFor(tabA, `document.querySelector('.play-chip') !== null`, 5000, 'play chip appears on selection');
  assert.equal(await selectedIndex(), 0, 'the first card is selected');
  assert.equal(await chipText(), 'Play', 'the chip offers to play');
  assert.equal(
    await tabA.eval(`document.querySelector('.hand button.card.selected .name-caption')?.textContent`),
    card0,
    'the selected card still names itself',
  );
  const playsBefore = await playLines();
  await sleep(200); // a beat — still nothing may have been sent
  assert.equal(await playLines(), playsBefore, 'selecting never sends a play');

  // 2. Switch: clicking the other card moves the highlight and re-labels the
  //    bar; still nothing sent. (Two identical cards can share a name — the
  //    selected-position check is what proves the switch.)
  await tabA.eval(`document.querySelectorAll('.hand button.card')[1].click()`);
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.hand button.card')].findIndex((b) => b.classList.contains('selected')) === 1`,
    5000,
    'selection switches to the other card',
  );
  assert.equal(await chipText(), 'Play', 'the chip follows the switched card');
  assert.equal(
    await tabA.eval(`document.querySelector('.hand button.card.selected .name-caption')?.textContent`),
    card1,
    'the switched card names itself',
  );
  assert.equal(await playLines(), playsBefore, 'switching never sends a play');

  // 3. Confirm: exactly one play line lands, the bar clears, the played card
  //    leaves the hand (a deck-empty round can reveal the last card in the
  //    same burst — only the strict drop is asserted).
  const handBefore = (await tabA.eval(`document.querySelectorAll('.hand button.card').length`)) as number;
  await click(tabA, '.play-chip');
  await waitFor(
    tabA,
    `document.querySelectorAll('.log li.log-play').length === ${playsBefore + 1}`,
    10000,
    'exactly one play line after confirm',
  );
  assert.equal(await chipText(), null, 'play chip clears after the play');
  const handAfter = (await tabA.eval(`document.querySelectorAll('.hand button.card').length`)) as number;
  assert.ok(handAfter < handBefore, 'the played card left the hand');
  await assertNoErrors(tabA, tabB);
  console.log(`  select → switch → confirm: one play of ${card1} sent, nothing before it`);
}

// ---------------------------------------------------------------------------
// Scenario — ticket 30: the hand area and the scoreboard count always agree,
// including around King trades. The fixed bug left a stale card in the hand
// area after a trade against an empty-handed player (a Prince'd target on an
// empty deck), so clicking it bounced "no card on that position". The smoke
// drives the match until King trades land, then watches every turn-holder
// moment for the hand/count invariant — the user-facing half of the bug; the
// deterministic regression lives in core's view-sync test.
// ---------------------------------------------------------------------------

async function runKingTrade(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);

  const kingLines = () => tabA.eval(`document.querySelectorAll('.log li.log-king').length`) as Promise<number>;
  let trades = 0;
  let checks = 0;
  // Keep driving until we have both the turn-holder checks AND at least one
  // King trade — the King is ~1/16 of the deck, so a trade can take a while.
  const deadline = Date.now() + 90_000;
  while ((checks < 8 || trades < 1) && Date.now() < deadline) {
    const before = await kingLines();
    // Watch the invariant: whenever this tab holds the turn, the hand area
    // must show exactly as many cards as the scoreboard counts.
    for (const t of [tabA, tabB]) {
      const r = await t.eval(`(() => {
        const seat = document.querySelector('.seat.turn.me');
        if (seat === null) return null; // not this tab's turn — nothing to check
        const shown = document.querySelectorAll('.hand button.card').length;
        const count = seat.querySelector('.hand-count')?.textContent;
        return count === null ? null : { shown, count: Number(count) };
      })()`);
      if (r !== null) {
        assert.equal(r.shown, r.count, `hand area (${r.shown} cards) vs scoreboard (${r.count})`);
        checks += 1;
      }
    }
    // Drive the match forward: one legal move, or the rematch when it ends.
    await click(tabA, '.match-over button');
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t)) { acted = true; break; }
    }
    if (!acted) await sleep(80);
    // A trade that landed during the move shows up now (the same iteration's
    // `before` was captured pre-move).
    if ((await kingLines()) > before) trades += 1;
    await assertNoErrors(tabA, tabB);
  }
  assert.ok(checks >= 8, `hand/count invariant observed ${checks} turn-holder moments`);
  assert.ok(trades >= 1, `a King trade happened (${trades} trade lines)`);
  console.log(`  king trade: ${trades} trades, hand area matches the scoreboard across ${checks} turn-holder moments`);
}

// ---------------------------------------------------------------------------
// Scenario 2 — full 2-player match to the 7-token target + rematch
// ---------------------------------------------------------------------------

async function runFullMatch(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);
  // Ticket 24: scenes pause the round ~2.5s per move; a match would pay that
  // on every play. This scenario asserts log/token/rematch facts, not
  // animations, so play with motion off (nothing enqueues, nothing blocks).
  // Animation behavior is the sceneAnimations and sceneBlocking scenarios' job.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);

  // A 2-player round only deals a few cards when it ends by early elimination,
  // so the single-copy ranks (King/Countess/Princess) can skip a whole match.
  // Play through rematches until every card has been exercised — each fresh
  // deck reshuffles, and the rematch flow is part of this ticket anyway.
  let missing: string[] = [];
  for (let match = 1; match <= 5; match++) {
    await playUntil([tabA, tabB], () => tabA.eval(`document.querySelector('.match-over') !== null`));
    assert.equal(await tabB.eval(`document.querySelector('.match-over') !== null`), true, 'match over on B too');
    const winnerTokens = (await tabA.eval(
      `[...document.querySelectorAll('.seat .tokens')].some((t) => t.textContent.includes('7 / 7'))`,
    )) as boolean;
    assert.equal(winnerTokens, true, 'the winner reached 7 / 7 tokens');

    const log = (await logText(tabA)) as string;
    missing = ALL_CARD_NAMES.filter((n) => !hasName(log, n));
    if (missing.length === 0) break;
    if (match < 5) {
      await click(tabA, '.match-over button');
      await waitFor(tabA, `document.querySelector('.log')?.textContent.includes('Rematch')`, 10000, 'rematch log line');
      await waitFor(
        tabA,
        `document.querySelector('.meta-round')?.textContent === 'Round 1'`,
        10000,
        'round 1 after rematch',
      );
    }
  }
  assert.deepEqual(
    missing,
    [],
    `all eight cards seen across the matches (still missing: ${missing.join(', ')})`,
  );

  // Rematch through the UI from the finished match: tokens reset, round 1.
  await click(tabA, '.match-over button');
  await waitFor(tabA, `document.querySelector('.log')?.textContent.includes('Rematch')`, 10000, 'rematch log line');
  await waitFor(
    tabA,
    `document.querySelector('.meta-round')?.textContent === 'Round 1'`,
    10000,
    'round 1 after rematch',
  );
  const reset = (await tabA.eval(
    `[...document.querySelectorAll('.seat .tokens')].every((t) => t.textContent.includes('0 / 7'))`,
  )) as boolean;
  assert.equal(reset, true, 'tokens reset after rematch');
  await assertNoErrors(tabA, tabB);
}

// ---------------------------------------------------------------------------
// Scenario 3 — 3- and 4-player matches end at the right token targets
// ---------------------------------------------------------------------------

async function runMultiPlayer(base: string, debugPort: number): Promise<void> {
  const cases: Array<{ capacity: number; names: string[]; target: number }> = [
    { capacity: 3, names: ['Alice', 'Bob', 'Carol'], target: 5 },
    { capacity: 4, names: ['Alice', 'Bob', 'Carol', 'Dave'], target: 4 },
  ];
  for (const { capacity, names, target } of cases) {
    const tabs = await openTabs(debugPort, capacity);
    await openRoom(base, tabs, capacity, names);
    // Ticket 24: scenes pause the round ~2.5s per move; this scenario asserts
    // token targets, not animations, so play with motion off (nothing
    // enqueues, nothing blocks). Animation behavior is the sceneAnimations
    // and sceneBlocking scenarios' job.
    for (const t of tabs) await t.setReducedMotion(true);
    assert.equal(
      await tabs[0]!.eval(`document.querySelectorAll('.tabletop .seat').length`),
      capacity - 1,
      `${capacity - 1} opponent seats in the ring (ticket 35)`,
    );
    assert.equal(
      await tabs[0]!.eval(`document.querySelectorAll('.seat').length`),
      capacity,
      `${capacity} seats total (ring + dock)`,
    );
    await playUntil(tabs, () => tabs[0]!.eval(`document.querySelector('.match-over') !== null`));
    const reached = (await tabs[0]!.eval(
      `[...document.querySelectorAll('.seat .tokens')].some((t) => t.textContent.includes('${target} / ${target}'))`,
    )) as boolean;
    assert.equal(reached, true, `${capacity}-player match ended at the ${target}-token target`);
    await assertNoErrors(...tabs);
    console.log(`  ${capacity} players: match ended at ${target} / ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 4 — mid-match reload: resume from snapshot, chat restored, live seat
// ---------------------------------------------------------------------------

async function runReloadResume(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // A message sent before the drop must come back on resume (chatLog). The
  // dialog opens from the pill and closes on send (issue 20).
  await click(tabB, '.chat-pill');
  await waitFor(tabB, `document.querySelector('.chat-dialog') !== null`, 5000, 'chat dialog opens on B');
  await setInput(tabB, '.chat-input input', 'see you after reload');
  await click(tabB, '.chat-input button');
  await click(tabA, '.chat-pill');
  await waitFor(tabA, `document.querySelector('.chat-dialog') !== null`, 5000, 'chat dialog opens on A');
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('see you after reload'))`,
    10000,
    'pre-reload chat visible on A',
  );
  await tabA.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabA, `document.querySelector('.chat-dialog') === null`, 5000, 'chat dialog closes on A');

  // Some real mid-round state: at least one discard on the table.
  await playUntil([tabA, tabB], async () => (await nonEmptyPiles(tabA)) >= 1, 600);
  const before = (await publicSnapshot(tabB)) as { seats: Record<string, { discards: string[]; count: string | null; tokens: string | null }>; header: string[] };

  await tabA.reload();
  await waitFor(tabA, `document.querySelector('.screen.game') !== null`, 15000, 'game screen after reload');
  await click(tabA, '.chat-pill');
  await waitFor(tabA, `document.querySelector('.chat-dialog') !== null`, 5000, 'chat dialog opens after reload');
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('see you after reload'))`,
    10000,
    'chat history restored after reload',
  );
  await tabA.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(tabA, `document.querySelector('.chat-dialog') === null`, 5000, 'chat dialog closes after reload');
  const after = (await publicSnapshot(tabA)) as { seats: Record<string, { discards: string[]; count: string | null; tokens: string | null }>; header: string[] };
  assert.deepEqual(after, before, 'resumed tab reproduces the public table state exactly');

  // The seat is live again: one more move must advance the public log.
  const logLen = (await tabB.eval(`document.querySelectorAll('.log li').length`)) as number;
  await playUntil(
    [tabA, tabB],
    async () => (await tabB.eval(`document.querySelectorAll('.log li').length`)) > logLen,
    500,
  );

  // Ticket 31: tabB saw "Alice reconnected" (a room-activity line), but the
  // reconnect line must not permanently own the strip — once the resumed
  // seat plays again and the scene drains, the strip shows the newest game
  // entry, not the reconnect notice. (Scenes pause the strip on the beat, so
  // the check must wait for the queue to drain first.)
  await waitFor(tabB, `document.querySelectorAll('.scenes .scene').length === 0`, 20000, 'scenes drain after resume');
  const strip = (await tabB.eval(`document.querySelector('.log-strip-text')?.textContent ?? ''`)) as string;
  assert.ok(!strip.includes('reconnected'), `strip returned to the game after a move: ${strip}`);
  await assertNoErrors(tabA, tabB);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await checkBuildFreshness();
  const app = await createApp({ port: 0, staticRoot: STATIC_ROOT, graceMs: 60_000 });
  const base = `http://localhost:${app.port}`;
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), 'loveletter-chrome-'));
  let chrome: ReturnType<typeof launchChrome> | null = null;
  try {
    chrome = await launchChrome(debugPort, profile);
    console.log(`[ui-smoke] serving ${STATIC_ROOT} on :${app.port}`);

    console.log('[ui-smoke] narrow-phone layout (issue 10)…');
    await runNarrowViewport(base, debugPort);
    console.log('[ui-smoke] locale toggle (ticket 17)…');
    await runLocaleCheck(base, debugPort);
    console.log('[ui-smoke] render checks (Home → Lobby → Game, discards, chat)…');
    await runRenderChecks(base, debugPort);
    console.log('[ui-smoke] chat pill + modal dialog (ticket 20)…');
    await runChatPill(base, debugPort);
    console.log('[ui-smoke] log top bar + expandable strip (tickets 19, 21, 33)…');
    await runLogStrip(base, debugPort);
    console.log('[ui-smoke] fixed stage: zero-scroll tabletop + overlays + portrait lock (ticket 33)…');
    await runFixedStage(base, debugPort);
    console.log('[ui-smoke] own-seat dock: no self tile, dock is the seat, tap-the-seat (ticket 35)…');
    await runOwnSeatDock(base, debugPort);
    console.log('[ui-smoke] scene-based card animations (ticket 23)…');
    await runSceneAnimations(base, debugPort);
    console.log('[ui-smoke] the draw pops the new card (ticket 28)…');
    await runDrawPop(base, debugPort);
    console.log('[ui-smoke] the story owns the draw moment — held until the scene drains (ticket 38)…');
    await runDrawSync(base, debugPort);
    console.log('[ui-smoke] strip follows the scene, the round waits (ticket 24)…');
    await runSceneBlocking(base, debugPort);
    console.log('[ui-smoke] round/match-end overlay waits for the story (ticket 37)…');
    await runRoundEndWaits(base, debugPort);
    console.log('[ui-smoke] select-confirm regret for hand plays (ticket 25)…');
    await runSelectConfirm(base, debugPort);
    console.log('[ui-smoke] hand area / scoreboard count around King trades (ticket 30)…');
    await runKingTrade(base, debugPort);
    console.log('[ui-smoke] full 2-player match to 7 tokens + rematch…');
    await runFullMatch(base, debugPort);
    console.log('[ui-smoke] 3- and 4-player matches…');
    await runMultiPlayer(base, debugPort);
    console.log('[ui-smoke] mid-match reload / resume…');
    await runReloadResume(base, debugPort);

    console.log(
      'UI SMOKE OK — narrow-phone layout, render claims, full 2p match (all 8 cards) + rematch, '
      + '3p/4p token targets, scene blocking + strip-follows-scene (ticket 24), round/match-end '
      + 'overlay waits for the story (ticket 37), draw held until the story reaches it (ticket 38), '
      + 'select-confirm regret '
      + '(ticket 25), hand/count sync around King trades (ticket 30), draw pop (ticket 28), chat close '
      + 'button (ticket 29), reload/resume with chat restored, fixed stage + overlays + portrait lock '
      + '(ticket 33), own-seat dock (ticket 35), no error banners anywhere',
    );  } finally {
    if (chrome) {
      chrome.kill();
      // Chrome's renderer helpers can outlive the main process briefly; give
      // them a moment to release the profile before removing the directory.
      await sleep(400);
    }
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  console.error('UI SMOKE FAILED:', err);
  process.exitCode = 1;
}
