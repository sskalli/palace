import { normalizeTagName } from "@/lib/tags";
import type { NoteDetail, NoteSummary } from "@/lib/client-types";
import { api, errorText } from "@/lib/api-client";

export interface NoteDraft {
	title: string;
	contentMarkdown: string;
	tags: string[];
	isPinned: boolean;
	archived: boolean;
}
export type SaveState = "saved" | "saving" | "failed";
export interface NoteEntry {
	note: NoteDetail;
	draft: NoteDraft;
	baseline: NoteDraft;
	saveState: SaveState;
	error: string;
	creating?: boolean;
}
export function toDraft(note: NoteDetail): NoteDraft {
	return {
		title: note.title,
		contentMarkdown: note.contentMarkdown,
		tags: note.tags.map((t) => t.name),
		isPinned: note.isPinned,
		archived: Boolean(note.archivedAt),
	};
}
export function draftChanges(draft: NoteDraft, baseline: NoteDraft): Partial<NoteDraft> {
	const changes: Partial<NoteDraft> = {};
	if (draft.title !== baseline.title) changes.title = draft.title;
	if (draft.contentMarkdown !== baseline.contentMarkdown) changes.contentMarkdown = draft.contentMarkdown;
	if (draft.isPinned !== baseline.isPinned) changes.isPinned = draft.isPinned;
	if (draft.archived !== baseline.archived) changes.archived = draft.archived;
	if (JSON.stringify(draft.tags) !== JSON.stringify(baseline.tags)) changes.tags = draft.tags;
	return changes;
}

/** One store per authenticated workspace. Saves belong to notes, never to mounted editors. */
export class NoteStore {
	private entries = new Map<string, NoteEntry>();
	private listeners = new Set<() => void>();
	private loading = new Map<string, Promise<void>>();
	private saving = new Map<string, Promise<void>>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private fetched = new Map<string, number>();
	private generation = new Map<string, number>();
	private disposed = false;
	private lists = new Map<string, { value: unknown; time: number }>();
	private listRequests = new Map<string, Promise<unknown>>();
	private listRevision = 0;
	getList<T>(url: string): T | undefined {
		return this.lists.get(url)?.value as T | undefined;
	}
	invalidateLists() {
		this.listRevision++;
		this.lists.clear();
		this.listRequests.clear();
	}
	loadList<T>(url: string): Promise<T> {
		const cached = this.lists.get(url);
		if (cached && Date.now() - cached.time < 30_000) return Promise.resolve(cached.value as T);
		const pending = this.listRequests.get(url);
		if (pending) return pending as Promise<T>;
		const revision = this.listRevision;
		const work = this.request<T>(url)
			.then((value) => {
				if (revision === this.listRevision && !this.disposed) {
					this.lists.set(url, { value, time: Date.now() });
					if (this.lists.size > 50) this.lists.delete(this.lists.keys().next().value!);
				}
				return value;
			})
			.finally(() => {
				if (this.listRequests.get(url) === work) this.listRequests.delete(url);
			});
		this.listRequests.set(url, work);
		return work;
	}
	private reconcileLists(note: NoteDetail) {
		const summary: NoteSummary = {
			id: note.id,
			title: note.title.trim() || "Untitled note",
			preview: note.contentMarkdown.replace(/\s+/g, " ").trim().slice(0, 180),
			updatedAt: note.updatedAt,
			isPinned: note.isPinned,
			folder: note.folder,
			tags: note.tags,
		};
		for (const [url, cached] of this.lists) {
			const params = new URL(url, "http://palace.local").searchParams;
			const page = cached.value as { notes?: NoteSummary[]; nextCursor?: string | null };
			if (!Array.isArray(page?.notes)) continue;
			if (params.has("cursor")) {
				this.lists.delete(url);
				continue;
			}
			const view = params.get("view") ?? "all";
			const folderId = params.get("folderId");
			const tag = params.get("tag");
			const matches =
				(view === "archived" ? Boolean(note.archivedAt) : !note.archivedAt) &&
				(view !== "pinned" || note.isPinned) &&
				(!folderId || note.folderId === folderId) &&
				(!tag || note.tags.some((entry) => normalizeTagName(entry.name) === normalizeTagName(tag)));
			const rows = page.notes.filter((row) => row.id !== note.id);
			if (matches) rows.push(summary);
			rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
			const notes = rows.slice(0, 50);
			const nextCursor = page.nextCursor || rows.length > 50 ? (notes.at(-1)?.id ?? null) : null;
			this.lists.set(url, { ...cached, value: { notes, nextCursor } });
		}
	}

