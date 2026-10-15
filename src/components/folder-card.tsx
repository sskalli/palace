import Link from "next/link";
import { FolderIcon } from "@/components/icons";
import type { FolderSummary } from "@/lib/client-types";

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function FolderCard({ folder, subfolderCount }: { folder: FolderSummary; subfolderCount: number }) {
	return (
		<Link className="note-card folder-card" href={`/?view=all&folder=${encodeURIComponent(folder.id)}`}>
			<div className="note-card-head">
				<span className="pin-mark">
					<FolderIcon size={16} />
				</span>
				<h2 className="note-card-title">{folder.name}</h2>
			</div>
			<div className="note-card-foot">
				<span className="folder-label">
					{plural(folder._count?.notes ?? 0, "note", "notes")} ·{" "}
					{plural(subfolderCount, "subfolder", "subfolders")}
				</span>
			</div>
		</Link>
	);
}
