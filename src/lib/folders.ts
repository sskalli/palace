import type { Prisma } from "@prisma/client";

/** A folder rule violation that should be reported to the user with this HTTP status. */
export class FolderError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

/** Throws unless a sibling folder with this name does not already exist under `parentId`. */
export async function ensureNameFree(
	transaction: Prisma.TransactionClient,
	userId: string,
	parentId: string | null,
	name: string,
	excludeId?: string,
): Promise<void> {
	const clash = await transaction.folder.findFirst({
		where: { userId, parentId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { id: true },
	});
	if (clash) throw new FolderError("A folder with this name already exists here.", 409);
}

export function folderErrorResponse(error: unknown): Response | null {
	return error instanceof FolderError ? Response.json({ error: error.message }, { status: error.status }) : null;
}
