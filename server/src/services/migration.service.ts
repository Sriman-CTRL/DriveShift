import prisma from "../config/prisma";
import { FileResult, googleDriveService } from "../providers/google/drive.service";
import { migrationQueue } from "../migration/queue";

export type MigrationJobStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";

/**
 * Thrown when a migration detects that the job has been cancelled via
 * cooperative cancellation checks against Postgres. The worker's `failed`
 * event handler must NOT overwrite CANCELLED → FAILED when it sees this.
 */
export class MigrationCancelledError extends Error {
    constructor(jobId: string) {
        super(`Migration job ${jobId} was cancelled`);
        this.name = "MigrationCancelledError";
    }
}

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

    /**
     * Cancel a migration job.
     *
     * 1. Verifies ownership and current status.
     * 2. Marks the Postgres record CANCELLED.
     * 3. If the BullMQ job is still waiting/delayed (not yet executing), removes
     *    it from the queue so the worker never picks it up.
     * 4. If the worker is already executing the job, cooperative cancellation
     *    inside executeMigration() will detect the CANCELLED status on the next
     *    periodic check and stop gracefully.
     */
    async cancelMigrationJob(jobId: string, userId: string) {
        const job = await prisma.migrationJob.findUnique({
            where: { id: jobId },
        });

        if (!job || job.userId !== userId) {
            return { notFound: true } as const;
        }

        if (
            job.status === "COMPLETED" ||
            job.status === "FAILED" ||
            job.status === "CANCELLED"
        ) {
            return { invalidState: true, status: job.status } as const;
        }

        // Mark cancelled in Postgres first so the worker sees it on its next
        // cooperative check even if the queue removal below fails.
        const updatedJob = await prisma.migrationJob.update({
            where: { id: jobId },
            data: {
                status: "CANCELLED",
                errorMessage: "Migration cancelled by user",
            },
        });

        // Try to remove the BullMQ job if it is still in the queue (PENDING
        // state means it hasn't been picked up by the worker yet).
        if (job.status === "PENDING") {
            try {
                const bullJobs = await migrationQueue.getJobs(
                    ["waiting", "delayed", "prioritized"]
                );

                const bullJob = bullJobs.find(
                    (bj) => bj.data?.jobId === jobId
                );

                if (bullJob) {
                    await bullJob.remove();
                    console.log(
                        `[MigrationService] Removed BullMQ job ${bullJob.id} ` +
                        `for cancelled migration ${jobId}`
                    );
                }
            } catch (err) {
                // Non-fatal — the worker will still detect cancellation via
                // the Postgres status on its next cooperative check.
                console.warn(
                    `[MigrationService] Could not remove BullMQ job for ` +
                    `migration ${jobId}:`,
                    err
                );
            }
        }

        return { success: true, job: updatedJob } as const;
    }

    /**
     * Cooperative cancellation check.
     * Reads the current status of the job from Postgres and throws
     * MigrationCancelledError if it has been set to CANCELLED.
     * Called periodically inside executeMigration() so that a running worker
     * can stop cleanly without being force-killed.
     */
    private async checkCancelled(jobId: string): Promise<void> {
        const current = await prisma.migrationJob.findUnique({
            where: { id: jobId },
            select: { status: true },
        });

        if (current?.status === "CANCELLED") {
            throw new MigrationCancelledError(jobId);
        }
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

        // ── Cooperative cancellation check (BEFORE setting IN_PROGRESS) ────
        // If the job was cancelled while sitting in the BullMQ queue, its
        // Postgres status is already CANCELLED. We must NOT overwrite that
        // with IN_PROGRESS. Check first, then transition.
        await this.checkCancelled(jobId);

        await prisma.migrationJob.update({
            where: { id: jobId },
            data: {
                status: "IN_PROGRESS",
                progress: 0,
            },
        });

        try {
            // ── Cooperative cancellation check (post IN_PROGRESS) ───────────
            // Guard against a cancel that races in the tiny window between
            // the pre-check above and setting IN_PROGRESS.
            await this.checkCancelled(jobId);

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

                // Count total items for progress tracking.
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

                /*
                 * Idempotency: pre-load existing MigrationItems for this job.
                 * Files that are already COMPLETED will be skipped by onFileStart.
                 * completedFiles is pre-seeded from the prior-run count so that
                 * the progress bar starts at the right place on a retry.
                 */
                const existingItems = await prisma.migrationItem.findMany({
                    where: { migrationJobId: jobId },
                    select: { sourceFileId: true, status: true },
                });
                const existingItemMap = new Map(
                    existingItems.map((i) => [i.sourceFileId, i.status])
                );

                // completedFiles = only successful migrations (prior + this run).
                let completedFiles = existingItems.filter(
                    (i) => i.status === "COMPLETED"
                ).length;
                let completedFolders = 0;

                /**
                 * Called BEFORE each file migration attempt.
                 *
                 * - Returns true  → file is already COMPLETED; skip it.
                 * - Returns false → upserts MigrationItem to IN_PROGRESS and proceeds.
                 *
                 * Uses the pre-loaded in-memory map (O(1)) to avoid a DB round-trip
                 * per file on the hot path.
                 */
                const onFileStart = async (file: {
                    sourceFileId: string;
                    sourceFileName: string;
                    sourceMimeType: string;
                }): Promise<boolean> => {
                    // ── Cooperative cancellation check (per file) ───────────
                    await this.checkCancelled(jobId);

                    const existingStatus = existingItemMap.get(
                        file.sourceFileId
                    );

                    if (existingStatus === "COMPLETED") {
                        // Already successfully migrated in a prior run — skip.
                        return true;
                    }

                    // Create or reset the item to IN_PROGRESS for this attempt.
                    await prisma.migrationItem.upsert({
                        where: {
                            migrationJobId_sourceFileId: {
                                migrationJobId: jobId,
                                sourceFileId: file.sourceFileId,
                            },
                        },
                        create: {
                            migrationJobId: jobId,
                            sourceFileId: file.sourceFileId,
                            sourceFileName: file.sourceFileName,
                            sourceMimeType: file.sourceMimeType,
                            status: "IN_PROGRESS",
                        },
                        update: {
                            status: "IN_PROGRESS",
                            sourceFileName: file.sourceFileName,
                            sourceMimeType: file.sourceMimeType,
                        },
                    });

                    return false;
                };

                /**
                 * Called AFTER each file migration attempt (success or failure).
                 *
                 * - Updates MigrationItem to COMPLETED or FAILED.
                 * - Only increments completedFiles for successes (not failures).
                 *   This keeps completedFiles semantically correct: "files successfully
                 *   moved", not "files attempted".
                 */
                const onFileResult = async (
                    result: FileResult
                ): Promise<void> => {
                    await prisma.migrationItem.update({
                        where: {
                            migrationJobId_sourceFileId: {
                                migrationJobId: jobId,
                                sourceFileId: result.sourceFileId,
                            },
                        },
                        data: {
                            status: result.status,
                            destFileId: result.destFileId ?? null,
                            errorMessage: result.errorMessage ?? null,
                        },
                    });

                    if (result.status === "COMPLETED") {
                        completedFiles++;
                    }
                };

                const migrationResult =
                    await googleDriveService.migrateFolder(
                        sourceContext,
                        destContext,
                        job.sourceFolderId,
                        undefined,
                        // onProgress fires after every processed file/folder.
                        // progress.files counts ALL processed files (skips + successes + failures)
                        // which gives the correct percentage; completedFiles is tracked
                        // separately via onFileResult so it only reflects successes.
                        async (progress) => {
                            completedFolders = progress.folders;

                            const totalItems =
                                totals.files +
                                totals.folders;

                            const completedItems =
                                progress.files +
                                progress.folders;

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
                                    // completedFiles = successes only (via onFileResult).
                                    completedFiles,
                                    completedFolders,
                                    progress: percentage,
                                },
                            });
                        },
                        onFileStart,
                        onFileResult
                    );

                const { failedFiles } = migrationResult;
                const destFolderId = migrationResult.id ?? undefined;

                if (failedFiles.length > 0) {
                    // Partial failure — some files could not be migrated.
                    // We still record the destination folder and how far we got.
                    const summary = failedFiles
                        .map(
                            (f) =>
                                `"${f.name}" (${f.mimeType}): ${f.error}`
                        )
                        .join("; ");

                    await prisma.migrationJob.update({
                        where: { id: jobId },
                        data: {
                            status: "FAILED",
                            errorMessage: `${failedFiles.length} file(s) could not be migrated: ${summary}`,
                            completedFiles,
                            completedFolders,
                            progress: Math.floor(
                                ((completedFiles + completedFolders) /
                                    (totals.files + totals.folders)) *
                                100
                            ),
                            destFolderId,
                            sourceFileName: migrationResult.name ?? undefined,
                        },
                    });

                    return {
                        id: job.id,
                        status: "FAILED",
                        failedFiles,
                        completedFiles,
                        completedFolders,
                        destFolderId,
                    };
                }

                await prisma.migrationJob.update({
                    where: { id: jobId },
                    data: {
                        status: "COMPLETED",

                        totalFiles: totals.files,
                        completedFiles,

                        totalFolders: totals.folders,
                        completedFolders,

                        progress: 100,

                        destFolderId,

                        sourceFileName: migrationResult.name ?? undefined,
                    },
                });

                return {
                    id: job.id,
                    status: "COMPLETED",
                    progress: 100,

                    totalFiles: totals.files,
                    completedFiles,

                    totalFolders: totals.folders,
                    completedFolders,

                    destFolderId,

                    sourceFolderName: migrationResult.name,
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

                // Mark the item as IN_PROGRESS before attempting migration.
                await prisma.migrationItem.upsert({
                    where: {
                        migrationJobId_sourceFileId: {
                            migrationJobId: jobId,
                            sourceFileId: job.sourceFileId,
                        },
                    },
                    create: {
                        migrationJobId: jobId,
                        sourceFileId: job.sourceFileId,
                        status: "IN_PROGRESS",
                    },
                    update: { status: "IN_PROGRESS" },
                });

                const uploadedFile =
                    await googleDriveService.migrateFile(
                        sourceContext,
                        destContext,
                        job.sourceFileId
                    );

                // Update MigrationItem to COMPLETED.
                await prisma.migrationItem.update({
                    where: {
                        migrationJobId_sourceFileId: {
                            migrationJobId: jobId,
                            sourceFileId: job.sourceFileId,
                        },
                    },
                    data: {
                        status: "COMPLETED",
                        destFileId: uploadedFile.id ?? null,
                        sourceFileName: uploadedFile.name ?? null,
                        sourceMimeType: uploadedFile.mimeType ?? null,
                    },
                });

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

            // ── Cooperative cancellation: preserve CANCELLED status ──────────
            // If the job was cancelled, the Postgres record is already marked
            // CANCELLED by cancelMigrationJob(). Do NOT overwrite it with FAILED.
            // Re-throw so the worker also sees this is a cancellation.
            if (error instanceof MigrationCancelledError) {
                // Clean up any items that were left IN_PROGRESS when we stopped.
                await prisma.migrationItem.updateMany({
                    where: { migrationJobId: jobId, status: "IN_PROGRESS" },
                    data: {
                        status: "FAILED",
                        errorMessage: "Migration cancelled by user",
                    },
                });

                console.log(
                    `[MigrationService] Job ${jobId} stopped due to cancellation`
                );

                // Re-throw so the worker's `failed` event can detect it.
                throw error;
            }

            // ── Safety net: re-read status before writing FAILED ─────────────
            // A cancel can arrive at any point during execution. If the DB
            // status is already CANCELLED, leave it alone — don't overwrite
            // with FAILED just because an unrelated error was thrown mid-flight
            // (e.g. the Google token expired after the cancel arrived).
            const currentJob = await prisma.migrationJob.findUnique({
                where: { id: jobId },
                select: { status: true },
            });

            if (currentJob?.status === "CANCELLED") {
                // Clean up any in-flight items but preserve the job status.
                await prisma.migrationItem.updateMany({
                    where: { migrationJobId: jobId, status: "IN_PROGRESS" },
                    data: {
                        status: "FAILED",
                        errorMessage: "Migration cancelled by user",
                    },
                });

                console.log(
                    `[MigrationService] Job ${jobId} error suppressed — ` +
                    `status is CANCELLED, not overwriting with FAILED. ` +
                    `Original error: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );

                // Throw a MigrationCancelledError so the worker's `failed`
                // handler also recognises this as a cancellation.
                throw new MigrationCancelledError(jobId);
            }

            // Genuine failure — update items and job to FAILED.
            await prisma.migrationItem.updateMany({
                where: { migrationJobId: jobId, status: "IN_PROGRESS" },
                data: {
                    status: "FAILED",
                    errorMessage:
                        error instanceof Error
                            ? error.message
                            : "Unknown migration error",
                },
            });

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