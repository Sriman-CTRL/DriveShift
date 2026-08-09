-- AlterTable
ALTER TABLE "MigrationJob" ADD COLUMN     "destFolderId" TEXT,
ADD COLUMN     "sourceFolderId" TEXT,
ALTER COLUMN "sourceFileId" DROP NOT NULL;
