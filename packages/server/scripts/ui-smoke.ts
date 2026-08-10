/**
 * UI smoke + playtest (tickets 06 + 07): drives the real client in headless
 * Chrome over CDP. Scenarios:
 *
 *  - render     Home → Lobby → Game, scoreboard, discard piles, chat across
 *               tabs (ticket 06 render claims; screenshots saved for a look).
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
 *  after a pick, so the card row must win whenever it exists. */
async function playOneMove(tab: CdpSession): Promise<boolean> {
  if (await click(tab, '.round-over button')) return true; // start next round
  if (await click(tab, 'button.card.playable')) return true; // play from the hand
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

  await setInput(tabA, '.chat-input input', 'hello from Alice');
  await click(tabA, '.chat-input button');
  await waitFor(
    tabB,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('hello from Alice'))`,
    10000,
    'chat relayed to B',
  );
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.chat-log li.mine')].some((li) => li.textContent.includes('You'))`,
    10000,
    'own message marked on A',
  );

  await rm(SHOT_DIR, { recursive: true, force: true });
  await mkdir(SHOT_DIR, { recursive: true });
  await tabA.screenshot(join(SHOT_DIR, 'tab-a.png'));
  await tabB.screenshot(join(SHOT_DIR, 'tab-b.png'));
  console.log(`  screenshots: ${SHOT_DIR}`);
}

// ---------------------------------------------------------------------------
// Scenario 2 — full 2-player match to the 7-token target + rematch
// ---------------------------------------------------------------------------

async function runFullMatch(base: string, debugPort: number): Promise<void> {
  const [tabA, tabB] = await openTabs(debugPort, 2);
  await openRoom(base, [tabA, tabB], 2, ['Alice', 'Bob']);

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

  // A message sent before the drop must come back on resume (chatLog).
  await setInput(tabB, '.chat-input input', 'see you after reload');
  await click(tabB, '.chat-input button');
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('see you after reload'))`,
    10000,
    'pre-reload chat visible on A',
  );

  // Some real mid-round state: at least one discard on the table.
  await playUntil([tabA, tabB], async () => (await nonEmptyPiles(tabA)) >= 1, 600);
  const before = (await publicSnapshot(tabB)) as { discards: string[]; tokens: string[]; header: string[] };

  await tabA.reload();
  await waitFor(tabA, `document.querySelector('.screen.game') !== null`, 15000, 'game screen after reload');
  await waitFor(
    tabA,
    `[...document.querySelectorAll('.chat-log li')].some((li) => li.textContent.includes('see you after reload'))`,
    10000,
    'chat history restored after reload',
  );
  const after = (await publicSnapshot(tabA)) as { discards: string[]; tokens: string[]; header: string[] };
  assert.deepEqual(after, before, 'resumed tab reproduces the public table state exactly');

  // The seat is live again: one more move must advance the public log.
  const logLen = (await tabB.eval(`document.querySelectorAll('.log li').length`)) as number;
  await playUntil(
    [tabA, tabB],
    async () => (await tabB.eval(`document.querySelectorAll('.log li').length`)) > logLen,
    500,
  );
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
    console.log('[ui-smoke] full 2-player match to 7 tokens + rematch…');
    await runFullMatch(base, debugPort);
    console.log('[ui-smoke] 3- and 4-player matches…');
    await runMultiPlayer(base, debugPort);
    console.log('[ui-smoke] mid-match reload / resume…');
    await runReloadResume(base, debugPort);

    console.log(
      'UI SMOKE OK — narrow-phone layout, render claims, full 2p match (all 8 cards) + rematch, '
      + '3p/4p token targets, reload/resume with chat restored, no error banners anywhere',
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
