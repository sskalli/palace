# Palace performance diagnosis

Original review: 27 October 2026, including the uncommitted changes present at the time. The diagnosis below records that baseline; the implementation section at the end describes the completed changes. This is a source audit and local editor benchmark, not a production latency profile.

## Main conclusion

The largest structural problem is that interactions depend on network round trips even when the UI could proceed locally. Uncached note opening starts its data request after route mounting. Creation waits for persistence. Folder changes and autosave trigger broad refetches. Slow database access or cold starts would amplify these patterns, but neither has been measured here.

Keep Next.js, PostgreSQL, Prisma, and CodeMirror. Introduce a coherent client data cache, narrow mutation work, and make creation optimistic. Fix save lifecycle before adding more asynchronous navigation. A framework or database rewrite is not justified by this review.

## Current interaction paths

### Opening an existing note

`Link click -> route navigation if needed -> NoteEditor mounts -> useEffect -> GET /api/notes/:id -> authenticated database read with relations -> optional live wikilink query -> draft state -> CodeMirror initialization`

See `src/app/(workspace)/notes/[id]/page.tsx`, `src/hooks/use-note-editor.ts`, and `src/app/api/notes/[id]/route.ts`.

Next's route prefetch does not populate this effect-driven JSON request. Reopening a note has no application-level note cache. Route work can already be prefetched or cached, so not every opening necessarily incurs both server trips. Hard entry also needs client hydration before this effect can run.

### Creating a note

`Click -> POST /api/notes -> database creation -> seedNote -> patch sidebar -> router.push -> editor consumes seed`

Existing uncommitted changes already remove the immediate detail refetch and navigation reload for this path. They also remove the note metadata title query and unnecessary outgoing-link inclusion. These are useful improvements, but the editor still cannot appear before the POST completes. Prisma nested connects and includes can involve more than one SQL operation; one Prisma call is not necessarily one database round trip.

### Creating a folder

`Confirm -> POST /api/folders -> transaction (optional parent lookup, name collision lookup, insert) -> close dialog -> reload folders + tags + tree -> display refreshed folders`

The three refresh requests run concurrently, not sequentially. Folder visibility still waits for a second HTTP phase because the returned folder is discarded by the dialog. Creating an empty folder does not require reloading tags or notes.

### Autosave

`Edit -> 800 ms debounce (or blur flush) -> PATCH full draft -> transactional tag/link maintenance and update -> full detail response -> tags + tree reload`

The 800 ms delay is deliberate background save behavior, not the cause of opening or creation latency. The avoidable work after it is significant.

## Prioritized changes

### 1. Shared client cache and targeted mutation updates — high impact

Files: `src/lib/api-client.ts`, `src/hooks/use-note-editor.ts`, `src/hooks/use-notes-list.ts`, `src/hooks/use-navigation.ts`, `src/components/folder-dialogs.tsx`.

- Maintain note details by ID and lists by normalized filter. Use a maintained query cache such as TanStack Query/SWR, or an equivalently explicit shared store; a library alone will not fix the behavior.
- Display cached notes synchronously and revalidate in the background. Deduplicate in-flight requests and support cancellation.
- Prefetch detail data on hover/focus or another bounded intent signal, together with the editor route/code. Do not fetch every note body in the sidebar.
- Seed the cache with create responses, and update it with successful saves, moves, pins, archives, and deletions.
- Insert the folder returned by POST immediately with zero notes. Update names and parent IDs from mutation responses. Reserve full reconciliation for changes whose effects are genuinely broad.
- Body-only saves should cause no tree/tag requests. Patch the tree for title/pin/location changes; refresh tags only when membership or archive visibility changes.
- Invalidate/update matching list previews and folder counts too; current paths can leave these stale.
- Scope data to the signed-in user, clear it on logout/account change, bound memory, and prevent background reads from overwriting unsaved drafts.

For direct note URLs, consider reading the essential note data in the server page and seeding this same cache. That removes the mount-then-fetch waterfall on initial entry. Keep warm navigation cache-first; simply moving all data to server rendering would still leave a network dependency on uncached navigation.

### 2. Optimistic creation — required for consistently immediate creation

