import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks (must be hoisted before any imports) ──────────────────────────────

const prismaMock = vi.hoisted(() => ({
    migrationJob: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
    },
    migrationItem: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
    },
    connectedAccount: {
        findUnique: vi.fn(),
    },
}));

const migrationQueueMock = vi.hoisted(() => ({
    getJobs: vi.fn(),
}));

const driveServiceMock = vi.hoisted(() => ({
    googleDriveService: {
        migrateFile: vi.fn(),
        migrateFolder: vi.fn(),
        listChildren: vi.fn(),
    },
}));

vi.mock("../src/config/prisma", () => ({ default: prismaMock }));
vi.mock("../src/migration/queue", () => ({ migrationQueue: migrationQueueMock }));
vi.mock("../src/providers/google/drive.service", () => driveServiceMock);

// ─── Subject under test ───────────────────────────────────────────────────────
import { migrationService, MigrationCancelledError } from "../src/services/migration.service";

// ─── Shared test fixtures ──────────────────────────────────────────────────────

const SOURCE_ACCOUNT = {
    id: "src-acc",
    userId: "user-123",
    providerUserId: "google-src",
    provider: "google",
    accessToken: "src-token",
    refreshToken: "src-refresh",
    tokenExpiry: null,
};

const DEST_ACCOUNT = {
    id: "dst-acc",
    userId: "user-123",
    providerUserId: "google-dst",
    provider: "google",
    accessToken: "dst-token",
    refreshToken: "dst-refresh",
    tokenExpiry: null,
};

// ─────────────────────────────────────────────────────────────────────────────

