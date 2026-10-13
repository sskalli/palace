-- Notes in the old Inbox become unfiled; the Inbox folders are removed.
DELETE FROM "Folder" WHERE "kind" = 'INBOX';

-- AlterTable
ALTER TABLE "Folder" DROP COLUMN "kind";

-- DropEnum
DROP TYPE "FolderKind";
