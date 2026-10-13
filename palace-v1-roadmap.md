# Palace — V1 Roadmap

## 1. Product summary

**Palace** is a personal, browser-based, Markdown-first note workspace.

Its first purpose is simple: replace a basic phone notes app with a better interface that works on several devices. You can capture a thought immediately, organize notes later with folders and tags, write in Markdown, link related notes, and find everything again through search.

The later direction is a “mind palace” made of visual boards: an infinite canvas where normal drawing shapes coexist with live cards that reference your notes. That board work is deliberately **not part of V1**.

## 2. V1 goal

Build a usable personal note application that I can use daily from my Android phone and desktop browsers.

### Success criteria

- I can create a note in a few seconds on mobile.
- Notes automatically save and are available from another browser/device after sign-in.
- I can organize notes in folders and with tags, but I am never required to categorize a note while capturing it.
- I can write standard Markdown.
- I can create and follow internal `[[wikilinks]]` between notes.
- I can search note titles and body content.
- I can export my notes as portable `.md` files.

## 3. Non-goals for V1

Do **not** build these in V1:

- Infinite canvas / tldraw boards.
- Tasks, due dates, recurring reminders, calendars, or project management.
- Real-time collaboration or shared workspaces.
- Offline-first synchronization, CRDTs, Yjs, or complex conflict merging.
- Attachments, images, voice capture, OCR, AI features, embeddings, or chat.
- Full Obsidian compatibility, plugin support, graph view, or a Notion-style block editor.
- Native Android application.
- Public sharing.

The app must remain a small, useful note system first.

## 4. Product workflows

### 4.1 Fast capture

1. Open Palace on phone or desktop.
2. Tap/click **New note**.
3. Type a title and/or body.
4. Optionally choose a folder and tags.
5. The note saves automatically.

Default behavior:

- New notes go to **Inbox** when no folder is selected.
- Folder and tags are optional.
- The editor should autofocus on a useful field.
- The UI must clearly show `Saving…`, `Saved`, or `Save failed`.

### 4.2 Browse and organize

- Browse notes by folder.
- View Inbox, All notes, Pinned, and Archived notes.
- Create, rename, reorder if easy, and delete folders.
- Create tags from the note editor; filter notes by tag.
- Pin important notes.
- Archive notes instead of permanently deleting them by default.

### 4.3 Write and link notes

- Notes have a title and Markdown body.
- The editor is Markdown-first; a plain textarea/editor with preview is enough.
- Support internal links in the form `[[Note title]]`.
- Clicking a resolved wikilink opens that note.
- A note page shows backlinks: notes that link to it.
- If a linked note is renamed, existing link text does not need automatic rewriting in V1; resolving by exact title is sufficient for the first iteration.

### 4.4 Search

- Global search by title and Markdown body.
- Search results show title, short matching/context preview, folder, tags, and last update time.
- Search should include active notes only by default; archived notes can be included through a filter if simple.

### 4.5 Markdown export

- Export all non-deleted notes as a ZIP containing `.md` files.
- Preserve folder hierarchy in the export.
- Include simple YAML frontmatter when exporting:

```md
---
title: Example note
tags:
  - career
  - project
createdAt: 2026-10-12T00:00:00.000Z
updatedAt: 2026-10-12T00:00:00.000Z
---

# Example note

Markdown content here.
```

- Export is one-click from settings or the sidebar menu.
- Markdown portability matters more than perfect round-trip import in V1.

## 5. UX requirements

### Primary screens

1. **Notes home / Inbox**
   - Responsive list of notes.
   - New note button always visible.
   - Fast access to Inbox, All notes, Pinned, Archived.
   - Folder navigation and tag filters.

2. **Note editor**
   - Title input.
   - Markdown editor.
   - Preview toggle or split preview is optional; do not make it complex.
   - Folder picker, tags, pin/archive actions.
   - Autosave status.
   - Backlinks section.

3. **Search**
   - Global search input accessible from the main layout.
   - Search results page/dropdown with keyboard-friendly navigation if easy.

4. **Folders management**
   - Simple create/rename/delete actions.
   - Inbox is a protected/default system folder; do not allow deleting it.

5. **Settings**
   - Export Markdown ZIP.
   - Basic account action such as sign out.

### Design principles

