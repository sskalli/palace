import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError } from "@/lib/http";

export async function GET() {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view tags.", 401);

	try {
		const tags = await prisma.$queryRaw<Array<{ id: string; name: string; normalizedName: string }>>`
			SELECT t."id", t."name", t."normalizedName"
			FROM "Tag" t
			WHERE t."userId" = ${userId}
				AND EXISTS (
					SELECT 1 FROM "NoteTag" nt
					JOIN "Note" n ON n."id" = nt."noteId" AND n."archivedAt" IS NULL
					WHERE nt."tagId" = t."id"
				)
			ORDER BY t."normalizedName"`;
		return Response.json(tags);
	} catch (error) {
		console.error("Tag list failed", error);
		return jsonError("Tags could not be loaded.", 500);
	}
}
