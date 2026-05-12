# Gemini Omni Video Generator

Marketing site for **Gemini Omni Video Generator** — a Next.js 15 app showcasing AI video generation, remix, and chat-based editing.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React + TypeScript
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** Better Auth (Google / GitHub / email)
- **Payments:** Stripe (subscriptions + one-time)
- **UI:** Radix UI + TailwindCSS
- **State:** Zustand
- **i18n:** next-intl
- **Content:** Fumadocs + MDX
- **Lint/Format:** Biome

## Getting Started

```bash
pnpm install
cp env.example .env.local   # fill in your keys
pnpm db:push                # sync schema to your Postgres
pnpm dev                    # http://localhost:3000
```

## Common Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start dev server with content collections |
| `pnpm build` | Production build |
| `pnpm lint` | Run Biome linter |
| `pnpm format` | Format with Biome |
| `pnpm db:generate` | Generate Drizzle migration from schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm content` | Process MDX content |
| `pnpm email` | Email template dev server (port 3333) |

## Project Layout

```
src/
  app/         Next.js App Router (marketing + protected routes)
  components/  Feature-grouped React components
  actions/     Server actions
  db/          Drizzle schema + migrations
  lib/         Utilities
  stores/      Zustand stores
  i18n/        next-intl setup
  payment/     Stripe integration
  credits/     Credit system
content/       MDX (blog, docs)
messages/      Translation files (en.json, …)
```

See `CLAUDE.md` for the full architectural notes.

## Notes

- Package manager: **pnpm**
- Path alias: `@/*` → `src/*`
- Production URL: see `vercel.json`
