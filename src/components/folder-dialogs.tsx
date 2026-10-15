"use client";

import { api, errorText } from "@/lib/api-client";
import type { FolderSummary } from "@/lib/client-types";
import { Modal } from "@/components/modal";

export type FolderDialog =
	| { kind: "create"; parent?: FolderSummary }
	| { kind: "rename"; folder: FolderSummary }
	| { kind: "delete"; folder: FolderSummary; subfolderCount: number };

interface FolderDialogsProps {
	dialog: FolderDialog | null;
	onClose: () => void;
	/** Called after a successful change so the sidebar can reload. */
	onChanged: () => Promise<void>;
	onError: (message: string) => void;
	/** Called after a folder is deleted, so the caller can leave its view. */
	onDeleted: (folder: FolderSummary) => void;
}

const nameInput = { label: "Folder name" };

export function FolderDialogs({ dialog, onClose, onChanged, onError, onDeleted }: FolderDialogsProps) {
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
				input={{ ...nameInput, placeholder: "e.g. Projects" }}
				onConfirm={(name) =>
					run(
						() =>
							api("/api/folders", {
								method: "POST",
								body: { name, parentId: dialog.parent?.id ?? null },
							}),
						"The folder could not be created.",
					)
				}
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
				onConfirm={(name) =>
					run(
						() =>
							name === folder.name
								? Promise.resolve()
								: api(`/api/folders/${folder.id}`, { method: "PATCH", body: { name } }),
						"The folder could not be renamed.",
					)
				}
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
