export interface FolderLike {
	id: string;
	parentId: string | null;
}

export type FolderNode<T extends FolderLike> = T & { children: FolderNode<T>[] };

/** Nests a flat folder list. Folders whose parent is missing are treated as roots. Keeps the input order. */
export function buildFolderTree<T extends FolderLike>(folders: T[]): FolderNode<T>[] {
	const nodes = new Map<string, FolderNode<T>>(folders.map((folder) => [folder.id, { ...folder, children: [] }]));
	const roots: FolderNode<T>[] = [];
	for (const node of nodes.values()) {
		const parent = node.parentId ? nodes.get(node.parentId) : undefined;
		(parent ? parent.children : roots).push(node);
	}
	return roots;
}

/** The folder and its ancestors, from the root down. Empty when the folder does not exist. */
export function folderPath<T extends FolderLike>(folders: T[], id: string | null): T[] {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const path: T[] = [];
	const seen = new Set<string>();
	let current = id ? byId.get(id) : undefined;
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return path;
}

/** True when `id` is `ancestorId` itself or sits anywhere below it. */
export function isSameOrDescendant(folders: FolderLike[], id: string, ancestorId: string): boolean {
	return folderPath(folders, id).some((folder) => folder.id === ancestorId);
}

/** Ids of every folder below `id` (not including `id`). */
export function descendantIds(folders: FolderLike[], id: string): string[] {
	const result: string[] = [];
	const queue = [id];
	while (queue.length) {
		const parent = queue.shift();
		for (const folder of folders) {
			if (folder.parentId === parent && folder.id !== id && !result.includes(folder.id)) {
				result.push(folder.id);
				queue.push(folder.id);
			}
		}
	}
	return result;
}