- Mobile-first for capture; desktop-friendly for writing and browsing.
- Calm, clean, practical interface—not a dense enterprise dashboard.
- Minimal required fields.
- Clear empty states.
- Keyboard shortcuts may be added if easy: `Ctrl/Cmd + K` for search and `N` for new note.
- Use a responsive side navigation that becomes a drawer/sheet on small screens.

## 6. Technical decisions

### Application stack

Use a single full-stack TypeScript application:

- **Framework:** Next.js with App Router.
- **Language:** TypeScript with strict mode.
- **UI:** Tailwind CSS and shadcn/ui components where useful.
- **Database:** PostgreSQL.
- **ORM:** Prisma.
- **Validation:** Zod.
- **Authentication:** Better Auth if straightforward to configure with Prisma/PostgreSQL; otherwise Auth.js with credentials/emailless development setup. Keep auth simple and documented.
- **Markdown rendering:** `react-markdown` with `remark-gfm`; sanitize rendered HTML and do not allow unsafe raw HTML.
- **ZIP export:** `jszip` or an equivalent well-maintained package.
- **Testing:** Vitest for unit tests and Playwright for a small essential end-to-end suite if setup remains reasonable.
- **Formatting/linting:** ESLint + Prettier (or the project defaults if they cover formatting reliably).

### Database-first Markdown model

The application database is the operational source of truth.

- Store note body as `contentMarkdown` in PostgreSQL.
- Store folders, tags, note-tag relationships, and note metadata relationally.
- Generate Markdown files only during export.
- Do not store a physical `.md` file per note on the server in V1.
- Use stable UUID/CUID IDs internally; titles and paths are never identifiers.

### Authentication and ownership

- All data belongs to a user.
- Every query/mutation must scope records by the authenticated user ID.
- Start with one personal workspace implicitly represented by the user; do not build multi-workspace support in V1.
- Users must not access another user’s notes by guessing IDs.

### Autosave

- Debounce saves after typing stops, approximately 700–1,000 ms.
- Save on blur/navigation if there are unsaved changes.
- Avoid overlapping saves. A newer save must not be overwritten by an older request.
- Display `Saving…`, `Saved`, and an actionable `Save failed` state.
- V1 conflict policy: last successful save wins. Detecting/reconciling simultaneous edits on two devices is out of scope; do not silently claim real-time synchronization.

### Search

- Start with PostgreSQL-backed title/body search through Prisma-compatible queries.
- It is acceptable to use case-insensitive contains matching in V1 for simplicity.
- Keep search logic behind a repository/service interface so PostgreSQL full-text search can replace it later.
- Limit result count and paginate if necessary.

### Wikilinks and backlinks

- Parse wikilinks from Markdown using the pattern `[[Some note title]]`.
- Resolve targets only among the current user’s active notes.
- Store parsed outbound links in a `NoteLink` table after a note save.
- Rebuild the source note’s outbound links transactionally after its Markdown changes.
- A backlink query finds links where `targetNoteId` equals the current note ID.
- In V1, ambiguous duplicate titles can be shown as unresolved; do not implement complex disambiguation.
- Rendering: convert resolved wikilinks to safe internal note links. Unresolved wikilinks should remain visually distinct but non-breaking.

## 7. Data model

Use Prisma migrations. Suggested initial schema:

```text
User
- id
- email (unique)
- name (optional)
- createdAt
- updatedAt

Folder
- id
- userId
- name
- parentId (nullable; optional nested folders only if easy)
- kind: INBOX | NORMAL
- createdAt
- updatedAt

Note
- id
- userId
- folderId (nullable; default Inbox when created)
- title
- contentMarkdown
- isPinned
- archivedAt (nullable)
- createdAt
- updatedAt

Tag
- id
- userId
- name
- normalizedName
- createdAt

NoteTag
- noteId
- tagId

NoteLink
- id
- sourceNoteId
- targetNoteId (nullable for unresolved link)
- rawTargetTitle
- createdAt
```

Constraints/indexes:

- Unique `(userId, normalizedName)` for tags.
- Unique `(sourceNoteId, rawTargetTitle)` for note links if appropriate.
- Index `Note(userId, updatedAt)`.
- Index `Note(userId, archivedAt)`.
- Index `Folder(userId, name)`.
- Enforce that a note can only reference folders/tags owned by the same user.
- Create one protected Inbox folder for each user at signup/first use.

