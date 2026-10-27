This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 20.9+ and Bun 1.3.14. From `frontend`:

```bash
bun install --frozen-lockfile
cp env.sample .env.local
bun run dev
```

Start [the authentication backend](../backend/auth-service/README.md) separately on port 8000. Open [http://localhost:3000/auth](http://localhost:3000/auth) to sign up or log in.

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`. Set it in `.env.local` before starting development or building if the API runs elsewhere. Next.js embeds this public URL at build time; changing it requires a rebuild. Never put credentials or signing keys in `NEXT_PUBLIC_` variables.

To check and run a production build locally:

```bash
bun run lint
bun run build
bun run start
```

Focused browser regressions cover signup/login, duplicate submissions, errors and retries, and token visibility. After building, run:

```bash
bunx playwright install chromium
bun run test:e2e
```

The browser tests mock authentication responses and start the production frontend automatically on port 3100, leaving the development server on port 3000 alone.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
