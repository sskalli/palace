-- Trigram indexes let case-insensitive substring search (ILIKE '%q%') avoid scanning every note.
-- Prisma cannot declare these in schema.prisma, so they only live in migrations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Note_title_trgm_idx" ON "Note" USING gin ("title" gin_trgm_ops);

CREATE INDEX "Note_contentMarkdown_trgm_idx" ON "Note" USING gin ("contentMarkdown" gin_trgm_ops);