Files: `src/components/app-shell.tsx`, `src/components/folder-dialogs.tsx`, note/folder create routes.

Show a provisional folder or editable blank note immediately, with a visible pending state. Persist it in the background, reconcile the server ID/result, and retain the user's work if creation fails. A client-generated stable ID accepted by the server can avoid temporary-to-real-ID remapping, but requires schema validation, ownership checks, and an idempotency strategy. A provisional editor can also work without changing persistent IDs.

Queue edits until creation succeeds; ensure retry cannot create duplicates. Reconcile moves, counts, list membership, and URL changes. For reload recovery, consider an IndexedDB draft/outbox as a later step.

### 3. Narrow autosave requests and responses — high impact

Files: `src/hooks/use-note-editor.ts`, `src/app/api/notes/[id]/route.ts`, `src/lib/notes.ts`.

The editor always sends the full `NoteDraft`, including tags and content. Consequently even a pin/title change from the editor enters the transaction branch, compares content, and replaces tag associations. With tags present, replacement performs four explicit Prisma operations even if tags did not change. Content edits can delete/recreate identical link targets. Saves also read related details and resolve live wikilinks, then trigger two more HTTP reads.

- Send only fields changed since the acknowledged revision; preserve edits made while a request is in flight.
- Only update tag associations when normalized tag membership changed.
- Compare parsed link targets before replacing link rows, rather than treating every content change as a link change.
- Return a small save acknowledgment (ID, version, timestamp, and necessary derived changes). Fetch backlinks separately; update live link resolution only when needed.
- Keep meaningful multi-row changes atomic. Remove unnecessary operations rather than broadly removing transactions.

This reduces database round trips, writes, payload size, and work competing with note opening.

### 4. Separate essential editor data from secondary relationships — medium/high impact

Files: `src/lib/notes.ts`, `src/app/api/notes/[id]/route.ts`.

Note GET includes folder, tags, and incoming links, then waits for an additional title-resolution query when wikilinks exist. Backlinks are unbounded. The serializer spreads raw relations into the JSON and adds transformed tags/backlinks, sending duplicate representations.

Return an explicit DTO. Prioritize title, body, tags, folder ID, and revision; load backlinks and other secondary details independently. Preserve link correctness during background loading. Cap or paginate large backlink lists. Inspect actual generated SQL before selecting a different Prisma relation loading strategy: relation includes are not proof of an N+1 issue.

### 5. Incremental editor decorations — confirmed scaling cost

Files: `src/lib/live-preview/blocks.ts`, `src/lib/live-preview/extension.ts`, `src/components/live-markdown-editor.tsx`.

`collectLiveSyntax` requests parsing to the end of the document with a 100 ms budget, walks the syntax tree, converts the whole document to a string, and scans wikilinks. `livePreviewField` rebuilds decorations for selection changes as well as edits. Wikilink overlap detection scans the covered ranges for each link. Rendered blocks use ReactMarkdown and `renderToStaticMarkup` in the browser.

A local Node benchmark used repeated Markdown headings, emphasis, inline code, and links, and measured 30 selection-only transactions with the actual Markdown extension and live-preview field:

| Note characters | Median transaction | Approx. p95 transaction |
| --------------- | -----------------: | ----------------------: |
| 1,000           |            0.49 ms |                 1.58 ms |
| 20,000          |            5.10 ms |                 6.68 ms |
| 100,000         |           61.51 ms |                70.98 ms |

This measures state/decorations only, excludes browser DOM/layout and widget rendering, and is not a production interaction benchmark. It demonstrates a real large-note scaling problem; it does not explain blank-note creation latency.

Cache parsed spans, map unchanged decorations through edits, and limit selection changes to affected blocks. Use CodeMirror's existing incremental parse work rather than repeatedly demanding a full synchronous parse. Keep block decorations in an appropriate state field; viewport-only decorations require care for widgets that affect layout. Stabilize wikilink data/renderer identity so identical save results do not recreate widgets. Profile browser long tasks before replacing the rendering pipeline.

### 6. Folder constraints and database latency — measure, then optimize

Files: `src/app/api/folders/route.ts`, `src/lib/folders.ts`, `prisma/schema.prisma`.

