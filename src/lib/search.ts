import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NOTE_SEARCH_LIMIT = 30;

export async function searchUserNotes(userId: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const notes = await prisma.note.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { title: { contains: trimmedQuery, mode: "insensitive" } },
        { contentMarkdown: { contains: trimmedQuery, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: NOTE_SEARCH_LIMIT,
    include: {
      folder: { select: { id: true, name: true } },
      noteTags: { include: { tag: { select: { id: true, name: true } } } },
    },
  });

  return notes.map((note) => ({
    id: note.id,
    title: note.title.trim() || "Untitled note",
    preview: getSearchPreview(note.contentMarkdown, trimmedQuery),
    folder: note.folder,
    tags: note.noteTags.map(({ tag }) => tag),
    updatedAt: note.updatedAt,
  }));
}

export function getSearchPreview(content: string, query: string): string {
  const plainText = content.replace(/[#>*_`~[\]()!|-]/g, " ").replace(/\s+/g, " ").trim();
  const index = plainText.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return plainText.slice(0, 150);

  const start = Math.max(0, index - 55);
  const end = Math.min(plainText.length, index + query.length + 90);
  return `${start > 0 ? "…" : ""}${plainText.slice(start, end)}${end < plainText.length ? "…" : ""}`;
}

export function noteSearchWhere(userId: string, query: string): Prisma.NoteWhereInput {
  return {
    userId,
    archivedAt: null,
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { contentMarkdown: { contains: query, mode: "insensitive" } },
    ],
  };
}
