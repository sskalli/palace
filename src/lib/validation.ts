import { z } from "zod";

const passwordSchema = z
	.string()
	.min(8)
	.max(72)
	.refine((value) => Buffer.byteLength(value, "utf8") <= 72);

export const noteCreateSchema = z
	.object({
		id: z.string().uuid().optional(),
		title: z.string().max(200).optional().default(""),
		contentMarkdown: z.string().max(100_000).optional().default(""),
		folderId: z.string().trim().min(1).max(100).nullable().optional(),
		tags: z.array(z.string().trim().min(1).max(50)).max(30).optional().default([]),
	})
	.strict();

export const noteUpdateSchema = z
	.object({
		title: z.string().max(200).optional(),
		contentMarkdown: z.string().max(100_000).optional(),
		folderId: z.string().trim().min(1).max(100).nullable().optional(),
		tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
		isPinned: z.boolean().optional(),
		archived: z.boolean().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const folderCreateSchema = z
	.object({
		id: z.string().uuid().optional(),
		name: z.string().trim().min(1).max(80),
		parentId: z.string().trim().min(1).max(100).nullable().optional(),
	})
	.strict();

export const folderUpdateSchema = z
	.object({
		name: z.string().trim().min(1).max(80).optional(),
		parentId: z.string().trim().min(1).max(100).nullable().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const registrationSchema = z
	.object({
		email: z
			.string()
			.trim()
			.email()
			.max(254)
			.transform((value) => value.toLowerCase()),
		name: z.string().trim().max(80).optional().default(""),
		password: passwordSchema,
	})
	.strict();

export const searchQuerySchema = z
	.object({
		q: z.string().trim().max(200).default(""),
	})
	.strict();

export const recordIdSchema = z.string().trim().min(1).max(100);
