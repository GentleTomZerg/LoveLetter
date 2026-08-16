# 01 — Scaffold monorepo and tooling

**What to build:** a new npm-workspaces monorepo with three empty-but-compiling packages (`core`, `server`, `client`), shared TypeScript config, Vitest wired into `core`, dev scripts that run server and client together, and a first `git init` + baseline commit. Nothing plays yet — this is the foundation every other ticket lands on.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Root `package.json` with `workspaces: ["packages/*"]` and a `dev` script that runs server + client together
- [x] `packages/core`, `packages/server`, `packages/client` each with its own `package.json` and tsconfig (extending a shared root config)
- [x] Vitest configured and runnable in `core` (a placeholder test proves the harness works)
- [x] Client scaffold boots (Vite dev server serving a placeholder page); server scaffold boots (Node process listening on a port)
- [x] `git init` with a baseline commit; `AGENTS.md` and `docs/` (DESIGN.md, CONTEXT.md, ADR, agents config) committed
- [x] `npm install` from root resolves all three workspaces cleanly
