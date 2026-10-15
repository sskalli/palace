-- AlterTable
ALTER TABLE "Note" ADD COLUMN "preview" TEXT NOT NULL DEFAULT '';

-- Backfill previews so lists no longer need to read the full note body.
UPDATE "Note" SET "preview" = left(btrim(regexp_replace("contentMarkdown", '\s+', ' ', 'g')), 180);

-- CreateIndex
CREATE INDEX "Note_userId_archivedAt_title_idx" ON "Note"("userId", "archivedAt", "title");

-- CreateIndex
CREATE INDEX "Note_userId_title_idx" ON "Note"("userId", "title");
