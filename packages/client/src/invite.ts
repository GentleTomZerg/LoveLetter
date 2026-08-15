/**
 * @love-letter/client — the invite-link contract (ticket 41): a room is
 * shared as `${origin}/?room=CODE`. Building and parsing the handle live in
 * one place so the format cannot drift apart — the Lobby builds it, the
 * Home consumes it (and ticket 40's directory rows may too).
 */

/** The shareable invitation URL for a room code. */
export function inviteUrl(roomCode: string): string {
  return `${window.location.origin}/?room=${roomCode}`;
}

/** The room code carried by the current URL's `?room=` param, uppercased.
 *  Validated only to a plausible 4-char shape — join itself decides whether
 *  the code is live (a stale link lands on the existing error banner). */
export function inviteCodeFromUrl(): string {
  try {
    const code = new URLSearchParams(window.location.search).get('room') ?? '';
    return /^[A-Za-z0-9]{4}$/.test(code) ? code.toUpperCase() : '';
  } catch {
    return '';
  }
}
