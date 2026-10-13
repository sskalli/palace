import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError } from "@/lib/http";

export async function GET() {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to view tags.", 401);

	try {
		const tags = await prisma.tag.findMany({
			where: { userId, noteTags: { some: { note: { archivedAt: null } } } },
			orderBy: { normalizedName: "asc" },
			select: { id: true, name: true, normalizedName: true },
		});
		return Response.json(tags);
	} catch (error) {
		console.error("Tag list failed", error);
		return jsonError("Tags could not be loaded.", 500);
	}
}
