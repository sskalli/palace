"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api-client";
import { captureDropSources, collectMarkdownDrop } from "@/lib/collect-markdown-drop";
import { IMPORT_LIMITS, type ImportSummary } from "@/lib/markdown-import";

export function WorkspaceImport({
	folderId,
	folderName,
	onImported,
}: {
	folderId: string | null;
	folderName?: string;
	onImported: () => Promise<void>;
}) {
	const [dragging, setDragging] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const importing = useRef(false);
	const latest = useRef({ folderId, onImported });
	useEffect(() => {
		latest.current = { folderId, onImported };
	}, [folderId, onImported]);

	useEffect(() => {
		let depth = 0;
		let resetTimer: number | undefined;
		const external = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
		const reset = () => {
			depth = 0;
			setDragging(false);
		};
		const enter = (event: DragEvent) => {
			if (!external(event)) return;
			event.preventDefault();
			depth++;
			setDragging(true);
		};
		const over = (event: DragEvent) => {
			if (!external(event)) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = importing.current ? "none" : "copy";
			setDragging(true);
			window.clearTimeout(resetTimer);
			// Some browser/OS combinations omit dragleave when a drag is cancelled outside the window.
			resetTimer = window.setTimeout(reset, 1500);
		};
		const leave = (event: DragEvent) => {
			if (!external(event)) return;
			if (--depth <= 0) reset();
		};
		const drop = (event: DragEvent) => {
			if (!external(event) || !event.dataTransfer) return;
			event.preventDefault();
			event.stopPropagation();
			reset();
			if (importing.current) return;
			// Snapshot the destination and all transfer handles before the first await.
			const destination = latest.current.folderId;
			let sources: ReturnType<typeof captureDropSources>;
			try {
				sources = captureDropSources(event.dataTransfer);
			} catch {
				setMessage("The dropped files could not be read. Nothing was imported.");
				return;
			}
			importing.current = true;
			setBusy(true);
			setMessage("");
			void (async () => {
				try {
					const { files, skipped } = await collectMarkdownDrop(sources);
					const body = { folderId: destination, files };
					if (new TextEncoder().encode(JSON.stringify(body)).byteLength > IMPORT_LIMITS.requestBytes)
						throw new Error("The import is too large. Drop fewer Markdown files at a time.");
					const result = await api<ImportSummary>("/api/import/markdown", { method: "POST", body });
					window.dispatchEvent(new CustomEvent("palace:notes-changed"));
					let refreshFailed = false;
					try {
						await latest.current.onImported();
					} catch {
						refreshFailed = true;
					}
					const ignored = skipped + result.skipped;
					setMessage(
						`Imported ${result.notes} note${result.notes === 1 ? "" : "s"} and ${result.folders} folder${result.folders === 1 ? "" : "s"}.${ignored ? ` Skipped ${ignored} non-Markdown file${ignored === 1 ? "" : "s"}.` : ""}${refreshFailed ? " Refresh the page to see your imported notes." : ""}`,
					);
				} catch (error) {
					setMessage(errorText(error, "The files could not be imported. Nothing was imported."));
				} finally {
					importing.current = false;
					setBusy(false);
				}
			})();
		};
		window.addEventListener("dragenter", enter, true);
		window.addEventListener("dragover", over, true);
		window.addEventListener("dragleave", leave, true);
		window.addEventListener("drop", drop, true);
		window.addEventListener("dragend", reset);
		window.addEventListener("blur", reset);
		return () => {
			window.clearTimeout(resetTimer);
			window.removeEventListener("dragenter", enter, true);
			window.removeEventListener("dragover", over, true);
			window.removeEventListener("dragleave", leave, true);
			window.removeEventListener("drop", drop, true);
			window.removeEventListener("dragend", reset);
			window.removeEventListener("blur", reset);
		};
	}, []);

	return (
		<>
			{(dragging || busy) && (
				<div className="workspace-import-overlay" role="status" aria-live="polite">
					<div className="workspace-import-card">
						<span className="workspace-import-symbol" aria-hidden="true">
							↓
						</span>
						<h2>{busy ? "Importing your notes…" : "Drop your Markdown files and folders here"}</h2>
						<p>
							{busy
								? "Keep this window open while your files are imported."
								: `Import into ${folderName || "your workspace"}. Folder structure is preserved.`}
						</p>
						<p className="workspace-import-hint">
							Only .md files · Up to 100 files · 100 KB per file · 2 MB total
						</p>
					</div>
				</div>
			)}
			{message && (
				<div className="workspace-import-result" role="status">
					<span>{message}</span>
					<button type="button" aria-label="Dismiss import result" onClick={() => setMessage("")}>
						×
					</button>
				</div>
			)}
		</>
	);
}
