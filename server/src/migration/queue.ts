import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const migrationQueue = new Queue("migration", {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
    },
});