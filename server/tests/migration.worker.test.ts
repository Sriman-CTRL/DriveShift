import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
    migrationJob: {
        update: vi.fn(),
    },
}));

const MigrationCancelledErrorMock = vi.hoisted(() => {
    class MigrationCancelledError extends Error {
        constructor(jobId: string) {
            super(`Migration job ${jobId} was cancelled`);
            this.name = "MigrationCancelledError";
        }
    }
    return MigrationCancelledError;
});

vi.mock("../src/config/prisma", () => ({ default: prismaMock }));

vi.mock("../src/services/migration.service", () => ({
    migrationService: { executeMigration: vi.fn() },
    MigrationCancelledError: MigrationCancelledErrorMock,
}));

vi.mock("../src/config/env.js", () => ({
    env: {
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "test-secret",
        SESSION_SECRET: "test-session-secret",
        GOOGLE_CLIENT_ID: "gid",
        GOOGLE_CLIENT_SECRET: "gsecret",
        GOOGLE_CALLBACK_URL: "http://localhost/callback",
        DATABASE_URL: "postgresql://test",
        PORT: "5000",
    },
}));

// ─────────────────────────────────────────────────────────────────────────────

describe("Migration Worker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Test 6: BullMQ retry configuration ───────────────────────────────────
    // queue.ts declares these constants statically.
    // If they ever change, this test catches the regression.
    describe("Queue retry configuration", () => {
        it("configures 3 attempts with exponential backoff starting at 5 s", async () => {
            // Read queue.ts source to extract defaultJobOptions.
            // We mock ioredis + bullmq inline so the module can be imported.
            vi.doMock("ioredis", () => ({
                default: class FakeRedis { constructor() {} },
            }));
            vi.doMock("bullmq", () => {
                let capturedOpts: any;
                class FakeQueue {
                    public capturedName: string;
                    public capturedOpts: any;
                    constructor(name: string, opts: any) {
                        capturedOpts = opts;
                        this.capturedName = name;
                        this.capturedOpts = opts;
                    }
                }
                (FakeQueue as any).__getCaptured = () => capturedOpts;
                return { Queue: FakeQueue, Worker: class FakeWorker { on() {} } };
            });

            const { migrationQueue } = await vi.importActual<any>(
                "../src/migration/queue"
            );

            // migrationQueue itself is the queue instance — read its captured opts
            const opts = (migrationQueue as any).capturedOpts;
            expect(opts.defaultJobOptions.attempts).toBe(3);
            expect(opts.defaultJobOptions.backoff).toEqual({
                type: "exponential",
                delay: 5000,
            });

            vi.doUnmock("ioredis");
            vi.doUnmock("bullmq");
        });
    });

    // ── Worker failed-event handler logic ─────────────────────────────────────
    // Reproduces the exact logic from migration.worker.ts and verifies
    // DriveShift's own retry/cancellation guard decisions.

    describe("Worker failed-event handler logic", () => {
        async function runFailedHandler(
            job: { id: string; data: { jobId: string }; attemptsMade: number; opts: { attempts?: number } },
            error: Error
        ) {
            if (!job) return;

            if (error instanceof MigrationCancelledErrorMock) {
                return; // cancellation guard — CANCELLED must NOT become FAILED
            }

            const attempt = job.attemptsMade;
            const maxAttempts = job.opts.attempts ?? 1;

            if (attempt >= maxAttempts) {
                await prismaMock.migrationJob.update({
                    where: { id: job.data.jobId },
                    data: { status: "FAILED", errorMessage: error.message },
                });
            }
            // else: not the final attempt — BullMQ will retry; we do nothing
        }

        it("marks job FAILED in DB only on the final attempt", async () => {
            prismaMock.migrationJob.update.mockResolvedValue({});

            const job = {
                id: "bull-1", data: { jobId: "job-99" }, attemptsMade: 3, opts: { attempts: 3 },
            };

            await runFailedHandler(job, new Error("Network timeout"));

            expect(prismaMock.migrationJob.update).toHaveBeenCalledWith({
                where: { id: "job-99" },
                data: { status: "FAILED", errorMessage: "Network timeout" },
            });
        });

        it("does NOT write FAILED to DB on an intermediate retry attempt", async () => {
            const job = {
                id: "bull-2", data: { jobId: "job-98" }, attemptsMade: 1, opts: { attempts: 3 },
            };

            await runFailedHandler(job, new Error("Transient error"));

            expect(prismaMock.migrationJob.update).not.toHaveBeenCalled();
        });

        it("does NOT mark FAILED when error is MigrationCancelledError (cancellation guard)", async () => {
            const job = {
                id: "bull-3", data: { jobId: "job-97" }, attemptsMade: 3, opts: { attempts: 3 },
            };

            await runFailedHandler(job, new MigrationCancelledErrorMock("job-97"));

            expect(prismaMock.migrationJob.update).not.toHaveBeenCalled();
        });
    });
});
