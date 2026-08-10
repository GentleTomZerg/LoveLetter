/**
 * Minimal headless-Chrome CDP plumbing shared by the UI smoke scripts.
 *
 * Opens a browser over the DevTools endpoint, attaches fresh page tabs, and
 * drives them with plain-DOM helpers (React 19 listens to native input
 * events, so setting `.value` through the prototype setter + dispatching
 * `input` updates controlled components).
 *
 * Requires Google Chrome; the path can be overridden with CHROME_PATH. Scripts
 * must serve the app themselves and pass its origin to `navigate`.
 */

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';

export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CdpSession {
  eval(expression: string): Promise<unknown>;
  navigate(url: string): Promise<void>;
  reload(): Promise<void>;
  screenshot(path: string): Promise<void>;
  /** Emulate a device viewport (CSS px) for layout checks. */
  setViewport(width: number, height: number): Promise<void>;
}

/** Launch Chrome headless with remote debugging; resolves once it answers. */
export async function launchChrome(debugPort: number, profile: string): Promise<ChildProcess> {
  const chrome = spawn(
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

  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return chrome;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint never came up');
}

/** Attach `count` fresh page tabs over the browser-level CDP socket. */
export async function openTabs(debugPort: number, count: number): Promise<CdpSession[]> {
  const version = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()) as {
    webSocketDebuggerUrl: string;
    'User-Agent': string;
  };

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('failed to open the CDP socket'));
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

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
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
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
    reload: async () => {
      await send('Page.reload', { ignoreCache: true }, sessionId);
    },
    setViewport: async (width: number, height: number) => {
      await send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 2, mobile: true },
        sessionId,
      );
    },
    screenshot: async (path: string) => {
      const r = (await send('Page.captureScreenshot', { format: 'png' }, sessionId)) as { data: string };
      await writeFile(path, Buffer.from(r.data, 'base64'));
    },
  });

  const sessions: CdpSession[] = [];
  for (let i = 0; i < count; i++) {
    const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    const session = makeSession(sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    // Deterministic UI language: the smoke asserts English UI text, but the
    // app auto-detects the browser locale (ADR-0004) and headless Chrome
    // inherits the host OS's — override it before the page ever navigates.
    // (`--lang` is ignored by this Chrome; the CDP override is the lever.)
    await send(
      'Emulation.setUserAgentOverride',
      { userAgent: version['User-Agent'], acceptLanguage: 'en-US,en;q=0.9' },
      sessionId,
    );
    sessions.push(session);
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Plain-DOM driving helpers
// ---------------------------------------------------------------------------

/** Poll `expression` until it is truthy (up to `timeoutMs`). */
export async function waitFor(
  tab: CdpSession,
  expression: string,
  timeoutMs = 15000,
  label = expression,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tab.eval(expression)) return;
    await sleep(120);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

/** Set a React-controlled input (native setter + input event). */
export async function setInput(tab: CdpSession, selector: string, value: string): Promise<void> {
  const ok = (await tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)) as boolean;
  assert.equal(ok, true, `input not found: ${selector}`);
}

/** Set a React-controlled <select> (native value + change event). */
export async function setSelect(tab: CdpSession, selector: string, value: string): Promise<void> {
  const ok = (await tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)) as boolean;
  assert.equal(ok, true, `select not found: ${selector}`);
}

/** Click the first element matching `selector`; returns whether one existed. */
export async function click(tab: CdpSession, selector: string): Promise<boolean> {
  return (await tab.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`)) as boolean;
}

/** Click the button inside `selector` whose text is exactly `text`. */
export async function clickButton(tab: CdpSession, selector: string, text: string): Promise<void> {
  const ok = (await tab.eval(`(() => {
    const btn = [...document.querySelectorAll(${JSON.stringify(selector)} + ' button')]
      .find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`)) as boolean;
  assert.equal(ok, true, `button not found: ${text}`);
}
