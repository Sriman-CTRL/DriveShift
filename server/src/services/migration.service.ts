import prisma from "../config/prisma";
import { googleDriveService } from "../providers/google/drive.service";

export type MigrationJobStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED";

export type CreateMigrationJobInput = {
    userId: string;
    sourceAccountId: string;
    destAccountId: string;
    sourceFolderId?: string;
    sourceFileId?: string;
};

type AccountContext = {
    accessToken: string | null;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
    userId: string;
    providerUserId: string;
};

class MigrationService {

    async createMigrationJob(input: CreateMigrationJobInput) {
        return prisma.migrationJob.create({
            data: {
                userId: input.userId,
                sourceAccountId: input.sourceAccountId,
                destAccountId: input.destAccountId,
                sourceFolderId: input.sourceFolderId,
                sourceFileId: input.sourceFileId,
                status: "PENDING",
            },
        });
    }

    private async countFolderItems(
        account: AccountContext,
        folderId: string
    ): Promise<{
        files: number;
        folders: number;
    }> {
        let files = 0;
        let folders = 1;

        const children = await googleDriveService.listChildren(
            account,
            folderId
        );

        for (const child of children) {
            if (
                child.mimeType ===
                "application/vnd.google-apps.folder"
            ) {
                const result = await this.countFolderItems(
                    account,
                    child.id!
                );

                files += result.files;
                folders += result.folders;
            } else {
                files++;
            }
        }

        return {
            files,
            folders,
        };
    }

    async executeMigration(jobId: string) {
        const job = await prisma.migrationJob.findUnique({
            where: { id: jobId },
        });

        if (!job) {
            throw new Error("Migration job not found");
        }

        await prisma.migrationJob.update({
            where: { id: jobId },
            data: {
                status: "IN_PROGRESS",
                progress: 0,
            },
        });

        try {
            const sourceAccount =
                await prisma.connectedAccount.findUnique({
                    where: { id: job.sourceAccountId },
                });

            const destAccount =
                await prisma.connectedAccount.findUnique({
                    where: { id: job.destAccountId },
                });

            if (
                !sourceAccount?.accessToken ||
                !destAccount?.accessToken
            ) {
                throw new Error(
                    "Source or destination Google account is not connected"
                );
            }

            const sourceContext: AccountContext = {
                accessToken: sourceAccount.accessToken,
                refreshToken: sourceAccount.refreshToken,
                tokenExpiry: sourceAccount.tokenExpiry,
                userId: sourceAccount.userId,
                providerUserId: sourceAccount.providerUserId,
            };

            const destContext: AccountContext = {
                accessToken: destAccount.accessToken,
                refreshToken: destAccount.refreshToken,
                tokenExpiry: destAccount.tokenExpiry,
                userId: destAccount.userId,
                providerUserId: destAccount.providerUserId,
            };

            /*
             * FOLDER MIGRATION
             */
            if (job.sourceFolderId) {

                // First count everything.
                const totals = await this.countFolderItems(
                    sourceContext,
                    job.sourceFolderId
                );

                await prisma.migrationJob.update({
                    where: { id: jobId },
                    data: {
                        totalFiles: totals.files,
                        completedFiles: 0,
                        totalFolders: totals.folders,
                        completedFolders: 0,
                        progress: 0,
                    },
                });

                let completedFiles = 0;
                let completedFolders = 0;

                const destinationFolder =
                    await googleDriveService.migrateFolder(
                        sourceContext,
                        destContext,
                        job.sourceFolderId,
                        undefined,
                        async (progress) => {
                            completedFiles = progress.files;
                            completedFolders = progress.folders;

                            const totalItems =
                                totals.files +
                                totals.folders;

                            const completedItems =
                                completedFiles +
                                completedFolders;

                            const percentage =
                                totalItems === 0
                                    ? 100
                                    : Math.min(
                                        99,
                                        Math.floor(
                                            (completedItems /
                                                totalItems) *
                                            100
                                        )
                                    );

                            await prisma.migrationJob.update({
                                where: { id: jobId },
                                data: {
                                    completedFiles,
                                    completedFolders,
                                    progress: percentage,
                                },
                            });
                        }
                    );

                await prisma.migrationJob.update({
                    where: { id: jobId },
                    data: {
                        status: "COMPLETED",

                        totalFiles: totals.files,
                        completedFiles: totals.files,

                        totalFolders: totals.folders,
                        completedFolders: totals.folders,

                        progress: 100,

                        destFolderId:
                            destinationFolder.id,

                        sourceFileName:
                            destinationFolder.name,
                    },
                });

                return {
                    id: job.id,
                    status: "COMPLETED",
                    progress: 100,

                    totalFiles: totals.files,
                    completedFiles: totals.files,

                    totalFolders: totals.folders,
                    completedFolders: totals.folders,

                    destFolderId:
                        destinationFolder.id,

                    sourceFolderName:
                        destinationFolder.name,
                };
            }

            /*
             * SINGLE FILE MIGRATION
             */
            if (job.sourceFileId) {

                await prisma.migrationJob.update({
                    where: { id: jobId },
                    data: {
                        totalFiles: 1,
                        completedFiles: 0,
                        progress: 0,
                    },
                });

                const uploadedFile =
                    await googleDriveService.migrateFile(
                        sourceContext,
                        destContext,
                        job.sourceFileId
                    );

                await prisma.migrationJob.update({
                    where: { id: jobId },
                    data: {
                        status: "COMPLETED",

                        totalFiles: 1,
                        completedFiles: 1,
                        progress: 100,

                        destFileId:
                            uploadedFile.id,

                        sourceFileName:
                            uploadedFile.name,

                        sourceFileMimeType:
                            uploadedFile.mimeType,
                    },
                });

                return {
                    id: job.id,
                    status: "COMPLETED",
                    progress: 100,

                    totalFiles: 1,
                    completedFiles: 1,

                    destFileId:
                        uploadedFile.id,

                    sourceFileName:
                        uploadedFile.name,

                    sourceFileMimeType:
                        uploadedFile.mimeType,
                };
            }

            throw new Error(
                "Migration job must contain either sourceFolderId or sourceFileId"
            );

        } catch (error) {

            await prisma.migrationJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    errorMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown migration error",
                },
            });

            throw error;
        }
    }
}

export const migrationService =
    new MigrationService();