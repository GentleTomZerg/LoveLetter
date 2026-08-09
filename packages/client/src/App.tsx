/**
 * @love-letter/client — App root (placeholder for ticket 01).
 * Home → Lobby → Game arrives in tickets 02 and 06.
 */

import { greeting } from '@love-letter/core';

export function App() {
  return (
    <main>
      <h1>Love Letter Online</h1>
      <p>Scaffold placeholder — the game is coming.</p>
      <p>{greeting()}</p>
    </main>
  );
}
