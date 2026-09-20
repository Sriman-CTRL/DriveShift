import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Mock all infrastructure before importing app (which triggers passport.ts)

const prismaMock = vi.hoisted(() => ({
    connectedAccount: {
        findFirst: vi.fn(),
    },
    migrationJob: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
}));

const migrationServiceMock = vi.hoisted(() => ({
    createMigrationJob: vi.fn(),
    cancelMigrationJob: vi.fn(),
}));

const migrationQueueMock = vi.hoisted(() => ({
    add: vi.fn(),
}));

vi.mock("../src/config/prisma", () => ({ default: prismaMock }));
vi.mock("../src/services/migration.service", () => ({
    migrationService: migrationServiceMock,
}));
vi.mock("../src/migration/queue", () => ({
    migrationQueue: migrationQueueMock,
}));

// Prevent real Redis/BullMQ sockets
vi.mock("ioredis", () => ({
    default: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("bullmq", () => ({
    Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
    Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), getJobs: vi.fn() })),
}));

// Mock the entire passport module so GoogleStrategy (constructor) is never called.
// passport.ts runs at module-load time when app.ts is imported.
vi.mock("../src/auth/passport.ts", () => ({
    default: {
        use: vi.fn(),
        initialize: vi.fn(() => (_req: any, _res: any, next: any) => next()),
        session: vi.fn(() => (_req: any, _res: any, next: any) => next()),
        serializeUser: vi.fn(),
        deserializeUser: vi.fn(),
        authenticate: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    },
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

// ─── Subject under test ───────────────────────────────────────────────────────
import app from "../src/app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(userId = "user-123", email = "test@example.com") {
    return jwt.sign({ userId, email }, "test-secret", { expiresIn: "1h" });
}

const VALID_TOKEN = makeToken();
const SOURCE_ACCOUNT = { id: "src-acc", userId: "user-123" };
const DEST_ACCOUNT   = { id: "dst-acc", userId: "user-123" };

// ─────────────────────────────────────────────────────────────────────────────

describe("Migration API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Test 10: POST /migrations ─────────────────────────────────────────────
    describe("POST /migrations", () => {
        it("creates a MigrationJob, enqueues a BullMQ job, and returns HTTP 202", async () => {
            const createdJob = {
                id: "job-new",
                userId: "user-123",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: "folder-abc",
                status: "PENDING",
            };

            prismaMock.connectedAccount.findFirst
                .mockResolvedValueOnce(SOURCE_ACCOUNT)
                .mockResolvedValueOnce(DEST_ACCOUNT);

            migrationServiceMock.createMigrationJob.mockResolvedValue(createdJob);
            migrationQueueMock.add.mockResolvedValue({ id: "bull-job-1" });

            const res = await request(app)
                .post("/migrations")
                .set("Authorization", `Bearer ${VALID_TOKEN}`)
                .send({
                    sourceAccountId: "src-acc",
                    destAccountId: "dst-acc",
                    sourceFolderId: "folder-abc",
                });

            expect(res.status).toBe(202);
            expect(res.body.message).toBe("Migration job queued successfully");
            expect(res.body.job.id).toBe("job-new");
            expect(res.body.job.status).toBe("PENDING");

            // Service called with the correct payload including authenticated userId
            expect(migrationServiceMock.createMigrationJob).toHaveBeenCalledWith({
                userId: "user-123",
                sourceAccountId: "src-acc",
                destAccountId: "dst-acc",
                sourceFolderId: "folder-abc",
            });

            // BullMQ received the correct jobId
            expect(migrationQueueMock.add).toHaveBeenCalledWith(
                "migration",
                { jobId: "job-new" }
            );
        });

        it("returns 401 when Authorization header is missing", async () => {
            const res = await request(app)
                .post("/migrations")
                .send({ sourceAccountId: "x", destAccountId: "y", sourceFolderId: "z" });

            expect(res.status).toBe(401);
            // Neither service nor queue should be touched
            expect(migrationServiceMock.createMigrationJob).not.toHaveBeenCalled();
            expect(migrationQueueMock.add).not.toHaveBeenCalled();
        });
    });

    // ── Test 11: POST /migrations/:jobId/cancel ───────────────────────────────
    describe("POST /migrations/:jobId/cancel", () => {
        it("cancels a migration and returns HTTP 200 with the updated job", async () => {
            const cancelledJob = {
                id: "job-cancel",
                userId: "user-123",
                status: "CANCELLED",
                errorMessage: "Migration cancelled by user",
            };

            migrationServiceMock.cancelMigrationJob.mockResolvedValue({
                success: true,
                job: cancelledJob,
            });

            const res = await request(app)
                .post("/migrations/job-cancel/cancel")
                .set("Authorization", `Bearer ${VALID_TOKEN}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Migration cancelled successfully");
            expect(res.body.job.status).toBe("CANCELLED");

            // Correct jobId and authenticated userId forwarded to the service
            expect(migrationServiceMock.cancelMigrationJob).toHaveBeenCalledWith(
                "job-cancel",
                "user-123"
            );
        });

        it("returns 401 when Authorization header is missing", async () => {
            const res = await request(app)
                .post("/migrations/job-cancel/cancel");

            expect(res.status).toBe(401);
            expect(migrationServiceMock.cancelMigrationJob).not.toHaveBeenCalled();
        });
    });
});
