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
| `DATABASE_URL` | PostgreSQL connection string |
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

## V1 notes and limitations

- PostgreSQL is the source of truth; notes are not written as server-side files.
- Search uses case-insensitive title/body matching and is limited to recent results.
- Ambiguous duplicate note titles remain unresolved wikilinks.
- Autosave uses a last-successful-save-wins policy; simultaneous edits on different devices are not merged.
- Archiving is reversible and there is no permanent-delete or import flow.
- V1 does not include boards/canvases, collaboration, offline sync, attachments, reminders, AI, plugins, or a native mobile app.
