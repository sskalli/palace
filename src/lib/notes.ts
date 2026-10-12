import { FolderKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeTagName } from "@/lib/tags";
import {
  parseWikilinks,
  resolveLinkTargets,
} from "@/lib/wikilinks";

export const createNoteSchema = z
  .object({
    title: z.string().max(200).optional().default(""),
    contentMarkdown: z.string().max(500_000).optional().default(""),
    folderId: z.string().min(1).max(100).nullable().optional(),
  })
  .strict();

export const updateNoteSchema = z
  .object({
    title: z.string().max(200).optional(),
    contentMarkdown: z.string().max(500_000).optional(),
    folderId: z.string().min(1).max(100).nullable().optional(),
    isPinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide a field to update.");

const folderSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
const folderUpdateSchema = folderSchema;
const idSchema = z.string().min(1).max(100);

export class NoteServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function ensureInbox(userId: string) {
  let inbox = await db.folder.findFirst({
    where: { userId, kind: FolderKind.INBOX },
  });
  if (!inbox) {
    await db.folder.createMany({
      data: [{ userId, name: "Inbox", kind: FolderKind.INBOX }],
      skipDuplicates: true,
    });
    inbox = await db.folder.findFirst({
      where: { userId, kind: FolderKind.INBOX },
    });
  }
  if (!inbox) throw new Error("Unable to initialize Inbox.");
  return inbox;
}

function preview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#\[\]()!~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export async function getDashboard(userId: string, params: URLSearchParams) {
  await ensureInbox(userId);
  const view = z
    .enum(["inbox", "all", "pinned", "archived"])
    .catch("inbox")
    .parse(params.get("view") ?? "inbox");
  const query = z.string().trim().max(200).catch("").parse(params.get("q") ?? "");
  const tagId = z.string().max(100).optional().parse(params.get("tag") ?? undefined);
  const where: Prisma.NoteWhereInput = { userId };

  if (view === "archived") where.archivedAt = { not: null };
  else {
    where.archivedAt = null;
    if (view === "inbox") {
      const inbox = await ensureInbox(userId);
      where.folderId = inbox.id;
    }
    if (view === "pinned") where.isPinned = true;
  }
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { contentMarkdown: { contains: query, mode: "insensitive" } },
    ];
  }
  if (tagId) where.tags = { some: { tagId, tag: { userId } } };

  const [notes, folders, tags] = await Promise.all([
    db.note.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: query ? 60 : undefined,
      select: {
        id: true,
        title: true,
        contentMarkdown: true,
        isPinned: true,
        archivedAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    }),
    db.folder.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    db.tag.findMany({
      where: { userId },
      orderBy: { normalizedName: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    notes: notes.map((note) => ({
      ...note,
      title: note.title.trim() || "Untitled",
      preview: preview(note.contentMarkdown),
      tags: note.tags.map(({ tag }) => tag),
    })),
    folders,
    tags,
  };
}

export async function getNoteDetails(userId: string, id: string) {
  id = idSchema.parse(id);
  const note = await db.note.findFirst({
    where: { id, userId },
    include: {
      folder: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
      outgoingLinks: {
        include: { targetNote: { select: { id: true, title: true } } },
      },
      incomingLinks: {
        where: { sourceNote: { userId, archivedAt: null } },
        include: {
          sourceNote: {
            select: { id: true, title: true, updatedAt: true },
          },
        },
      },
    },
  });
  if (!note) throw new NoteServiceError("Note not found.", 404);
  return {
    ...note,
    title: note.title.trim() || "",
    tags: note.tags.map(({ tag }) => tag),
    outgoingLinks: note.outgoingLinks.map((link) => ({
      rawTargetTitle: link.rawTargetTitle,
      targetNote: link.targetNote,
    })),
    backlinks: note.incomingLinks.map((link) => link.sourceNote),
  };
}

export async function createNote(userId: string, input: unknown) {
  const data = createNoteSchema.parse(input);
  const inbox = await ensureInbox(userId);
  const folderId = data.folderId ?? inbox.id;
  const folder = await db.folder.findFirst({ where: { id: folderId, userId } });
  if (!folder) throw new NoteServiceError("Folder not found.", 404);
  return db.note.create({
    data: {
      userId,
      folderId: folder.id,
      title: data.title,
      contentMarkdown: data.contentMarkdown,
    },
    select: { id: true },
  });
}

export async function updateNote(userId: string, id: string, input: unknown) {
  id = idSchema.parse(id);
  const data = updateNoteSchema.parse(input);
  const note = await db.note.findFirst({ where: { id, userId } });
  if (!note) throw new NoteServiceError("Note not found.", 404);
  if (data.folderId !== undefined) {
    if (data.folderId === null) {
      throw new NoteServiceError("Choose a folder for this note.", 400);
    }
    const folder = await db.folder.findFirst({
      where: { id: data.folderId, userId },
      select: { id: true },
    });
    if (!folder) throw new NoteServiceError("Folder not found.", 404);
  }

  const update: Prisma.NoteUncheckedUpdateInput = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.contentMarkdown !== undefined) update.contentMarkdown = data.contentMarkdown;
  if (data.folderId !== undefined) update.folderId = data.folderId;
  if (data.isPinned !== undefined) update.isPinned = data.isPinned;
  if (data.archived !== undefined) update.archivedAt = data.archived ? new Date() : null;

  const tags = data.tags
    ? [...new Map(
        data.tags
          .map((name) => [normalizeTagName(name), name.trim()] as const)
          .filter(([normalized]) => normalized),
      ).entries()]
    : undefined;
  const resolvedLinks =
    data.contentMarkdown !== undefined
      ? (() => {
          const targets = parseWikilinks(data.contentMarkdown ?? "");
          return targets;
        })()
      : undefined;

  let linkRows: { rawTargetTitle: string; targetNoteId: string | null }[] = [];
  if (resolvedLinks) {
    const candidates = await db.note.findMany({
      where: { userId, archivedAt: null, id: { not: id } },
      select: { id: true, userId: true, title: true, archivedAt: true },
    });
    const resolved = resolveLinkTargets(userId, resolvedLinks, candidates);
    linkRows = resolvedLinks.map((rawTargetTitle) => ({
      rawTargetTitle,
      targetNoteId: resolved.get(rawTargetTitle) ?? null,
    }));
  }

  await db.$transaction(async (tx) => {
    await tx.note.update({ where: { id }, data: update });
    if (tags) {
      const savedTags = await Promise.all(
        tags.map(([normalizedName, name]) =>
          tx.tag.upsert({
            where: { userId_normalizedName: { userId, normalizedName } },
            create: { userId, name, normalizedName },
            update: {},
            select: { id: true },
          }),
        ),
      );
      await tx.noteTag.deleteMany({ where: { noteId: id } });
      if (savedTags.length) {
        await tx.noteTag.createMany({
          data: savedTags.map(({ id: tagId }) => ({ noteId: id, tagId })),
        });
      }
    }
    if (linkRows.length || resolvedLinks) {
      await tx.noteLink.deleteMany({ where: { sourceNoteId: id } });
      if (linkRows.length) {
        await tx.noteLink.createMany({
          data: linkRows.map((link) => ({ sourceNoteId: id, ...link })),
        });
      }
    }
  });
  return getNoteDetails(userId, id);
}

export async function createFolder(userId: string, input: unknown) {
  const { name } = folderSchema.parse(input);
  if (name.toLocaleLowerCase() === "inbox") {
    throw new NoteServiceError("Inbox is a protected system folder.", 400);
  }
  return db.folder.create({
    data: { userId, name, kind: FolderKind.NORMAL },
    select: { id: true, name: true, kind: true },
  });
}

export async function renameFolder(userId: string, id: string, input: unknown) {
  id = idSchema.parse(id);
  const { name } = folderUpdateSchema.parse(input);
  const folder = await db.folder.findFirst({ where: { id, userId } });
  if (!folder) throw new NoteServiceError("Folder not found.", 404);
  if (folder.kind === FolderKind.INBOX) {
    throw new NoteServiceError("Inbox cannot be renamed.", 400);
  }
  if (name.toLocaleLowerCase() === "inbox") {
    throw new NoteServiceError("That name is reserved for Inbox.", 400);
  }
  return db.folder.update({
    where: { id },
    data: { name },
    select: { id: true, name: true, kind: true },
  });
}

export async function deleteFolder(userId: string, id: string) {
  id = idSchema.parse(id);
  const folder = await db.folder.findFirst({ where: { id, userId } });
  if (!folder) throw new NoteServiceError("Folder not found.", 404);
  if (folder.kind === FolderKind.INBOX) {
    throw new NoteServiceError("Inbox is protected and cannot be deleted.", 400);
  }
  const inbox = await ensureInbox(userId);
  await db.$transaction([
    db.note.updateMany({ where: { folderId: id, userId }, data: { folderId: inbox.id } }),
    db.folder.delete({ where: { id } }),
  ]);
  return { success: true };
}

export async function getExportNotes(userId: string) {
  return db.note.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ folder: { name: "asc" } }, { title: "asc" }],
    include: {
      folder: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  }).then((notes) =>
    notes.map((note) => ({
      ...note,
      tags: note.tags.map(({ tag }) => tag),
    })),
  );
}