describe("MigrationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Test 1 (existing) ────────────────────────────────────────────────────
    describe("createMigrationJob", () => {
        it("creates a migration job with PENDING status", async () => {
            const fakeJob = {
                id: "job-123",
                userId: "user-123",
                sourceAccountId: "source-123",
                destAccountId: "dest-123",
                sourceFolderId: "folder-123",
                sourceFileId: null,
                status: "PENDING",
            };

            prismaMock.migrationJob.create.mockResolvedValue(fakeJob);

            const result = await migrationService.createMigrationJob({
                userId: "user-123",
                sourceAccountId: "source-123",
                destAccountId: "dest-123",
                sourceFolderId: "folder-123",
            });

            expect(prismaMock.migrationJob.create).toHaveBeenCalledOnce();
            expect(prismaMock.migrationJob.create).toHaveBeenCalledWith({
                data: {
                    userId: "user-123",
                    sourceAccountId: "source-123",
                    destAccountId: "dest-123",
                    sourceFolderId: "folder-123",
                    sourceFileId: undefined,
                    status: "PENDING",
                },
            });
            expect(result).toEqual(fakeJob);
        });
    });

    // ── Test 2 (existing) ────────────────────────────────────────────────────
    describe("cancelMigrationJob", () => {
        it("cancels a PENDING migration job", async () => {
            const existingJob = { id: "job-123", userId: "user-123", status: "PENDING" };
            const cancelledJob = {
                ...existingJob,
                status: "CANCELLED",
                errorMessage: "Migration cancelled by user",
            };

            prismaMock.migrationJob.findUnique.mockResolvedValue(existingJob);
            prismaMock.migrationJob.update.mockResolvedValue(cancelledJob);
            migrationQueueMock.getJobs.mockResolvedValue([]);

            const result = await migrationService.cancelMigrationJob("job-123", "user-123");

            expect(prismaMock.migrationJob.findUnique).toHaveBeenCalledWith({ where: { id: "job-123" } });
            expect(prismaMock.migrationJob.update).toHaveBeenCalledWith({
                where: { id: "job-123" },
                data: { status: "CANCELLED", errorMessage: "Migration cancelled by user" },
            });
            expect(result).toEqual({ success: true, job: cancelledJob });
        });
    });

    // ── Test 3: successful single-file migration ──────────────────────────────
    describe("executeMigration — single file", () => {
        it("migrates a single file: PENDING → IN_PROGRESS → COMPLETED", async () => {
            const job = {
                id: "job-1",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: null,
                sourceFileId: "file-abc",
                status: "PENDING",
            };

            const uploadedFile = { id: "dest-file-id", name: "report.pdf", mimeType: "application/pdf" };

            // executeMigration calls findUnique for: job load, checkCancelled×2
            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)   // initial job load
                .mockResolvedValueOnce(job)   // pre-IN_PROGRESS cancellation check
                .mockResolvedValueOnce(job);  // post-IN_PROGRESS cancellation check

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            prismaMock.migrationItem.upsert.mockResolvedValue({});
            prismaMock.migrationItem.update.mockResolvedValue({});

            driveServiceMock.googleDriveService.migrateFile.mockResolvedValue(uploadedFile);

            const result = await migrationService.executeMigration("job-1");

            // Must have transitioned through IN_PROGRESS then COMPLETED
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const statuses = updateCalls.map((c: any) => c[0].data.status).filter(Boolean);
            expect(statuses).toContain("IN_PROGRESS");
            expect(statuses).toContain("COMPLETED");

            // Final result shape
            expect(result).toMatchObject({
                status: "COMPLETED",
                progress: 100,
                totalFiles: 1,
                completedFiles: 1,
                destFileId: "dest-file-id",
            });

            // Destination metadata persisted on MigrationItem
            expect(prismaMock.migrationItem.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: "COMPLETED",
                        destFileId: "dest-file-id",
                    }),
                })
            );

            expect(driveServiceMock.googleDriveService.migrateFile).toHaveBeenCalledOnce();
        });
    });

    // ── Test 4: failed single-file migration ─────────────────────────────────
    describe("executeMigration — single file failure", () => {
        it("marks MigrationJob FAILED when Google Drive throws", async () => {
            const job = {
                id: "job-2",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: null,
                sourceFileId: "file-xyz",
                status: "PENDING",
            };

            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)  // initial job load
                .mockResolvedValueOnce(job)  // pre-IN_PROGRESS check
                .mockResolvedValueOnce(job)  // post-IN_PROGRESS check
                .mockResolvedValueOnce(job); // safety-net re-read in catch (status still PENDING/not CANCELLED)

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            prismaMock.migrationItem.upsert.mockResolvedValue({});
            prismaMock.migrationItem.updateMany.mockResolvedValue({});

            driveServiceMock.googleDriveService.migrateFile.mockRejectedValue(
                new Error("Google API quota exceeded")
            );

            await expect(migrationService.executeMigration("job-2")).rejects.toThrow(
                "Google API quota exceeded"
            );

            // Job must be marked FAILED with the error message
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const failedCall = updateCalls.find((c: any) => c[0].data.status === "FAILED");
            expect(failedCall).toBeDefined();
            expect(failedCall[0].data.errorMessage).toBe("Google API quota exceeded");
        });
    });

    // ── Test 5: successful folder migration ───────────────────────────────────
    describe("executeMigration — folder", () => {
        it("migrates a folder and reaches COMPLETED at 100% with destFolderId stored", async () => {
            const job = {
                id: "job-3",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: "root-folder",
                sourceFileId: null,
                status: "PENDING",
            };

            const folderResult = { id: "dest-folder-id", name: "Root", failedFiles: [] };

            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)  // initial job load
                .mockResolvedValueOnce(job)  // pre-IN_PROGRESS check
                .mockResolvedValueOnce(job); // post-IN_PROGRESS check

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            prismaMock.migrationItem.findMany.mockResolvedValue([]);
            prismaMock.migrationItem.upsert.mockResolvedValue({});
            prismaMock.migrationItem.update.mockResolvedValue({});

            // listChildren is used by countFolderItems
            driveServiceMock.googleDriveService.listChildren = vi.fn().mockResolvedValue([
                { id: "f1", name: "file1.txt", mimeType: "text/plain" },
                { id: "f2", name: "file2.txt", mimeType: "text/plain" },
            ]);

            driveServiceMock.googleDriveService.migrateFolder.mockResolvedValue(folderResult);

            const result = await migrationService.executeMigration("job-3");

            expect(result).toMatchObject({
                status: "COMPLETED",
                progress: 100,
                destFolderId: "dest-folder-id",
            });

            // Final DB update must contain COMPLETED + destFolderId + 100%
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const completedCall = updateCalls.find((c: any) => c[0].data.status === "COMPLETED");
            expect(completedCall).toBeDefined();
            expect(completedCall[0].data.destFolderId).toBe("dest-folder-id");
            expect(completedCall[0].data.progress).toBe(100);
        });
    });

    // ── Test 6: cancellation during execution ─────────────────────────────────
    describe("Cancellation", () => {
        it("stops execution mid-flight when DB status is CANCELLED, preserves CANCELLED", async () => {
            const job = {
                id: "job-4",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: null,
                sourceFileId: "file-in-progress",
                status: "PENDING",
            };

            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)                               // initial job load
                .mockResolvedValueOnce({ ...job, status: "PENDING" })    // pre-IN_PROGRESS check → ok
                .mockResolvedValueOnce({ ...job, status: "CANCELLED" }); // post-IN_PROGRESS check → cancel

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            prismaMock.migrationItem.upsert.mockResolvedValue({});
            prismaMock.migrationItem.updateMany.mockResolvedValue({});

            await expect(
                migrationService.executeMigration("job-4")
            ).rejects.toBeInstanceOf(MigrationCancelledError);

            // Google Drive must NEVER have been called
            expect(driveServiceMock.googleDriveService.migrateFile).not.toHaveBeenCalled();

            // Job must NOT have been flipped to FAILED
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const failedCall = updateCalls.find((c: any) => c[0].data.status === "FAILED");
            expect(failedCall).toBeUndefined();
        });
    });

    // ── Test 7: cancellation race-condition guard ─────────────────────────────
    describe("Cancellation race condition", () => {
        it("does NOT set IN_PROGRESS when job is already CANCELLED in DB", async () => {
            const alreadyCancelledJob = {
                id: "job-5",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: null,
                sourceFileId: "file-foo",
                status: "CANCELLED",
            };

            // Job load → CANCELLED; pre-IN_PROGRESS check → also CANCELLED → throws immediately
            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(alreadyCancelledJob)
                .mockResolvedValueOnce(alreadyCancelledJob);

            await expect(
                migrationService.executeMigration("job-5")
            ).rejects.toBeInstanceOf(MigrationCancelledError);

            // IN_PROGRESS must never have been written
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const inProgressCall = updateCalls.find((c: any) => c[0].data.status === "IN_PROGRESS");
            expect(inProgressCall).toBeUndefined();

            // Google Drive was never touched
            expect(driveServiceMock.googleDriveService.migrateFile).not.toHaveBeenCalled();
            expect(driveServiceMock.googleDriveService.migrateFolder).not.toHaveBeenCalled();
        });

        it("does NOT overwrite CANCELLED with FAILED when a Drive error coincides with cancellation", async () => {
            // Scenario: user cancels while migration is running.
            // Drive throws an error, but by the time the catch block re-reads the DB,
            // the status is already CANCELLED → must throw MigrationCancelledError, not FAILED.
            const job = {
                id: "job-6",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: null,
                sourceFileId: "file-bar",
                status: "PENDING",
            };

            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)                               // job load
                .mockResolvedValueOnce(job)                               // pre-IN_PROGRESS check → ok
                .mockResolvedValueOnce(job)                               // post-IN_PROGRESS check → ok
                .mockResolvedValueOnce({ ...job, status: "CANCELLED" }); // safety-net re-read in catch

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            prismaMock.migrationItem.upsert.mockResolvedValue({});
            prismaMock.migrationItem.updateMany.mockResolvedValue({});

            driveServiceMock.googleDriveService.migrateFile.mockRejectedValue(
                new Error("Network error after cancel")
            );

            // The catch block detects CANCELLED and re-throws as MigrationCancelledError
            await expect(
                migrationService.executeMigration("job-6")
            ).rejects.toBeInstanceOf(MigrationCancelledError);

            // FAILED must never have been written to the DB
            const updateCalls = prismaMock.migrationJob.update.mock.calls;
            const failedCall = updateCalls.find((c: any) => c[0].data.status === "FAILED");
            expect(failedCall).toBeUndefined();
        });
    });

    // ── Test 8: idempotency — skip already-COMPLETED file ────────────────────
    describe("Idempotency", () => {
        it("skips a file that is already COMPLETED from a previous run", async () => {
            const job = {
                id: "job-7",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: "folder-retry",
                sourceFileId: null,
                status: "PENDING",
            };

            const existingItems = [{ sourceFileId: "file-123", status: "COMPLETED" }];

            // migrateFolder invokes onFileStart; we simulate it returning skip=true
            driveServiceMock.googleDriveService.migrateFolder.mockImplementation(
                async (
                    _src: any, _dst: any, _folderId: any, _parent: any,
                    _onProgress: any,
                    onFileStart: ((f: { sourceFileId: string; sourceFileName: string; sourceMimeType: string }) => Promise<boolean>) | undefined,
                    _onFileResult: any
                ) => {
                    if (onFileStart) {
                        const skip = await onFileStart({
                            sourceFileId: "file-123",
                            sourceFileName: "report.pdf",
                            sourceMimeType: "application/pdf",
                        });
                        // onFileStart must return true (skip) because the item is COMPLETED
                        expect(skip).toBe(true);
                    }
                    return { id: "dest-folder", name: "Folder", failedFiles: [] };
                }
            );

            driveServiceMock.googleDriveService.listChildren = vi.fn().mockResolvedValue([
                { id: "file-123", name: "report.pdf", mimeType: "application/pdf" },
            ]);

            prismaMock.migrationJob.findUnique
                .mockResolvedValueOnce(job)
                .mockResolvedValueOnce(job)  // pre-IN_PROGRESS check
                .mockResolvedValueOnce(job); // post-IN_PROGRESS check

            prismaMock.connectedAccount.findUnique
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            prismaMock.migrationJob.update.mockResolvedValue({});
            // Pre-load: file-123 is already COMPLETED
            prismaMock.migrationItem.findMany.mockResolvedValue(existingItems);
            prismaMock.migrationItem.upsert.mockResolvedValue({});

            await migrationService.executeMigration("job-7");

            // migrateFile (the actual Drive call) must never have been invoked
            expect(driveServiceMock.googleDriveService.migrateFile).not.toHaveBeenCalled();
            // No upsert for the already-completed item
            expect(prismaMock.migrationItem.upsert).not.toHaveBeenCalled();
        });
    });
});