Folder creation has serial validation/insertion work in an interactive transaction. Distant app/database regions, connection establishment, or database wakeup would multiply that cost. These deployment properties were not verified.

There is also no database uniqueness constraint for sibling names. A check-then-insert can race under normal isolation. Add a database-enforced sibling-name rule that handles NULL root parents correctly; use supported NULLS NOT DISTINCT behavior or partial unique indexes as appropriate for the deployed PostgreSQL version. Preserve ownership checks and map uniqueness violations to the existing conflict response. Then simplify redundant collision checks where possible.

Verify app region, database region, pooling, connection acquisition, cold versus warm request time, and migration status. Use sampled query traces and EXPLAIN (ANALYZE, BUFFERS) on representative read queries in an appropriate environment. Do not infer actual indexes from schema files alone.

Existing positives: Prisma singleton, JWT sessions, narrow list projections with stored previews, 50-note list pagination, title indexes, and committed trigram search indexes. Password hashing is on login, not note operations. The trigram migration already exists; adding generic search indexes again is not the first fix. Its body index also adds write maintenance, so avoiding unchanged-body updates matters.

Potential index candidates, only after query plans justify them: active-note list ordering by user/updatedAt/ID, filtered folder list ordering, and tree ordering including its ID tie-breaker. Do not add every candidate blindly; each index increases write/storage cost.

### 7. Navigation and large workspaces — secondary

- No route `loading.tsx` exists. A loading boundary can improve transition feedback and partial route prefetching, but cannot populate a JSON request started in a client effect. The installed Next.js navigation guide explicitly describes dynamic-route and development-prefetch limitations.
- Folder titles still cause a metadata database query in `src/app/(workspace)/page.tsx`. Trace whether it delays transitions; use cached folder data/client titles if warranted. For client-only filters, deriving filter state from search params can allow native history updates; changing history alone is insufficient while filter props originate in the server page.
- `src/components/folder-tree.tsx` copies the accumulated group array for every inserted note, which is quadratic for notes concentrated in one folder. Push into locally created groups instead.
- The sidebar tree is capped at 2,000 notes and can mount many rows. Replace silent truncation with explicit lazy/paginated folder loading; virtualize expanded large lists when traces justify it.
- Abort obsolete list/detail requests; the current `live` guards prevent applying some stale responses but do not cancel their network/database work.
- Measure route JS and startup work. The editor statically imports CodeMirror, Markdown plugins, and a browser version of React's server renderer. Preload likely editor use; defer optional preview/export code. Next already splits by route, and adding a dynamic import without preloading can introduce another waterfall.

## Save correctness prerequisites

Address these before more aggressive caching/optimism:

1. When noteId changes, the editor hook does not explicitly reset draft, revision counters, errors, and in-flight bookkeeping. If React reuses the component, old state and async completions can cross note identities. Key the editor by note ID or isolate all state and completions by note ID/generation.
2. Cleanup cancels the debounce without itself persisting the draft. Blur usually starts a save for mouse navigation, but is not a durable guarantee for every navigation/unmount path. beforeunload plus ordinary fetch is also not a durable save mechanism. Retain pending drafts outside component lifetime and give navigation/reload an explicit recovery strategy.
3. The one-shot seeded-note Map is consumed in an effect. Development Strict Mode can run setup/cleanup/setup: the first setup consumes the seed but its result is discarded by `live = false`, and the next setup fetches again. Use a reusable cache instead of destructive read-once initialization.
4. Local tree mutations increment the request-generation counter. If a tree read is still pending, it can be discarded without merging the previously unloaded notes; test creating a note during initial navigation loading.
5. The current server API has no optimistic concurrency version. A faster UI needs conflict detection or an explicit, tested cross-tab/device overwrite policy.
6. Backlinks are persisted on source content changes, while forward links are resolved live. Creating/renaming/archiving a target can leave incoming links stale. If moving link maintenance to background work, implement reliable reconciliation rather than increasing this inconsistency.

## Validation and rollout

