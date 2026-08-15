import { Worker } from "bullmq";
import IORedis from "ioredis";
import { migrationService } from "../services/migration.service";
import prisma from "../config/prisma";

const connection = new IORedis(
    process.env.REDIS_URL || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    }
);

export const migrationWorker = new Worker(
    "migration",
    async (job) => {
        const attempt = job.attemptsMade + 1;

        console.log(
            `[MigrationWorker] Starting job ${job.id} | Attempt ${attempt}/${job.opts.attempts}`
        );

        await migrationService.executeMigration(job.data.jobId);

        console.log(
            `[MigrationWorker] Completed job ${job.id}`
        );
    },
    {
        connection,
        concurrency: 2,
    }
);

migrationWorker.on("completed", (job) => {
    console.log(
        `[MigrationWorker] Job ${job.id} completed`
    );
});

migrationWorker.on("failed", async (job, error) => {
    if (!job) return;

    const attempt = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    console.error(
        `[MigrationWorker] Job ${job.id} failed | Attempt ${attempt}/${maxAttempts}:`,
        error.message
    );

    if (attempt >= maxAttempts) {
        console.error(
            `[MigrationWorker] Job ${job.id} permanently failed`
        );

        await prisma.migrationJob.update({
            where: {
                id: job.data.jobId,
            },
            data: {
                status: "FAILED",
                errorMessage: error.message,
            },
        });
    } else {
        console.log(
            `[MigrationWorker] Job ${job.id} will be retried`
        );
    }
});