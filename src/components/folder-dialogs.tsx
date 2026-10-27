"use client";

import { api, errorText } from "@/lib/api-client";
import type { FolderSummary } from "@/lib/client-types";
import { Modal } from "@/components/modal";

export type FolderDialog =
	| { kind: "create"; parent?: FolderSummary; id?: string; initialName?: string }
	| { kind: "rename"; folder: FolderSummary }
	| { kind: "delete"; folder: FolderSummary; subfolderCount: number };

interface FolderDialogsProps {
	dialog: FolderDialog | null;
	onClose: () => void;
	/** Called after a successful change so the sidebar can reload. */
	onChanged: () => Promise<void>;
	onUpsert: (folder: FolderSummary) => void;
	onRemove: (id: string) => void;
	onRecover: (dialog: FolderDialog) => void;
	onError: (message: string) => void;
	/** Called after a folder is deleted, so the caller can leave its view. */
	onDeleted: (folder: FolderSummary) => void;
}

const nameInput = { label: "Folder name" };

export function FolderDialogs({
	dialog,
	onClose,
	onChanged,
	onError,
	onDeleted,
	onUpsert,
	onRemove,
	onRecover,
}: FolderDialogsProps) {
	// Runs a folder request; closes the dialog and refreshes on success, reports the error otherwise.
	async function run(request: () => Promise<unknown>, fallback: string) {
		try {
			await request();
		} catch (cause) {
			onError(errorText(cause, fallback));
			return;
		}
		onClose();
		await onChanged();
	}

	if (!dialog) return null;

	if (dialog.kind === "create") {
		return (
			<Modal
				title={dialog.parent ? `New subfolder in “${dialog.parent.name}”` : "New folder"}
				confirmLabel="Create"
				input={{ ...nameInput, placeholder: "e.g. Projects", initialValue: dialog.initialName }}
				onConfirm={async (name) => {
					const id = dialog.id ?? crypto.randomUUID();
					const folder: FolderSummary = {
						id,
						name,
						parentId: dialog.parent?.id ?? null,
						_count: { notes: 0 },
						pending: true,
					};
					onUpsert(folder);
					onClose();
					try {
						const saved = await api<FolderSummary>("/api/folders", {
							method: "POST",
							body: { id, name, parentId: folder.parentId },
						});
						onUpsert({ ...saved, _count: { notes: 0 } });
					} catch (cause) {
						onRemove(id);
						onError(errorText(cause, "The folder could not be created."));
						onRecover({ ...dialog, id, initialName: name });
					}
				}}
				onClose={onClose}
			/>
		);
	}

	const { folder } = dialog;

	if (dialog.kind === "rename") {
		return (
			<Modal
				title="Rename folder"
				confirmLabel="Rename"
				input={{ ...nameInput, initialValue: folder.name }}
				onConfirm={async (name) => {
					onUpsert({ ...folder, name });
					onClose();
					try {
						const saved =
							name === folder.name
								? folder
								: await api<FolderSummary>(`/api/folders/${folder.id}`, {
										method: "PATCH",
										body: { name },
									});
						onUpsert({ ...folder, ...saved });
					} catch (cause) {
						onUpsert(folder);
						onError(errorText(cause, "The folder could not be renamed."));
					}
				}}
				onClose={onClose}
			/>
		);
	}

	const { subfolderCount } = dialog;
	const consequence =
		subfolderCount > 0
			? `“${folder.name}” and its ${subfolderCount} ${subfolderCount === 1 ? "subfolder" : "subfolders"} will be deleted. Their notes are kept and stay in All notes.`
			: `“${folder.name}” will be deleted. Its notes are kept and stay in All notes.`;

	return (
		<Modal
			title="Delete folder?"
			description={consequence}
			confirmLabel="Delete"
			danger
			onConfirm={() =>
				run(async () => {
					await api(`/api/folders/${folder.id}`, { method: "DELETE" });
					onDeleted(folder);
				}, "The folder could not be deleted.")
			}
			onClose={onClose}
		/>
	);
}
