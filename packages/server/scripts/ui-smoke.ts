/**
 * UI smoke + playtest (tickets 06 + 07): drives the real client in headless
 * Chrome over CDP. Scenarios:
 *
 *  - render     Home → Lobby → Game, scoreboard, discard piles, chat across
 *               tabs (ticket 06 render claims; screenshots saved for a look).
 *  - chatPill   chat is a floating pill + modal dialog (ticket 20): newest-
 *               message preview, unread badge that clears on open, close on
 *               send/Esc/outside click, near-fullscreen dialog on phones.
 *  - sceneAnimations  scene-based card animations (ticket 23): a scene plays
 *               through (the card appears, the verdict caption appears, the
 *               queue drains); prefers-reduced-motion disables all scenes.
 *  - sceneBlocking  ticket 24: the round waits — the hand and choice buttons
 *               are disabled while a scene animates and re-enabled after the
 *               drain; the strip follows the animating beat (the win line
 *               appears only when the win banner plays); under reduced motion
 *               nothing enqueues, so the round never blocks.
 *  - selectConfirm  ticket 25: hand plays are select-confirm — clicking a
 *               card selects it (highlight + a Play action bar naming it),
 *               clicking the other card switches the selection, and nothing
 *               is sent until the confirm; the log gains exactly one play
 *               line and the bar clears.
 *  - kingTrade   ticket 30: the hand area shows exactly as many cards as the
 *               scoreboard counts at every turn-holder moment, around King
 *               trades (the fixed desync left a stale card after a trade
 *               against an empty hand — clicking it bounced an error).
 *  - logStrip   the log is a top bar fixed at the top of the viewport (issue
 *               21) collapsing to a latest-event strip and expanding in place
 *               (ticket 19): the strip shows the newest entry, tracks live
 *               play, keeps its thumbnail rank-keyed; the expanded history is
 *               near-fullscreen on phones.
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
 *  options are tried before its target row: the target row stays visible
 *  after a pick, so the card row must win whenever it exists.
 *
 *  Ticket 25: the hand is select-confirm — clicking a card only selects it,
 *  so the confirm bar click must follow in the same step (the play leaves
 *  only after the confirm; a selected-but-unconfirmed card would be
 *  deselected by the next hand click). */
async function playOneMove(tab: CdpSession): Promise<boolean> {
  if (await click(tab, '.round-over button')) return true; // start next round
  if (await click(tab, 'button.card.playable')) {
    if (await click(tab, '.play-confirm')) return true; // select + confirm
    await click(tab, 'button.card.playable.selected'); // no bar — deselect and retry
    return false;
  }
  if (await click(tab, '.choice-row.cards button')) return true; // Guard: name a card
  if (await click(tab, '.choice-row button')) return true; // target pickers
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
  for (let i = 0; i < tabs.length; i++) await tabs[i]!.navigate(base);
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
    `[...document.querySelectorAll('.scoreboard .seat .pile')].filter((p) => p.querySelectorAll('img').length > 0).length`,
  );

const logText = (tab: CdpSession) =>
  tab.eval(`[...document.querySelectorAll('.log li')].map((li) => li.textContent).join('\\n')`);

