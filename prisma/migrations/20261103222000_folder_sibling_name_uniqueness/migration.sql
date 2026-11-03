CREATE UNIQUE INDEX "Folder_userId_parentId_name_key"
ON "Folder" ("userId", "parentId", "name");

CREATE UNIQUE INDEX "Folder_userId_root_name_key"
ON "Folder" ("userId", "name")
WHERE "parentId" IS NULL;
