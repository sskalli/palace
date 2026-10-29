import { getAuthenticatedUserId, jsonError } from "@/lib/http";
import { searchUserContent } from "@/lib/search";
import { searchQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to search notes and folders.", 401);
	const parsed = searchQuerySchema.safeParse({
		q: new URL(request.url).searchParams.get("q") ?? "",
	});
	if (!parsed.success) return jsonError("Search query is too long.", 400);

	try {
		return Response.json(await searchUserContent(userId, parsed.data.q));
	} catch (error) {
		console.error("Search failed", error);
		return jsonError("Search is temporarily unavailable.", 500);
	}
}