/** The public table state a resumed tab must reproduce exactly. */
const publicSnapshot = (tab: CdpSession) =>
  tab.eval(`({
    discards: [...document.querySelectorAll('.scoreboard .seat .pile img')].map((i) => i.getAttribute('src')),
    hands: [...document.querySelectorAll('.scoreboard .seat .hand-count')].map((t) => t.textContent),
    tokens: [...document.querySelectorAll('.scoreboard .tokens')].map((t) => t.textContent),
    header: [...document.querySelectorAll('.game-header span')].map((s) => s.textContent),
  })`);

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

  assert.equal(await tabA.eval(`document.querySelectorAll('.scoreboard .seat').length`), 2, 'two scoreboard seats');
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scoreboard .seat')[0].textContent.includes('turn')`),
    true,
    'turn badge on the first seat',
  );

  // Issue 14: the active player's row is highlighted with a pill — exactly
  // one seat is marked at round start — and the row internals never reuse
  // the bare `.hand` class (it would inherit the table-hand min-height).
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scoreboard .seat.turn').length`),
    1,
    'exactly one seat is the current turn',
  );
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scoreboard .seat .hand').length`),
    0,
    'no bare .hand class inside seats',
  );

  // The abilities reference (issue 12) lists all eight cards once opened.
  assert.equal(await tabA.eval(`document.querySelector('.abilities') !== null`), true, 'abilities panel present');
  assert.equal(await tabA.eval(`document.querySelector('.abilities').open`), false, 'abilities panel collapsed');
  await click(tabA, '.abilities summary');
  await waitFor(tabA, `document.querySelector('.abilities').open === true`, 5000, 'abilities panel opens');
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.abilities-list li').length`),
    8,
    'all eight cards listed',
  );

  await playUntil([tabA, tabB], async () => (await nonEmptyPiles(tabA)) >= 2, 600);
  const pileImgs = (await tabA.eval(
    `[...document.querySelectorAll('.scoreboard .seat .pile img')].map((i) => i.getAttribute('src'))`,
  )) as string[];
  assert.ok(pileImgs.length >= 2, 'discard piles show card images');
  assert.ok(pileImgs.every((src) => /^\/cards\/[1-8]\.png$/.test(src)), `discard images are rank-keyed: ${pileImgs}`);

  // Issue 13: every seat shows a public hand count; once anyone has played,
  // at least one seat holds cards represented by face-down backs.
  const handCounts = (await tabA.eval(
    `[...document.querySelectorAll('.scoreboard .seat .hand-count')].map((t) => t.textContent)`,
  )) as string[];
  assert.equal(handCounts.length, 2, 'both seats show a hand count');
  assert.ok(
    handCounts.every((c) => /^[0-2]$/.test(c ?? '')),
    `hand counts are numbers 0-2: ${handCounts}`,
  );
  const totalHeld = handCounts.reduce((sum, c) => sum + Number(c), 0);
  assert.equal(
    await tabA.eval(`document.querySelectorAll('.scoreboard .seat .hand-back').length`),
    totalHeld,
    'face-down backs equal the total cards held',
  );

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
// Scenario 1b — tickets 19 + 21: the log is a top bar fixed at the top of the
// viewport (visible without scrolling), collapsing to the latest-event strip
// and expanding to the full newest-first history in a panel beneath it —
// near-fullscreen on phones. The strip shows the newest entry (with a
// rank-keyed mini thumbnail when it carries a rank) and tracks live play.
// ---------------------------------------------------------------------------

