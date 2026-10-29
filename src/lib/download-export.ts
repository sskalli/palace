import type { NoteStore } from "@/lib/note-store";

/** Save drafts before requesting an export so downloaded files include the latest edits. */
export async function downloadMarkdownExport(
	store: Pick<NoteStore, "flush" | "get" | "cachedNoteIds">,
	noteIds: string[] | null,
	selector = "",
	folderIds?: ReadonlySet<string>,
) {
	// The sidebar is paginated; cached drafts can include notes absent from its snapshot.
	const ids =
		noteIds ??
		store.cachedNoteIds().filter((id) => {
			const folderId = store.get(id)?.note.folderId;
			return !folderIds || (folderId != null && folderIds.has(folderId));
		});
	await Promise.all(ids.map((id) => store.flush(id)));
	if (ids.some((id) => store.get(id)?.saveState === "failed")) {
		throw new Error("Save your changes before downloading notes.");
	}
	const response = await fetch(`/api/export/markdown${selector}`);
	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		throw new Error(payload?.error || "The download could not be generated.");
	}
	const disposition = response.headers.get("Content-Disposition") ?? "";
	const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	const filename = encodedName
		? decodeURIComponent(encodedName)
		: (disposition.match(/filename="([^"]+)"/i)?.[1] ?? "palace-notes.zip");
	const url = URL.createObjectURL(await response.blob());
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
