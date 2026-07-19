import prisma from "../config/prisma";
import { googleDriveService } from "../providers/google/drive.service";

export type MigrationJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type CreateMigrationJobInput = {
    userId: string;
    sourceAccountId: string;
    destAccountId: string;
    sourceFileId: string;
};

class MigrationService {
    async createMigrationJob(input: CreateMigrationJobInput) {
        return prisma.migrationJob.create({
            data: {
                userId: input.userId,
                sourceAccountId: input.sourceAccountId,
                destAccountId: input.destAccountId,
                sourceFileId: input.sourceFileId,
                status: "PENDING",
            },
        });
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
            data: { status: "IN_PROGRESS" },
        });

        try {
            const sourceAccount = await prisma.connectedAccount.findUnique({
                where: { id: job.sourceAccountId },
            });

            const destAccount = await prisma.connectedAccount.findUnique({
                where: { id: job.destAccountId },
            });

            if (!sourceAccount?.accessToken || !destAccount?.accessToken) {
                throw new Error("Source or destination Google account is not connected");
            }

            const uploadedFile = await googleDriveService.migrateFile(
                {
                    accessToken: sourceAccount.accessToken,
                    refreshToken: sourceAccount.refreshToken,
                    tokenExpiry: sourceAccount.tokenExpiry,
                    userId: sourceAccount.userId,
                    providerUserId: sourceAccount.providerUserId,
                },
                {
                    accessToken: destAccount.accessToken,
                    refreshToken: destAccount.refreshToken,
                    tokenExpiry: destAccount.tokenExpiry,
                    userId: destAccount.userId,
                    providerUserId: destAccount.providerUserId,
                },
                job.sourceFileId
            );

            await prisma.migrationJob.update({
                where: { id: jobId },
                data: {
                    status: "COMPLETED",
                    destFileId: uploadedFile.id,
                    sourceFileName: uploadedFile.name,
                    sourceFileMimeType: uploadedFile.mimeType,
                },
            });

            return {
                id: job.id,
                status: "COMPLETED",
                destFileId: uploadedFile.id,
                sourceFileName: uploadedFile.name,
                sourceFileMimeType: uploadedFile.mimeType,
            };
        } catch (error) {
            await prisma.migrationJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    errorMessage: error instanceof Error ? error.message : "Unknown migration error",
                },
            });

            throw error;
        }
    }
}

export const migrationService = new MigrationService();
