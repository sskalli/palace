import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError } from "@/lib/http";
import { recordIdSchema } from "@/lib/validation";
import { resolveLiveWikilinks } from "@/lib/notes";

/** Secondary data must never block mounting an editable note. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const userId = await getAuthenticatedUserId();
 if (!userId) return jsonError("Sign in to view this note.", 401);
 const parsed = recordIdSchema.safeParse((await params).id);
 if (!parsed.success) return jsonError("Invalid note ID.", 400);
 try {
  const note = await prisma.note.findFirst({
   where: { id: parsed.data, userId },
   select: {
    contentMarkdown: true,
    incomingLinks: {
     where: { sourceNote: { userId, archivedAt: null } },
     take: 100,
     orderBy: { id: "asc" },
     select: { sourceNote: { select: { id: true, title: true, updatedAt: true } } },
    },
   },
  });
  if (!note) return jsonError("Note not found.", 404);
  const { wikilinks } = await resolveLiveWikilinks(userId, { contentMarkdown: note.contentMarkdown, wikilinks: [] });
  return Response.json({ wikilinks, backlinks: note.incomingLinks.map(link => link.sourceNote), backlinksLimited: note.incomingLinks.length === 100 });
 } catch (error) {
  console.error("Note references failed", error);
  return jsonError("Linked notes could not be loaded.", 500);
 }
}
