-- Folder names only need to be unique among siblings; the application enforces that.
DROP INDEX "Folder_userId_name_key";

-- CreateIndex
CREATE INDEX "Folder_userId_parentId_idx" ON "Folder"("userId", "parentId");