	constructor(
		private userId: string,
		private request = api,
		private changed: (note: NoteDetail, fields: Partial<NoteDraft> & { created?: boolean }) => void = () => {},
	) {}
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	get = (id: string) => this.entries.get(id);
	private publish(id: string, entry: NoteEntry) {
		if (this.disposed) return;
		this.entries.set(id, entry);
		this.generation.set(id, (this.generation.get(id) ?? 0) + 1);
		this.persist(id, entry);
		this.listeners.forEach((listener) => listener());
	}
	private persist(id: string, entry: NoteEntry) {
		if (typeof sessionStorage === "undefined") return;
		try {
			const key = `palace:draft:${this.userId}:${id}`;
			if (entry.creating || Object.keys(draftChanges(entry.draft, entry.baseline)).length)
				sessionStorage.setItem(key, JSON.stringify(entry));
			else sessionStorage.removeItem(key);
		} catch {
			/* In-memory drafts and unload protection remain available if storage is full. */
		}
	}
	private recover(id: string) {
		if (this.entries.has(id) || typeof sessionStorage === "undefined") return;
		try {
			const raw = sessionStorage.getItem(`palace:draft:${this.userId}:${id}`);
			if (!raw) return;
			const entry = JSON.parse(raw) as NoteEntry;
			if (entry.note?.id === id && typeof entry.draft?.contentMarkdown === "string" && entry.baseline) {
				this.publish(id, {
					...entry,
					saveState: "failed",
					error: "Recovered unsaved changes. Retry to save them.",
				});
			}
		} catch {
			/* Ignore unavailable storage. */
		}
	}
	restoreDrafts(): NoteEntry[] {
		if (typeof sessionStorage === "undefined") return [];
		try {
			const prefix = `palace:draft:${this.userId}:`;
			const ids: string[] = [];
			for (let i = 0; i < sessionStorage.length; i++) {
				const key = sessionStorage.key(i);
				if (key?.startsWith(prefix)) ids.push(key.slice(prefix.length));
			}
			for (const id of ids) this.recover(id);
			return ids.flatMap((id) => {
				const entry = this.entries.get(id);
				return entry ? [entry] : [];
			});
		} catch {
			return [];
		}
	}

