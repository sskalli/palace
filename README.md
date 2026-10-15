# Palace

Palace is a personal, browser-based, Markdown-first note workspace. V1 focuses on quick capture, dependable autosave, folders and tags, searchable notes, `[[wikilinks]]` with backlinks, and portable Markdown exports.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with Prisma migrations
- Auth.js credentials authentication (email and password)
- Zod validation, `react-markdown`/`remark-gfm`, JSZip, and Vitest

## Requirements

- Node.js 20.9 or newer
- npm
- PostgreSQL 14 or newer

Copy `.env.example` to `.env` and configure:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the app (use Neon’s pooled URL in serverless deployments) |
| `DIRECT_URL` | Direct PostgreSQL connection string for Prisma migrations |
| `AUTH_SECRET` | Random secret used to sign Auth.js sessions |
| `AUTH_URL` | App base URL, normally `http://localhost:3000` |

Generate a secret with `openssl rand -base64 32`. Keep `.env` private.

## Local development

```sh
npm install
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000>, create an account, and sign in. Accounts are private to this installation; registration does not send email.

## Commands

```sh
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm test           # Unit tests
npm run build      # Production build
```

Prisma commands:

```sh
npx prisma migrate dev --name init
npx prisma generate
npx prisma studio
```

## Deploying to Vercel with Neon

1. Add `DATABASE_URL` and `DIRECT_URL` to Vercel's Production environment variables. Use Neon’s pooled connection string (hostname contains `-pooler`) for `DATABASE_URL`, and its direct connection string for `DIRECT_URL`.
2. Add `AUTH_SECRET` and set `AUTH_URL` to the deployed app's canonical HTTPS URL.
3. Before the first deployment, apply the committed migrations to the production Neon database from a trusted local terminal with the production URLs in `.env`:

   ```sh
   npm run db:deploy
   ```

   This runs `prisma migrate deploy`; do not use `prisma migrate dev` against production. The Neon SQL editor is not a substitute for Prisma's migration command because Prisma also records applied migrations.
4. Import the repository in Vercel and deploy with the default `npm run build` command.
5. For Vercel Preview deployments, use a separate Neon branch/database and set Preview-scoped `DATABASE_URL` and `DIRECT_URL` values. Avoid running preview migrations against the production database.

Run `npm run db:deploy` again after deploying each future schema migration, targeting the appropriate database. The Vercel build intentionally does not migrate the database automatically.

## V1 notes and limitations

- PostgreSQL is the source of truth; notes are not written as server-side files.
- Search uses case-insensitive title/body matching and is limited to recent results.
- Ambiguous duplicate note titles remain unresolved wikilinks.
- Autosave uses a last-successful-save-wins policy; simultaneous edits on different devices are not merged.
- Archiving is reversible. Archived notes can be permanently deleted from the Archived view; there is no import flow.
- V1 does not include boards/canvases, collaboration, offline sync, attachments, reminders, AI, plugins, or a native mobile app.