First record a production-build baseline on representative data. Include blank/1 KB/20 KB/100 KB notes, tags and wikilinks, root/nested folders, a larger workspace, warm requests, and the first request after inactivity. Separate local development compilation from production serving. The installed Next version is 16.4.0 while package.json requests ^16.4.2; reconcile installed/locked dependencies before drawing conclusions across environments.

Instrument click-to-editable and click-to-folder-visible, API duration, auth time, database connection/query time, response size, JS loading, editor initialization, and main-thread long tasks. Use request IDs and Server-Timing where appropriate without logging note content. Report p50/p95 and warm/cold separately. An API average alone misses the user-visible waterfall.

Suggested product targets, not measured guarantees: cached note switch and optimistic creation feedback within 100 ms; zero sidebar reads after body-only saves; no detail refetch immediately after successful creation; no tags/tree refetch for empty-folder creation. Set separate backend latency budgets after measuring the deployment.

Implement in this order:

1. Baseline instrumentation and save identity/lifecycle fixes.
2. Shared note/list cache, bounded detail prefetch, and mutation patches for folders/sidebar.
3. Narrow autosave work and responses; separate secondary note data.
4. Optimistic note/folder creation with retry, reconciliation, and draft recovery.
5. Large-note decoration optimization and any database/deployment changes supported by traces.

Add behavior tests for rapid A/B switching during saves, failed creation followed by retry, edits during creation, stale background reads, note creation during initial tree load, and navigation before the debounce expires. Current tests cover helpers, not these interaction paths.

Checks run: all 40 existing tests pass across five files. Type checking fails at `src/components/auth-form.tsx:56` because the existing submit callback uses DOM SubmitEvent rather than the React handler's event type. No production browser trace, deployed database query plan, or fresh production build was obtained. The pre-existing .next build is older than the reviewed working tree and was not used as evidence of current bundle sizes.

## Implemented changes

The main findings were implemented on the local branch in five commits with the requested subject `refactoring/action-note-performances-enhancement`:

1. Account-scoped note and list caches, detail prefetch on pointer/focus intent, per-note save queues independent of mounted components, field-level draft diffs, and recoverable session drafts.
2. Narrow save acknowledgments, no tag queries for body-only edits, no association rewrites for unchanged tags/link target sets, explicit serialized relationship fields, and a separate bounded references endpoint with independent loading/error UI.
3. Optimistic editable notes and folders, stable UUID creation IDs, ownership-scoped idempotent retry handling, creation failure recovery, and folder mutation patches instead of full navigation reloads.
4. Cached Markdown syntax spans, reused decorations for equivalent selections, a shorter synchronous parsing budget with incremental background parsing, linear wikilink overlap checks, and a reusable benchmark script.
5. Workspace-owned editor instances so URL reconciliation preserves cursor/focus/undo state, immediate cached note opening, sidebar/cache/count reconciliation, recovered-draft discovery, cached list preview/order/filter reconciliation after saves, and integration regression coverage.

The editor benchmark can be rerun with `node scripts/benchmark-editor.cjs`. The final local run measured median selection updates of approximately 0.29 ms / 0.53 ms / 1.25 ms for 1 KB / 20 KB / 100 KB notes, versus baseline 0.49 ms / 5.10 ms / 61.51 ms. These are synthetic Node state/decorations timings, not browser or production latency guarantees.

Validation: 66 tests across nine files, TypeScript, ESLint, and whitespace checks pass. A production build succeeds with `npm run build -- --webpack`. The standard Turbopack build cannot finish in this execution environment because its CSS worker cannot bind a port; the initial sandboxed attempt also could not fetch the existing Google Fonts. The installed Next.js build emits an existing dependency-security upgrade warning. No dependency upgrade, schema migration, deployment, or production database mutation was performed.

Remaining limits: production database regions, pooling, cold starts, query plans, and browser interaction latency still require deployment measurements. Cross-device saving retains the existing last-successful-write-wins policy. Draft recovery uses account-scoped session storage and depends on browser storage availability; this is not a complete offline sync/outbox implementation. Backlinks display at most the first 100 linked mentions, explicitly labeled, and the sidebar retains its existing 2,000-note server limit. Folder-name uniqueness under concurrent writers and target-rename backlink reconciliation remain separate correctness work from the implemented interaction-performance changes.
