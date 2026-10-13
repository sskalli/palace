import Link from "next/link";
import { FolderIcon, PinIcon } from "@/components/icons";
import type { NoteSummary } from "@/lib/client-types";

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	if (date.toDateString() === new Date().toDateString()) return "Today";
	return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function NoteCard({ note }: { note: NoteSummary }) {
	return (
		<Link className="note-card" href={`/notes/${note.id}`}>
			<div className="note-card-head">
				<h2 className="note-card-title">{note.title}</h2>
				{note.isPinned && (
					<span className="pin-mark" title="Pinned">
						<PinIcon size={13} filled />
					</span>
				)}
			</div>
			<p className="note-preview">{note.preview || "No content yet. Open this note to add your thoughts."}</p>
			<div className="note-card-foot">
				<span className="folder-label">
					<FolderIcon size={12} />
					{note.folder?.name ?? "No folder"}
				</span>
				<div className="card-tags">
					{note.tags.slice(0, 2).map((item) => (
						<span className="card-tag" key={item.id}>
							{item.name}
						</span>
					))}
				</div>
				<span className="updated-label">{formatDate(note.updatedAt)}</span>
			</div>
		</Link>
	);
}
