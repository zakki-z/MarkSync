# Frontend performance baseline

- Date: 2026-11-24
- Commit: `a176ffe` (branch `perf/ui-performance`, identical to `main`)
- Stack measured: Next.js 16.4.2 (App Router, Turbopack), React 19.3, Bun 1.3.14

## How it was measured

- **Bundle size:** `bun run build`, then every JS file listed for each route in
  `.next/diagnostics/route-bundle-stats.json` (the route's first-load chunks), sized raw and with
  `gzip` (default level). CSS is excluded; there is one 46 kB (10 kB gzip) stylesheet shared by all
  routes.
- **Chunk contents:** `next analyze --output` (the Next.js Turbopack bundle analyzer, used as a
  dev-only tool, output not committed).
- **Lighthouse 13.6.0:** mobile preset with the default simulated throttling, performance category
  only, three runs per route, median reported. It ran against `next start` with a small mock
  backend (auth, workspaces, documents, membership; 40 ms added latency per call; 12 documents;
  one 12 kB Markdown document). The mock and the runner scripts are not part of the repo.
  The collaboration WebSocket is not mocked, so the editor stays on "Connecting…" during the run.

## Initial JavaScript per route

| Route                        | Raw (bytes) | Gzip (bytes) | Chunks |
| ---------------------------- | ----------: | -----------: | -----: |
| `/auth`                      |     461,023 |      137,260 |      7 |
| `/documents`                 |     459,162 |      136,544 |      7 |
| `/invitations`               |     473,295 |      141,816 |      7 |
| `/w/[workspaceId]`           |     482,430 |      144,611 |      7 |
| `/w/[workspaceId]/members`   |     474,710 |      142,290 |      7 |
| `/w/[workspaceId]/invitations` |   475,554 |      142,464 |      7 |
| `/w/[workspaceId]/d/[docId]` |   1,138,017 |      363,882 |      8 |

Largest single chunk: `2l8_qwyasmsk9.js`, 659,568 bytes raw / 220,466 gzip. It is only loaded by
the document route. Total JS in `.next/static/chunks`: 1,340,023 raw / 437,246 gzip.

## What the bytes are

| Route                        | Package group            | Raw (kB) | Gzip (kB) |
| ---------------------------- | ------------------------ | -------: | --------: |
| every route                  | `next` + React runtime   |      565 |       209 |
| every route                  | application code         |       ~25 |       ~11 |
| `/w/[workspaceId]/d/[docId]` | `@codemirror/*`          |      ~320 |       ~108 |
| `/w/[workspaceId]/d/[docId]` | `@lezer/*`               |      ~210 |        ~75 |
| `/w/[workspaceId]/d/[docId]` | `yjs` + `lib0` + `y-*`   |       ~93 |        ~31 |

About 150 kB raw of the editor route is `@lezer/javascript`, `@lezer/css`, `@lezer/html` and their
`@codemirror/lang-*` wrappers. They are pulled in by `@codemirror/lang-markdown`, which imports them
statically for fenced-code and inline-HTML highlighting.

## Lighthouse (median of 3, mobile, simulated throttling)

| Route                        | Perf score | FCP (ms) | LCP (ms) | TBT (ms) |   CLS | JS transferred (kB) |
| ---------------------------- | ---------: | -------: | -------: | -------: | ----: | ------------------: |
| `/auth`                      |        100 |      756 |      756 |        7 | 0.000 |                 137 |
| `/w/1` (dashboard)           |         97 |      766 |      766 |        9 | 0.111 |                 151 |
| `/w/1/d/2` (editor)          |         76 |      758 |    3,592 |       74 | 0.278 |                 368 |

Reading these numbers:

- On the dashboard and the editor the first paint (FCP = LCP = 766 ms on the dashboard) is the
  "Loading your workspace…" text. The real content arrives later, so the dashboard LCP flatters it.
  The CLS of 0.111 and 0.278 is the swap from that loading screen to the full layout.
- The editor LCP of 3.6 s is real: it waits for the route JS (368 kB gzip) and for the sequential
  `me` → `document` → `workspaces` requests.

## Other measurements

- Markdown preview, server-render of the whole document (parse plus serialisation, Bun, 5 runs
  averaged): 2 kB 0.8 ms, 15 kB 5.6 ms, 150 kB 23 ms, 752 kB 96 ms. The documented maximum is
  1,000,000 characters.

## Gates that must pass (`.github/workflows/ci.yml`, job `frontend`)

`bun run lint`, `bun run typecheck`, `bun run format:check`, `bun run build`, `bun run test:e2e`
(Playwright, Chromium).