	seed(note: NoteDetail) {
		const draft = toDraft(note);
		this.publish(note.id, { note, draft, baseline: draft, saveState: "saved", error: "" });
		this.fetched.set(note.id, Date.now());
		this.evict();
	}
	create(folderId: string | null, folder: NoteDetail["folder"] = null): string {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const note: NoteDetail = {
			id,
			title: "",
			contentMarkdown: "",
			createdAt: now,
			updatedAt: now,
			folderId,
			folder,
			isPinned: false,
			archivedAt: null,
			tags: [],
			wikilinks: [],
			backlinks: [],
		};
		const draft = toDraft(note);
		this.publish(id, { note, draft, baseline: draft, creating: true, saveState: "saving", error: "" });
		this.reconcileLists(note);
		void this.flush(id);
		return id;
	}
	private evict() {
		if (this.entries.size <= 100) return;
		for (const [id, entry] of this.entries) {
			if (!entry.creating && entry.saveState === "saved" && !this.saving.has(id) && !this.loading.has(id)) {
				this.entries.delete(id);
				this.fetched.delete(id);
				this.generation.delete(id);
				if (this.entries.size <= 100) break;
			}
		}
	}
	load(id: string, force = false): Promise<void> {
		this.recover(id);
		const entry = this.entries.get(id);
		if (
			entry &&
			(entry.creating ||
				entry.saveState !== "saved" ||
				(!force && Date.now() - (this.fetched.get(id) ?? 0) < 30_000))
		)
			return Promise.resolve();
		const pending = this.loading.get(id);
		if (pending) return pending;
		const generation = this.generation.get(id);
		const work = this.request<NoteDetail>(`/api/notes/${id}`)
			.then((note) => {
				if (this.generation.get(id) === generation) {
					this.seed(note);
					void this.refreshReferences(id);
				}
			})
			.finally(() => {
				this.loading.delete(id);
			});
		this.loading.set(id, work);
		return work;
	}
	async refreshReferences(id: string) {
		const entry = this.entries.get(id);
		if (!entry) return;
		const content = entry.note.contentMarkdown;
		try {
			const references = await this.request<Pick<NoteDetail, "wikilinks" | "backlinks" | "backlinksLimited">>(
				`/api/notes/${id}/references`,
			);
			const current = this.entries.get(id);
			if (!current || current.draft.contentMarkdown !== content || this.disposed) return;
			this.patch(id, { ...references, referencesLoaded: true, referencesError: false });
		} catch {
			this.patch(id, { referencesLoaded: true, referencesError: true });
		}
	}
	prefetch(id: string) {
		void this.load(id).catch(() => {});
	}
	update(id: string, patch: Partial<NoteDraft>) {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.publish(id, { ...entry, draft: { ...entry.draft, ...patch }, saveState: "saving", error: "" });
		const timer = this.timers.get(id);
		if (timer) clearTimeout(timer);
		this.timers.set(
			id,
			setTimeout(() => {
				this.timers.delete(id);
				void this.flush(id);
			}, 800),
		);
	}
	flush(id: string): Promise<void> {
		const timer = this.timers.get(id);
		if (timer) clearTimeout(timer);
		this.timers.delete(id);
		const pending = this.saving.get(id);
		if (pending) return pending;
		const work = this.save(id).finally(() => {
			this.saving.delete(id);
		});
		this.saving.set(id, work);
		return work;
	}
	private async save(id: string) {
		while (!this.disposed) {
			const entry = this.entries.get(id);
			if (!entry) return;
			if (entry.creating) {
				this.publish(id, { ...entry, saveState: "saving", error: "" });
				try {
					const created = await this.request<NoteDetail>("/api/notes", {
						method: "POST",
						body: { id, folderId: entry.note.folderId },
					});
					const current = this.entries.get(id);
					if (!current || this.disposed) return;
					this.publish(id, { ...current, note: created, baseline: toDraft(created), creating: false });
					this.fetched.set(id, Date.now());
					this.reconcileLists(created);
					this.changed(created, { title: created.title, created: true });
					continue;
				} catch (cause) {
					const current = this.entries.get(id);
					if (current)
						this.publish(id, {
							...current,
							saveState: "failed",
							error: errorText(
								cause,
								"Your note could not be created. Your draft is kept here; retry to save it.",
							),
						});
					return;
				}
			}
			const patch = draftChanges(entry.draft, entry.baseline);
			if (!Object.keys(patch).length) {
				const timer = this.timers.get(id);
				if (timer) clearTimeout(timer);
				this.timers.delete(id);
				this.publish(id, { ...entry, saveState: "saved", error: "" });
				return;
			}
			this.publish(id, { ...entry, saveState: "saving", error: "" });
			try {
				const saved = await this.request<Partial<NoteDetail>>(`/api/notes/${id}`, {
					method: "PATCH",
					body: patch,
				});
				const current = this.entries.get(id);
				if (!current || this.disposed) return;
				const note = {
					...current.note,
					...patch,
					archivedAt:
						patch.archived === undefined
							? current.note.archivedAt
							: patch.archived
								? (current.note.archivedAt ?? new Date().toISOString())
								: null,
					...saved,
					tags: saved.tags ?? current.note.tags,
				};
				if (JSON.stringify(note.wikilinks) === JSON.stringify(current.note.wikilinks))
					note.wikilinks = current.note.wikilinks;
				this.publish(id, { ...current, note, baseline: { ...current.baseline, ...patch }, error: "" });
				this.fetched.set(id, Date.now());
				this.reconcileLists(note);
				this.changed(note, patch);
			} catch (cause) {
				const current = this.entries.get(id);
				if (current)
					this.publish(id, {
						...current,
						saveState: "failed",
						error: errorText(cause, "Your changes could not be saved."),
					});
				return;
			}
		}
	}
	patch(id: string, patch: Partial<NoteDetail>) {
		const entry = this.entries.get(id);
		if (!entry) return;
		if (patch.wikilinks && JSON.stringify(patch.wikilinks) === JSON.stringify(entry.note.wikilinks))
			patch = { ...patch, wikilinks: entry.note.wikilinks };
		const note = { ...entry.note, ...patch };
		const server = toDraft(note);
		const keys: Array<keyof NoteDraft> = [];
		if (patch.title !== undefined) keys.push("title");
		if (patch.contentMarkdown !== undefined) keys.push("contentMarkdown");
		if (patch.tags !== undefined) keys.push("tags");
		if (patch.isPinned !== undefined) keys.push("isPinned");
		if (patch.archivedAt !== undefined) keys.push("archived");
		const draft = { ...entry.draft };
		const baseline = { ...entry.baseline };
		for (const key of keys) {
			// Preserve fields the user has edited locally, but acknowledge unrelated server changes.
			if (JSON.stringify(draft[key]) === JSON.stringify(baseline[key]))
				Object.assign(draft, { [key]: server[key] });
			Object.assign(baseline, { [key]: server[key] });
		}
		this.publish(id, { ...entry, note, draft, baseline });
	}
	remove(id: string) {
		const timer = this.timers.get(id);
		if (timer) clearTimeout(timer);
		this.timers.delete(id);
		this.entries.delete(id);
		this.fetched.delete(id);
		this.generation.set(id, (this.generation.get(id) ?? 0) + 1);
		try {
			if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`palace:draft:${this.userId}:${id}`);
		} catch {
			/* Storage may be unavailable. */
		}
		this.listeners.forEach((listener) => listener());
	}
	hasPending() {
		return [...this.entries.values()].some(
			(entry) => entry.creating || Object.keys(draftChanges(entry.draft, entry.baseline)).length,
		);
	}
	flushAll() {
		return Promise.all([...this.entries.keys()].map((id) => this.flush(id)));
	}
	cachedNoteIds(): string[] {
		return [...this.entries.keys()];
	}
	dispose() {
		this.disposed = true;
		this.timers.forEach(clearTimeout);
		this.timers.clear();
		this.entries.clear();
		this.listeners.clear();
	}
}
