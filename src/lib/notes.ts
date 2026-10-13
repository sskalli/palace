import type { Prisma } from "@prisma/client";
import { normalizeTagName, normalizeTagNames } from "@/lib/tags";
import { parseWikilinkTargets, resolveWikilinkTargets } from "@/lib/wikilinks";

type Transaction = Prisma.TransactionClient;

export async function replaceNoteTags(
  transaction: Transaction,
  noteId: string,
  userId: string,
  names: string[],
) {
  const normalizedNames = normalizeTagNames(names);
  const tags = await Promise.all(
    normalizedNames.map((name) => {
      const normalizedName = normalizeTagName(name);
      return transaction.tag.upsert({
        where: { userId_normalizedName: { userId, normalizedName } },
        create: { userId, name, normalizedName },
        update: {},
      });
    }),
  );

  await transaction.noteTag.deleteMany({ where: { noteId } });
  if (tags.length) {
    await transaction.noteTag.createMany({
      data: tags.map(({ id }) => ({ noteId, tagId: id })),
      skipDuplicates: true,
    });
  }
}

export async function refreshNoteLinks(
  transaction: Transaction,
  userId: string,
  sourceNoteId: string,
  markdown: string,
) {
  const targets = parseWikilinkTargets(markdown);
  const candidates = targets.length
    ? await transaction.note.findMany({
        where: { userId, archivedAt: null },
        select: { id: true, userId: true, title: true, archivedAt: true },
      })
    : [];
  const links = resolveWikilinkTargets(userId, targets, candidates);

  await transaction.noteLink.deleteMany({ where: { sourceNoteId } });
  if (links.length) {
    await transaction.noteLink.createMany({
      data: links.map(({ rawTargetTitle, targetNoteId }) => ({
        sourceNoteId,
        rawTargetTitle,
        targetNoteId,
      })),
    });
  }
}

export function noteDetailInclude(userId: string) {
  return {
    folder: { select: { id: true, name: true } },
    noteTags: { include: { tag: { select: { id: true, name: true } } } },
    outgoingLinks: {
      select: {
        rawTargetTitle: true,
        targetNote: { select: { id: true, title: true } },
      },
    },
    incomingLinks: {
      where: { sourceNote: { userId, archivedAt: null } },
      select: {
        sourceNote: { select: { id: true, title: true, updatedAt: true } },
      },
    },
  } satisfies Prisma.NoteInclude;
}

export function serializeNote<T extends {
  noteTags: Array<{ tag: { id: string; name: string } }>;
  outgoingLinks: Array<{
    rawTargetTitle: string;
    targetNote: { id: string; title: string } | null;
  }>;
  incomingLinks?: Array<{ sourceNote: { id: string; title: string; updatedAt: Date } }>;
}>(note: T) {
  return {
    ...note,
    tags: note.noteTags.map(({ tag }) => tag),
    wikilinks: note.outgoingLinks.map(({ rawTargetTitle, targetNote }) => ({
      rawTargetTitle,
      targetNoteId: targetNote?.id ?? null,
      targetTitle: targetNote?.title ?? null,
    })),
    backlinks:
      note.incomingLinks?.map(({ sourceNote }) => sourceNote) ?? [],
  };
}
