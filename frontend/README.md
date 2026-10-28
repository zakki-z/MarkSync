# MarkSync frontend

Next.js 16 / React 19 / Tailwind CSS 4. See the [root README](../README.md) for the complete Compose setup, security boundaries, and walking-skeleton demonstration.

Use Bun 1.3.14. Copy `env.sample` to `.env.local` for standalone development; all service URLs are server-only. Browser authentication uses `/api/auth/*` and an HttpOnly cookie. `/auth` is the login/signup page, and `proxy.ts` validates sessions before serving `/documents`.

```sh
bun install --frozen-lockfile
bun run dev
```

Run `bun run lint`, `bun run typecheck`, `bun run format:check`, `bun run build`, and `bun run test:e2e`. Install Chromium first with `bun x playwright install --with-deps chromium`. The isolated Playwright suite starts a production frontend and a local upstream fixture. `bun x playwright test --config playwright.integration.config.ts` runs against the actual Compose gateway (override `E2E_BASE_URL` if needed).
