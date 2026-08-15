/**
 * Visual QA for the redesign (see .scratch/love-letter-visual-redesign):
 * saves screenshots (light + dark × Home / Lobby / Game) for human review,
 * and asserts the facts a reskin must not silently break — fonts actually
 * load, the real toggle flips `data-theme` and persists across reload, the
 * wax-seal hearts match the token counts, the `.tokens` text contract still
 * holds (♥ + n / target), the stage has no horizontal overflow, and the
 * computed surfaces come from the theme tokens.
 *
 * Requires Google Chrome and a built client:
 *   npm run build --workspace @love-letter/client
 * Run: npx tsx packages/server/scripts/screenshots.ts
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { clickButton, launchChrome, openTabs, setInput, setSelect, sleep, waitFor, type CdpSession } from './cdp.js';

const OUT = process.env.SHOTS ?? '/tmp/ll-shots';
const STATIC_ROOT = resolve(import.meta.dirname, '../../client/dist');

const shot = async (tab: CdpSession, name: string) => {
  await tab.screenshot(join(OUT, `${name}.png`));
  console.log(`  shot ${name}.png`);
};

/** Assert a JS expression that evaluates to true. */
const ok = async (tab: CdpSession, expr: string, label: string) => {
  assert.equal(await tab.eval(expr), true, label);
  console.log(`  ✓ ${label}`);
};