async function runLogStrip(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

  // Issue 21: the bar is pinned to the top of the viewport, and the game
  // content sits below it — the log is visible without scrolling.
  const pinned = (await tabA.eval(`(() => {
    const panel = document.querySelector('.log-panel');
    const header = document.querySelector('.game-header');
    if (panel === null || header === null) return null;
    const pr = panel.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    return { top: pr.top, headerTop: hr.top, barH: pr.height };
  })()`)) as { top: number; headerTop: number; barH: number } | null;
  assert.ok(pinned !== null, 'log panel and game header present');
  assert.equal(pinned!.top, 0, 'log bar is fixed at the top of the viewport');
  assert.ok(pinned!.headerTop >= pinned!.barH, 'game content clears the log bar');

  // Some real play so the log has entries (a play line carries a rank).
  await playUntil([tabA, tabB], async () => (await nonEmptyPiles(tabA)) >= 2, 600);

  // Ticket 24: while a scene animates the strip follows the beat, so the
  // newest-entry snapshot must wait for the queue to drain first.
  await waitFor(tabA, `document.querySelectorAll('.scenes .scene').length === 0`, 20000, 'scenes idle before the strip snapshot');

  // One atomic snapshot: the strip and the top of the expanded list must show
  // the same entry, and any thumbnail must stay rank-keyed (never a card name).
  const snap = (await tabA.eval(`(() => {
    const strip = document.querySelector('.log-strip-text')?.textContent ?? null;
    const first = document.querySelector('.log li')?.textContent ?? null;
    const thumb = document.querySelector('.log-strip img.log-thumb')?.getAttribute('src') ?? null;
    const open = document.querySelector('.log-panel')?.open ?? null;
    return { strip, first, thumb, open };
  })()`)) as { strip: string | null; first: string | null; thumb: string | null; open: boolean | null };
  assert.ok(snap.strip !== null && snap.strip.length > 0, 'strip shows a latest event');
  assert.equal(snap.strip, snap.first, 'strip shows the newest entry — the top of the expanded list');
  assert.equal(snap.open, false, 'log panel starts collapsed');
  assert.ok(
    snap.thumb === null || /^\/cards\/[1-8]\.png$/.test(snap.thumb),
    `strip thumbnail is rank-keyed: ${snap.thumb}`,
  );

  // Click expands in place (`<details>`, the Abilities pattern): the full
  // list becomes visible with its scroll height; clicking again collapses.
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-panel').open === true`, 5000, 'log panel opens');
  const visible = (await tabA.eval(`(() => {
    const el = document.querySelector('.log-panel .log');
    return el !== null && el.getBoundingClientRect().height > 0;
  })()`)) as boolean;
  assert.equal(visible, true, 'expanded log is visible in place');
  assert.ok(
    (await tabA.eval(`document.querySelectorAll('.log li').length`)) > 0,
    'expanded log lists the history',
  );
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-panel').open === false`, 5000, 'log panel collapses');

  // Issue 21, phones: the expanded history is near-fullscreen — the bar stays
  // on top as the toggle and the list fills the rest of the viewport.
  await tabA.setViewport(375, 812);
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-panel').open === true`, 5000, 'log panel opens at phone width');
  const fills = (await tabA.eval(`(() => {
    const pr = document.querySelector('.log-panel').getBoundingClientRect();
    const log = document.querySelector('.log-panel .log');
    return { top: pr.top, bottom: pr.bottom, vh: window.innerHeight, logH: log?.getBoundingClientRect().height ?? 0 };
  })()`)) as { top: number; bottom: number; vh: number; logH: number };
  assert.equal(fills.top, 0, 'bar still at the top on phones');
  assert.ok(fills.bottom >= fills.vh - 1, 'expanded panel reaches the viewport bottom (near-fullscreen)');
  assert.ok(fills.logH > 0, 'expanded list visible at phone width');
  await click(tabA, '.log-strip');
  await waitFor(tabA, `document.querySelector('.log-panel').open === false`, 5000, 'log panel collapses at phone width');

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
  await assertNoErrors(tabA, tabB);
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
  //    ends the match and plays the final scene + win banner. Poll the win
  //    transition — while the final scene (a non-banner head) plays, the
  //    strip must NOT show the win line; when the win banner plays, it must.
  await tabA.setReducedMotion(true);
  await tabB.setReducedMotion(true);
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(
      `[...document.querySelectorAll('.scoreboard .tokens')].some((t) => t.textContent.includes('6 / 7'))`,
    ),
    5000,
  );
  await tabA.setReducedMotion(false);
  await tabB.setReducedMotion(false);
  // The media emulation propagates async — settle so the final round's first
  // move already enqueues scenes (the win banner must exist to be caught).
  await sleep(400);
  await playUntil(
    [tabA, tabB],
    () => tabA.eval(`document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null`),
    5000,
  );
  let sawPreBanner = false;
  let sawBanner = false;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && (!sawPreBanner || !sawBanner)) {
    const banner = (await tabA.eval(`document.querySelector('.scene-banner') !== null`)) as boolean;
    const winRe = /won the (round|match)/;
    const strip = (await tabA.eval(`document.querySelector('.log-strip-text')?.textContent ?? ''`)) as string;
    const hasWin = winRe.test(strip);
    if (banner) {
      assert.equal(hasWin, true, 'the win line shows while the win banner plays');
      sawBanner = true;
    } else {
      const sceneActive = (await tabA.eval(`document.querySelectorAll('.scenes .scene').length > 0`)) as boolean;
      if (sceneActive) {
        assert.equal(hasWin, false, 'the win line never races ahead of the final scene');
        sawPreBanner = true;
      }
    }
    await sleep(50);
  }
  assert.ok(sawBanner, 'the win banner was caught');
  assert.ok(sawPreBanner, 'the pre-banner final scene was caught — the strip does not race ahead');
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
  for (let step = 0; step < 2000; step++) {
    if (await tabA.eval(`document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null`)) break;
    assert.equal(
      await tabA.eval(`document.querySelectorAll('.scenes .scene').length`),
      0,
      'no scenes under prefers-reduced-motion',
    );
    let acted = false;
    for (const t of [tabA, tabB]) {
      if (await playOneMove(t)) {
        acted = true;
        break;
      }
    }
    if (!acted) await sleep(80);
  }
  assert.ok(
    await tabA.eval(`document.querySelector('.round-over') !== null || document.querySelector('.match-over') !== null`),
    'a round ends under reduced motion — moves were never blocked',
  );
  assert.notEqual((await logText(tabA)) as string, logBefore, 'moves happened under reduced motion');
  await assertNoErrors(tabA, tabB);
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
  const confirmLabel = () =>
    tabA.eval(`document.querySelector('.play-confirm')?.textContent?.trim() ?? null`) as Promise<string | null>;
  const playLines = () => tabA.eval(`document.querySelectorAll('.log li.log-play').length`) as Promise<number>;
  const nameAt = (i: number) =>
    tabA.eval(
      `document.querySelectorAll('.hand button.card')[${i}]?.querySelector('.name-caption')?.textContent ?? null`,
    ) as Promise<string | null>;
  const card0 = await nameAt(0);
  const card1 = await nameAt(1);
  assert.ok(card0 !== null && card1 !== null, 'both hand cards have names');

  // 1. Select: no confirm bar before any selection; clicking a card raises
  //    the bar naming it — and nothing is sent (no new play line).
  assert.equal(
    await tabA.eval(`document.querySelector('.play-confirm') === null`),
    true,
    'no confirm bar before a selection',
  );
  await click(tabA, '.hand button.card');
  await waitFor(tabA, `document.querySelector('.play-confirm') !== null`, 5000, 'confirm bar appears on selection');
  assert.equal(await selectedIndex(), 0, 'the first card is selected');
  assert.equal(await confirmLabel(), `Play ${card0}`, 'confirm bar names the selected card');
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
  assert.equal(await confirmLabel(), `Play ${card1}`, 'confirm bar re-labels the switched card');
  assert.equal(await playLines(), playsBefore, 'switching never sends a play');

  // 3. Confirm: exactly one play line lands, the bar clears, the played card
  //    leaves the hand (a deck-empty round can reveal the last card in the
  //    same burst — only the strict drop is asserted).
  const handBefore = (await tabA.eval(`document.querySelectorAll('.hand button.card').length`)) as number;
  await click(tabA, '.play-confirm');
  await waitFor(
    tabA,
    `document.querySelectorAll('.log li.log-play').length === ${playsBefore + 1}`,
    10000,
    'exactly one play line after confirm',
  );
  assert.equal(await confirmLabel(), null, 'confirm bar clears after the play');
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
      `[...document.querySelectorAll('.scoreboard .tokens')].some((t) => t.textContent.includes('7 / 7'))`,
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
        `[...document.querySelectorAll('.game-header span')].some((s) => s.textContent === 'Round 1')`,
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
    `[...document.querySelectorAll('.game-header span')].some((s) => s.textContent === 'Round 1')`,
    10000,
    'round 1 after rematch',
  );
  const reset = (await tabA.eval(
    `[...document.querySelectorAll('.scoreboard .tokens')].every((t) => t.textContent.includes('0 / 7'))`,
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
      await tabs[0]!.eval(`document.querySelectorAll('.scoreboard .seat').length`),
      capacity,
      `${capacity} seats filled`,
    );
    await playUntil(tabs, () => tabs[0]!.eval(`document.querySelector('.match-over') !== null`));
    const reached = (await tabs[0]!.eval(
      `[...document.querySelectorAll('.scoreboard .tokens')].some((t) => t.textContent.includes('${target} / ${target}'))`,
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
  const before = (await publicSnapshot(tabB)) as { discards: string[]; tokens: string[]; header: string[] };

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
  const after = (await publicSnapshot(tabA)) as { discards: string[]; tokens: string[]; header: string[] };
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
    console.log('[ui-smoke] log top bar + expandable strip (tickets 19, 21)…');
    await runLogStrip(base, debugPort);
    console.log('[ui-smoke] scene-based card animations (ticket 23)…');
    await runSceneAnimations(base, debugPort);
    console.log('[ui-smoke] strip follows the scene, the round waits (ticket 24)…');
    await runSceneBlocking(base, debugPort);
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
      + '3p/4p token targets, scene blocking + strip-follows-scene (ticket 24), select-confirm regret '
      + '(ticket 25), hand/count sync around King trades (ticket 30), reload/resume with chat restored, '
      + 'no error banners anywhere',
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
