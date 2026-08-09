/**
 * UI smoke test (ticket 06): drives the real client in headless Chrome over
 * CDP — two tabs create/join a room, play cards until discard piles exist,
 * and chat across tabs — then asserts the ticket's render claims and saves
 * screenshots for a human look.
 *
 * This complements `smoke.ts` (the server/engine spine) by exercising the
 * React layer: Home → Lobby → Game, click-to-play, choice prompts, discards,
 * and the chat sidebar.
 *
 * Requires Google Chrome (override the path with CHROME_PATH). It serves the
 * built client, so run `npm run build --workspace @love-letter/client` first.
 *
 * Run: npm run ui-smoke --workspace @love-letter/server
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = join(tmpdir(), 'loveletter-ui-smoke');
const STATIC_ROOT = resolve(import.meta.dirname, '../../client/dist');
const SRC_ROOT = resolve(import.meta.dirname, '../../client/src');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
// Minimal CDP client over the browser-level endpoint
// ---------------------------------------------------------------------------

interface CdpSession {
  eval(expression: string): Promise<unknown>;
  navigate(url: string): Promise<void>;
  screenshot(path: string): Promise<void>;
}

/** Connect to the browser endpoint and attach two fresh page tabs. */
async function openTabs(debugPort: number): Promise<CdpSession[]> {
  // Poll until the debugging endpoint answers.
  let version: { webSocketDebuggerUrl: string } | null = null;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      version = (await res.json()) as { webSocketDebuggerUrl: string };
      break;
    } catch {
      await sleep(100);
    }
  }
  if (version === null) throw new Error('Chrome debugging endpoint never came up');

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolveOpen, reject) => {
    ws.onopen = () => resolveOpen();
    ws.onerror = () => reject(new Error('failed to open the CDP socket'));
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  const sessions: CdpSession[] = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as { id?: number; error?: { message: string }; result?: unknown };
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };

  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<unknown>((resolveCmd, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveCmd, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const makeSession = (sessionId: string): CdpSession => ({
    eval: async (expression: string) => {
      const r = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)) as {
        exceptionDetails?: unknown;
        result: { type: string; value?: unknown };
      };
      if (r.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
      return r.result.value;
    },
    navigate: async (url: string) => {
      await send('Page.navigate', { url }, sessionId);
    },
    screenshot: async (path: string) => {
      const r = (await send('Page.captureScreenshot', { format: 'png' }, sessionId)) as { data: string };
      await writeFile(path, Buffer.from(r.data, 'base64'));
    },
  });

  for (let i = 0; i < 2; i++) {
    const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    const session = makeSession(sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    sessions.push(session);
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Page-driving helpers (plain DOM, React 19)
// ---------------------------------------------------------------------------

async function waitFor(tab: CdpSession, expression: string, timeoutMs = 15000, label = expression): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tab.eval(expression)) return;
    await sleep(120);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

/** Set a React-controlled input (native setter + input event). */
async function setInput(tab: CdpSession, selector: string, value: string): Promise<void> {
  const set = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
  assert.equal(await tab.eval(set), true, `input not found: ${selector}`);
}

async function click(tab: CdpSession, selector: string): Promise<boolean> {
  return (await tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`)) as boolean;
}

/** Click the button inside `selector` whose text is exactly `text`. */
async function clickButton(tab: CdpSession, selector: string, text: string): Promise<void> {
  const ok = (await tab.eval(`(() => {
    const btn = [...document.querySelectorAll(${JSON.stringify(selector)} + ' button')]
      .find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`)) as boolean;
  assert.equal(ok, true, `button not found: ${text}`);
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

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await checkBuildFreshness();
  const app = await createApp({ port: 0, staticRoot: STATIC_ROOT, graceMs: 60_000 });
  const base = `http://localhost:${app.port}`;

  console.log(`[ui-smoke] serving ${STATIC_ROOT} on :${app.port}`);

  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), 'loveletter-chrome-'));
  let chrome: ChildProcess | null = null;
  try {
    chrome = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        `--remote-debugging-port=${debugPort}`,
        '--remote-allow-origins=*',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );

    const [tabA, tabB] = await openTabs(debugPort);
    await tabA.navigate(base);
    await tabB.navigate(base);

    // --- Home → Lobby: Alice creates, Bob joins by code ---------------------
    await waitFor(tabA, `document.querySelector('.screen.home') !== null`, 10000, 'Home on A');
    await setInput(tabA, '.home input[placeholder="e.g. Alice"]', 'Alice');
    await clickButton(tabA, '.home', 'Create room');
    await waitFor(tabA, `document.querySelector('.screen.lobby') !== null`, 10000, 'Lobby on A');
    const roomCode = (await tabA.eval(`document.querySelector('.screen.lobby h1').textContent`)) as string;
    const code = /Room ([A-Z]{4})/.exec(roomCode)![1]!;
    assert.ok(code.length === 4, `room code from Lobby: ${code}`);

    await waitFor(tabB, `document.querySelector('.screen.home') !== null`, 10000, 'Home on B');
    await setInput(tabB, '.home input[placeholder="e.g. Alice"]', 'Bob');
    await setInput(tabB, '.code-input', code);
    await clickButton(tabB, '.home', 'Join room');
    await waitFor(tabB, `document.querySelector('.screen.game') !== null`, 10000, 'Game on B (auto-start)');
    await waitFor(tabA, `document.querySelector('.screen.game') !== null`, 10000, 'Game on A (auto-start)');

    // --- the table state is fully visible ------------------------------------
    assert.equal(await tabA.eval(`document.querySelectorAll('.scoreboard .seat').length`), 2, 'two scoreboard seats');
    assert.equal(await tabA.eval(`document.querySelectorAll('.scoreboard .seat')[0].textContent.includes('turn')`), true, 'turn badge on the first seat');

    // --- play until both players have face-up discards ----------------------
    let steps = 0;
    while (steps++ < 600) {
      const acted = (await playOneMove(tabA)) || (await playOneMove(tabB));
      if (!acted) await sleep(150);
      const piles = (await tabA.eval(
        `[...document.querySelectorAll('.discard-row .pile')].filter((p) => p.querySelectorAll('img').length > 0).length`,
      )) as number;
      if (piles >= 2) break;
    }
    assert.ok(steps < 600, 'game reached two non-empty discard piles');
    const pileImgs = (await tabA.eval(
      `[...document.querySelectorAll('.discard-row .pile img')].map((i) => i.getAttribute('src'))`,
    )) as string[];
    assert.ok(pileImgs.length >= 2, 'discard piles show card images');
    assert.ok(pileImgs.every((src) => /^\/cards\/[1-8]\.png$/.test(src)), `discard images are rank-keyed: ${pileImgs}`);

    // --- chat across tabs ----------------------------------------------------
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

    // --- screenshots for a human look ---------------------------------------
    await rm(SHOT_DIR, { recursive: true, force: true });
    await mkdir(SHOT_DIR, { recursive: true });
    await tabA.screenshot(join(SHOT_DIR, 'tab-a.png'));
    await tabB.screenshot(join(SHOT_DIR, 'tab-b.png'));

    console.log(`UI SMOKE OK — screenshots in ${SHOT_DIR}`);
    console.log(`  discards rendered: ${pileImgs.join(', ')}`);
    console.log(`  chat relayed both ways, own messages marked`);
  } finally {
    if (chrome) chrome.kill();
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
