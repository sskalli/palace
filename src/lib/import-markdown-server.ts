import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { makePreview, refreshNoteLinks } from "@/lib/notes";
import {
	availableImportName,
	MarkdownImportError,
	type MarkdownImport,
	type ImportSummary,
} from "@/lib/markdown-import";

/** One transaction means an invalid destination or failed write cannot leave a partial import. */
export async function importMarkdown(userId: string, input: MarkdownImport): Promise<ImportSummary> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await prisma.$transaction(
				async (tx) => {
					if (
						input.folderId &&
						!(await tx.folder.findFirst({ where: { id: input.folderId, userId }, select: { id: true } }))
					)
						throw new MarkdownImportError("Choose a folder belonging to your account.", 404);
					const folders = new Map<string, string>();
					const folderNames = new Map<string | null, Set<string>>();
					const noteNames = new Map<string | null, Set<string>>();
					const created: { id: string; content: string }[] = [];
					for (const file of input.files) {
						let parentId = input.folderId;
						for (let depth = 1; depth < file.path.length; depth++) {
							const key = JSON.stringify(file.path.slice(0, depth));
							let id = folders.get(key);
							if (!id) {
								let used = folderNames.get(parentId);
								if (!used) {
									const siblings = await tx.folder.findMany({
										where: { userId, parentId },
										select: { name: true },
									});
									used = new Set(siblings.map(({ name }) => name.toLocaleLowerCase()));
									folderNames.set(parentId, used);
								}
								const name = availableImportName(file.path[depth - 1], used, 80);
								const folder = await tx.folder.create({
									data: { userId, parentId, name },
									select: { id: true },
								});
								id = folder.id;
								folders.set(key, id);
							}
							parentId = id;
						}
						let used = noteNames.get(parentId);
						if (!used) {
							const siblings = await tx.note.findMany({
								where: { userId, folderId: parentId },
								select: { title: true },
							});
							used = new Set(siblings.map(({ title }) => title.toLocaleLowerCase()));
							noteNames.set(parentId, used);
						}
						const title = availableImportName(file.path[file.path.length - 1].slice(0, -3), used, 200);
						const note = await tx.note.create({
							data: {
								userId,
								folderId: parentId,
								title,
								contentMarkdown: file.content,
								preview: makePreview(file.content),
							},
							select: { id: true },
						});
						created.push({ id: note.id, content: file.content });
					}
					// Resolve only database wikilinks, after all titles exist; never fetch embedded URLs.
					for (const note of created) await refreshNoteLinks(tx, userId, note.id, note.content);
					return { notes: created.length, folders: folders.size, skipped: 0 };
				},
				{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
			);
		} catch (error) {
			// Serializable conflicts can occur when another import/create chooses a sibling name.
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2)
				continue;
			throw error;
		}
	}
}