## 8. API and server requirements

Use server-side route handlers, server actions, or a consistent combination. Keep the boundary simple and validate every external input with Zod.

Required capabilities:

```text
POST   /notes                 Create note
GET    /notes                 List/filter notes
GET    /notes/:id             Fetch one note plus backlinks/tags/folder
PATCH  /notes/:id             Update title/content/folder/tags/pin/archive state
DELETE /notes/:id             Soft-delete/archival behavior only; permanent delete can wait

POST   /folders               Create folder
PATCH  /folders/:id           Rename folder
DELETE /folders/:id           Delete an empty normal folder or move notes to Inbox first
GET    /folders               List folders

GET    /search?q=             Search notes
GET    /export/markdown       Download ZIP export
```

Exact URLs may change with the Next.js implementation; the capability and authorization requirements matter more than the route spelling.

Every mutation must:

1. Authenticate the user.
2. Validate input with Zod.
3. Verify ownership of affected note/folder/tag records.
4. Persist changes transactionally where link/tag updates are involved.
5. Return a useful error shape for the UI.

## 9. Markdown behavior

Support standard user-authored Markdown plus:

- Headings, paragraphs, lists, checkboxes rendered as Markdown only, code blocks, quotes, links, and tables through GitHub Flavored Markdown.
- `[[wikilinks]]` as a Palace-specific extension.
- No unsafe raw HTML rendering.
- No file embeds, images, transclusion, Mermaid, LaTeX, plugins, or arbitrary custom syntax in V1.

## 10. Security and quality requirements

- Authentication required for application routes.
- Authorization in server/database operations, not just hidden UI buttons.
- Never trust client-provided user IDs.
- Use parameterized Prisma queries.
- Validate and constrain title/body/folder/tag lengths.
- Sanitize Markdown output; do not enable raw HTML.
- Use environment variables for database/auth secrets; include `.env.example`, never secrets.
- Provide graceful error and empty states.
- Ensure responsive layout works at a narrow mobile width and a desktop width.
- Run `lint`, typecheck, tests, and production build successfully before considering V1 complete.

## 11. Minimal testing plan

### Unit tests

- Wikilink parser extracts `[[Title]]` values correctly.
- Wikilink parser ignores malformed links appropriately.
- Export generation creates expected folder paths and frontmatter.
- Note link refresh resolves only notes owned by the same user.
- Tag normalization prevents duplicates such as `Career` and `career`.

### End-to-end tests

1. Sign in/create a development user.
2. Create a note from Inbox.
3. Edit Markdown and verify autosave.
4. Create a second note containing a wikilink to the first.
5. Verify the first note shows a backlink.
6. Search for a phrase from a note body.
7. Export notes and verify the export request succeeds.

## 12. Definition of done for V1

V1 is complete when I can:

- Sign in from phone and desktop browser.
- Add, edit, pin, archive, browse, search, and organize Markdown notes.
- Use folders and tags without mandatory categorization.
- Link notes with `[[wikilinks]]` and see backlinks.
- See dependable autosave feedback.
- Export all notes into a portable Markdown ZIP.
- Use the app for two weeks without needing features that belong to greenie-central or the future board/canvas phase.

## 13. Future roadmap (not V1)

### V2 — Palace boards

- Add boards/palaces backed by tldraw.
- Persist board snapshots through the backend.
- Support native tldraw drawing/shapes/text/arrows/frames.
- Add a custom linked-note card shape referencing a canonical Note ID.
- Add notes to a board by drag/drop or from the note page.
- Open the note in a side panel from the card.
- Keep note cards synchronized with note title/preview metadata.
- Track `BoardNoteReference` data to answer “where is this note used?”

### V3 — better portability and resilience

- Import Markdown folders/ZIPs.
- Improve title rename/wikilink migration behavior.
- PWA shell and offline cache.
- Local outbox queue for unsynced edits.
- Note version history.
- Attachments/images.

### V4 — advanced sync and assistance

- Consider Yjs/CRDT only if simultaneous multi-device/offline editing becomes a real problem.
- Optional local/provider-based AI for inbox triage, suggested tags, note linking, and proposed board layouts.
- Keep every AI change reviewable by the user.
