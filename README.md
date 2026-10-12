# Palace

Palace is a personal, browser-based, Markdown-first note workspace. Notes are stored in PostgreSQL and are available across devices after signing in.

## V1 scope

- Email/password accounts and private, server-backed notes.
- Inbox, all notes, pinned and archived views; optional flat folders and tags.
- Markdown editing with debounced autosave and a safe rendered preview.
- Case-insensitive title/content search, `[[wikilinks]]`, and backlinks.
- ZIP export of active notes as standard Markdown with YAML frontmatter.

The V1 intentionally does not include attachments, imports, collaboration, offline sync, nested-folder navigation, AI, boards, or a graph view. Notes with duplicate matching titles are not linked automatically.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL, Prisma, Better Auth, Zod, React Markdown, JSZip, and Vitest.

## Local setup

Requirements: Node.js 22.12+ (24 LTS recommended), npm, and PostgreSQL 14+.

1. Create a database named `palace` in your local PostgreSQL server. For a throwaway local database, Docker can be used:

   ```sh
   docker run --name palace-postgres \
     -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=palace -p 5432:5432 -d postgres:16
   ```

2. Install packages and configure the environment:

   ```sh
   npm ci
   cp .env.example .env
   ```

   Set `DATABASE_URL` to the local database connection string. Generate a private auth secret with `openssl rand -base64 32` and put it in `BETTER_AUTH_SECRET`. `BETTER_AUTH_URL` should be `http://localhost:3000` for local development.

3. Apply the checked-in PostgreSQL migration and start the app:

   ```sh
   npm run db:migrate
   npm run dev
   ```

   Open <http://localhost:3000> and create an account with an email and password (minimum 10 characters). Palace creates the Inbox lazily when you first load your notes.

`npm run db:seed` is optional. Set `SEED_USER_EMAIL` to the email of an existing account; it safely ensures that account has an Inbox and does not create demo notes or credentials.

## Commands

```sh
npm run lint        # ESLint
npm run typecheck   # TypeScript strict typecheck
npm test            # Vitest unit tests
npm run build       # Production build
npm run db:generate # Regenerate Prisma Client
npm run db:deploy   # Apply checked-in migrations in production
```

## Data and security notes

The database is the source of truth. Every note, folder, tag, link, and export query is scoped to the authenticated user. Markdown HTML is not enabled in the renderer. Archive is reversible; there is no permanent-delete UI for notes. Keep `.env` private and configure a strong `BETTER_AUTH_SECRET` outside local development.
