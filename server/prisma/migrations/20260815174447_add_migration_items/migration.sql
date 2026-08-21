-- CreateEnum
CREATE TYPE "MigrationItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "MigrationItem" (
    "id" TEXT NOT NULL,
    "migrationJobId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "destFileId" TEXT,
    "destFolderId" TEXT,
    "status" "MigrationItemStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MigrationItem_migrationJobId_idx" ON "MigrationItem"("migrationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationItem_migrationJobId_sourceFileId_key" ON "MigrationItem"("migrationJobId", "sourceFileId");

-- AddForeignKey
ALTER TABLE "MigrationItem" ADD CONSTRAINT "MigrationItem_migrationJobId_fkey" FOREIGN KEY ("migrationJobId") REFERENCES "MigrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