async function main(): Promise<void> {
  const app = await createApp({ port: 0, staticRoot: STATIC_ROOT, graceMs: 60_000 });
  const base = `http://localhost:${app.port}`;
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), 'loveletter-shots-'));
  await mkdir(OUT, { recursive: true });
  let chrome: Awaited<ReturnType<typeof launchChrome>> | null = null;
  try {
    chrome = await launchChrome(debugPort, profile);
    const [tabA, tabB] = await openTabs(debugPort, 2);
    for (const t of [tabA, tabB]) {
      await t.setViewport(1280, 800);
    }

    console.log('— Home, light —');
    // Pin the emulated system to light: the script asserts a fresh visitor's
    // default theme, which must not depend on the host OS's appearance.
    await tabA.setColorScheme('light');
    await tabA.navigate(base);
    await waitFor(tabA, `document.querySelector('.screen.home') !== null`, 10000, 'Home');
    await sleep(500); // let the webfonts settle
    assert.equal(await tabA.eval(`document.documentElement.dataset.theme`), 'light', 'system-default theme is light');
    await ok(tabA, `document.fonts.load('16px Fraunces').then((f) => f.length > 0)`, 'Fraunces is loaded and applied');
    await ok(tabA, `document.fonts.load('16px Karla').then((f) => f.length > 0)`, 'Karla is loaded and applied');
    await ok(
      tabA,
      `getComputedStyle(document.body).fontFamily.includes('Karla')`,
      'body renders in Karla',
    );
    await ok(
      tabA,
      `getComputedStyle(document.querySelector('.tagline')).fontFamily.includes('Fraunces')`,
      'the tagline renders in Fraunces',
    );
    await ok(
      tabA,
      `getComputedStyle(document.body).backgroundColor === 'rgb(241, 234, 220)'`,
      'body background is the parchment token (#f1eadc)',
    );
    await shot(tabA, 'home-light');

    console.log('— Home, dark via the real toggle —');
    await clickButton(tabA, '.settings-row', '☾');
    await waitFor(tabA, `document.documentElement.dataset.theme === 'dark'`, 5000, 'dark');
    await ok(
      tabA,
      `getComputedStyle(document.body).backgroundColor === 'rgb(23, 24, 32)'`,
      'body background is the night token (#171820)',
    );
    await shot(tabA, 'home-dark');

    console.log('— the choice persists across a reload —');
    await tabA.reload();
    await waitFor(tabA, `document.querySelector('.screen.home') !== null`, 10000, 'Home after reload');
    assert.equal(await tabA.eval(`document.documentElement.dataset.theme`), 'dark', 'manual dark choice survives reload');

    console.log('— Lobby, light —');
    await clickButton(tabA, '.settings-row', '☀'); // back to light for the room flow
    await waitFor(tabA, `document.documentElement.dataset.theme === 'light'`, 5000, 'light again');
    await setInput(tabA, '.home input[placeholder="e.g. Alice"]', 'Alice');
    await setSelect(tabA, '.home select', '2');
    await clickButton(tabA, '.home', 'Create room');
    await waitFor(tabA, `document.querySelector('.screen.lobby') !== null`, 10000, 'Lobby');
    await shot(tabA, 'lobby-light');

    console.log('— Game (2 players auto-start), light —');
    await tabB.navigate(base);
    await waitFor(tabB, `document.querySelector('.screen.home') !== null`, 10000, 'Home on B');
    await setInput(tabB, '.home input[placeholder="e.g. Alice"]', 'Bob');
    const code = (await tabA.eval(
      `/Room ([A-Z]{4})/.exec(document.querySelector('.screen.lobby h1').textContent)[1]`,
    )) as string;
    await clickButton(tabB, '.home', 'I have a code?'); // ticket 41: join-by-code is collapsed
    await setInput(tabB, '.code-input', code);
    await clickButton(tabB, '.home', 'Join room');
    await waitFor(tabA, `document.querySelector('.screen.game') !== null`, 10000, 'Game on A');
    await waitFor(tabB, `document.querySelector('.screen.game') !== null`, 10000, 'Game on B');
    await sleep(700); // let the deal/round scenes settle
    await shot(tabA, 'game-light');

    console.log('— Game, dark —');
    await clickButton(tabA, '.stage-top', '☾');
    await waitFor(tabA, `document.documentElement.dataset.theme === 'dark'`, 5000, 'dark game');
    await shot(tabA, 'game-dark');

    console.log('— the reskin contract on the live game (dark) —');
    await ok(
      tabA,
      `[...document.querySelectorAll('.seat .tokens')].every((t) => t.textContent.includes('♥'))`,
      'every .tokens element still carries ♥',
    );
    await ok(
      tabA,
      `[...document.querySelectorAll('.seat .tokens')].every((t) => /\\d+ \\/ \\d+/.test(t.textContent))`,
      'every .tokens element still carries "n / target"',
    );
    await ok(
      tabA,
      `(() => { const s = document.querySelector('.dock-seat'); const n = Number(s.querySelector('.hand-count')?.textContent); return s.querySelectorAll('.seal').length >= 4; })()`,
      'the dock renders wax-seal hearts',
    );
    await ok(
      tabA,
      `(() => { const filled = [...document.querySelectorAll('.dock-seat .seal-filled')].length; const txt = document.querySelector('.dock-seat .tokens').textContent; return filled === Number(/(\\d+) \\/ /.exec(txt)[1]); })()`,
      'filled seal count equals the numeric token count',
    );
    await ok(
      tabA,
      `document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.screen.game').scrollWidth <= window.innerWidth`,
      'no horizontal overflow on the fixed stage',
    );
    await ok(
      tabA,
      `getComputedStyle(document.querySelector('.dock-seat.me')).borderColor.includes('212') === false && getComputedStyle(document.querySelector('.dock-seat.me')).borderColor.length > 0`,
      'the dock seat carries a themed (non-default) border',
    );
    await ok(
      tabA,
      `getComputedStyle(document.querySelector('.stage-band')).backgroundImage.includes('radial-gradient')`,
      'the candle pool radial sits behind the table',
    );

    // A turn badge should be gold-filled somewhere (one seat is on turn).
    await ok(
      tabA,
      `[...document.querySelectorAll('.turn-badge')].length >= 1 && getComputedStyle(document.querySelector('.turn-badge')).backgroundColor === 'rgb(223, 183, 107)'`,
      'the turn badge renders in candlelight gold (#dfb76b) in dark',
    );

    console.log('— light-game contract spot checks —');
    await clickButton(tabA, '.stage-top', '☀');
    await waitFor(tabA, `document.documentElement.dataset.theme === 'light'`, 5000, 'light game');
    await ok(
      tabA,
      `getComputedStyle(document.querySelector('.turn-badge')).backgroundColor === 'rgb(169, 127, 29)'`,
      'the turn badge renders in antique gold (#a97f1d) in light',
    );
    await shot(tabA, 'game-light-turn');

    console.log('— 4-player phone geometry (390×844) —');
    const [c, d, e] = await openTabs(debugPort, 3);
    await tabA.setViewport(390, 844);
    await c.setViewport(390, 844);
    await d.setViewport(390, 844);
    await e.setViewport(390, 844);
    for (const t of [c, d, e]) await t.navigate(base);
    for (const t of [c, d, e]) {
      await waitFor(t, `document.querySelector('.screen.home') !== null`, 10000, 'Home on extra tab');
    }
    await setInput(c, '.home input[placeholder="e.g. Alice"]', 'Carol');
    await setSelect(c, '.home select', '4');
    await clickButton(c, '.home', 'Create room');
    await waitFor(c, `document.querySelector('.screen.lobby') !== null`, 10000, '4p Lobby');
    const code4 = (await c.eval(
      `/Room ([A-Z]{4})/.exec(document.querySelector('.screen.lobby h1').textContent)[1]`,
    )) as string;
    for (const [t, name] of [[d, 'Dave'], [e, 'Eve']] as const) {
      await setInput(t, '.home input[placeholder="e.g. Alice"]', name);
      await clickButton(t, '.home', 'I have a code?'); // ticket 41: join-by-code is collapsed
      await setInput(t, '.code-input', code4);
      await clickButton(t, '.home', 'Join room');
    }
    // tabA (Alice) joins last so the game starts while it holds the phone viewport.
    await tabA.eval(`sessionStorage.clear()`); // drop the 2p seat identity
    await tabA.reload(); // leave the 2p game (a fresh visitor socket)
    await waitFor(tabA, `document.querySelector('.screen.home') !== null`, 10000, 'Home on A again');
    await setInput(tabA, '.home input[placeholder="e.g. Alice"]', 'Alice');
    await clickButton(tabA, '.home', 'I have a code?'); // ticket 41: join-by-code is collapsed
    await setInput(tabA, '.code-input', code4);
    await clickButton(tabA, '.home', 'Join room');
    for (const t of [tabA, c, d, e]) {
      await waitFor(t, `document.querySelector('.screen.game') !== null`, 10000, '4p Game');
    }
    await sleep(700);
    await ok(tabA, `document.documentElement.scrollWidth <= window.innerWidth`, 'no horizontal overflow (phone, 4p)');
    await ok(tabA, `(() => { const d = document.querySelector('.dock-seat').getBoundingClientRect(); return d.left >= 0 && d.right <= window.innerWidth && d.top >= 0 && d.bottom <= window.innerHeight; })()`, 'the dock fits the phone viewport');
    await ok(tabA, `[...document.querySelectorAll('.hand button.card')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; })`, 'the hand cards fit the phone width');
    await ok(tabA, `document.querySelectorAll('.tabletop .seat').length === 3`, 'three opponent seats in the 4p ring');
    await ok(tabA, `[...document.querySelectorAll('.seat .seal')].length >= 8`, 'every seat shows wax-seal hearts on the phone');
    await shot(tabA, 'game-phone-4p');
    await tabA.setViewport(1280, 800);

    console.log('\nOK — screenshots in ' + OUT);
  } finally {
    if (chrome) chrome.kill();
    await rm(profile, { recursive: true, force: true });
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
