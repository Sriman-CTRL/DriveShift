import { randomUUID } from "crypto";

export type MigrationJobStatus =
    | "PENDING"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED";

export interface MigrationJob {
    id: string;
    sourceAccountId: string;
    destinationAccountId: string;
    sourceFolderId: string;
    status: MigrationJobStatus;
    progress: number;
    createdAt: Date;
}

export const jobs = new Map<string, MigrationJob>();

export function createJob(
    sourceAccountId: string,
    destinationAccountId: string,
    sourceFolderId: string
) {
    const job: MigrationJob = {
        id: randomUUID(),
        sourceAccountId,
        destinationAccountId,
        sourceFolderId,
        status: "PENDING",
        progress: 0,
        createdAt: new Date(),
    };

    jobs.set(job.id, job);

    return job;
}