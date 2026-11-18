/**
 * DriveShift Migration Benchmark
 * ================================
 * Exercises the real service -> BullMQ -> Worker -> Google Drive path.
 *
 * Usage:
 *   npx tsx scripts/benchmark-migration.ts
 *
 * Required env vars (set in server/.env or export in the shell):
 *   BENCHMARK_USER_ID             - DriveShift user that owns both connected accounts
 *   BENCHMARK_SOURCE_ACCOUNT_ID  - ConnectedAccount.id for the source Drive
 *   BENCHMARK_DEST_ACCOUNT_ID    - ConnectedAccount.id for the destination Drive
 *   BENCHMARK_SOURCE_FOLDER_ID   - Google Drive folder ID to migrate
 *
 * Optional env vars:
 *   BENCHMARK_TIMEOUT_MINUTES    - Max wait per run     (default: 30)
 *   BENCHMARK_RUNS               - Runs per invocation  (default: 1)
 *   BENCHMARK_RUN_LABEL          - Label stored in results JSON (e.g. "concurrency-1-run-1")
 *   WORKER_CONCURRENCY           - Current worker concurrency (read for reporting only)
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import prisma from "../src/config/prisma.js";
import { migrationService } from "../src/services/migration.service.js";
import { migrationQueue } from "../src/migration/queue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

// -- Configuration -------------------------------------------------------------

const REQUIRED_ENV: Record<string, string> = {
    BENCHMARK_USER_ID: "User ID (e.g. from inspect-benchmark-accounts.ts)",
    BENCHMARK_SOURCE_ACCOUNT_ID: "ConnectedAccount.id for the source Google Drive account",
    BENCHMARK_DEST_ACCOUNT_ID: "ConnectedAccount.id for the destination Google Drive account",
    BENCHMARK_SOURCE_FOLDER_ID: "Google Drive folder ID to migrate (the benchmark dataset folder)",
};
const TIMEOUT_MINUTES = Number(process.env.BENCHMARK_TIMEOUT_MINUTES ?? "30");
const RUNS = Number(process.env.BENCHMARK_RUNS ?? "1");
const RUN_LABEL = process.env.BENCHMARK_RUN_LABEL ?? "";
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "2");
const POLL_INTERVAL_MS = 1_500;

const RESULTS_DIR = path.join(__dirname, "../../benchmarks/results");
const RESULTS_FILE = path.join(RESULTS_DIR, "benchmark-results.json");

// -- Types ---------------------------------------------------------------------

interface PolledMigrationJob {
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
    totalFiles: number;
    completedFiles: number;
    totalFolders: number;
    progress: number;
    errorMessage: string | null;
    items: Array<{ status: string }>;
}

interface BenchmarkResult {
    timestamp: string;
    runLabel: string;
    workerConcurrency: number;
    sourceFolderId: string;
    jobId: string;
    status: string;
    files: number;
    folders: number;
    totalBytes: number;
    totalMB: number;
    completedFiles: number;
    failedFiles: number;
    retries: "unavailable";
    startTime: string;
    endTime: string;
    durationSeconds: number;
    throughputMBps: number | null;
    filesPerMinute: number | null;
    errorMessage: string | null;
    timedOut: boolean;
    apiUrl: string;
    note: string;
}

// -- Helpers -------------------------------------------------------------------

function validateEnv(): void {
    const missing: string[] = [];
    for (const [key, description] of Object.entries(REQUIRED_ENV)) {
        if (!process.env[key]) {
            missing.push("  " + key + ": " + description);
        }
    }
    if (missing.length > 0) {
        console.error("\n[Benchmark] Missing required environment variables:\n");
        console.error(missing.join("\n"));
        console.error(
            "\nSet them in server/.env or export them before running:\n" +
            "  export BENCHMARK_USER_ID=...\n" +
            "  npx tsx scripts/benchmark-migration.ts\n"
        );
        process.exit(1);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sep(char: string = "-", width: number = 48): string {
    return char.repeat(width);
}

function printResult(result: BenchmarkResult, runNum: number, totalRuns: number): void {
    const runSuffix = totalRuns > 1 ? " (Run " + runNum + "/" + totalRuns + ")" : "";
    console.log("\n" + sep("="));
    console.log("DriveShift Migration Benchmark" + runSuffix);
    console.log(sep("="));

    if (result.runLabel) console.log("Label:        " + result.runLabel);

    console.log("Concurrency:  " + result.workerConcurrency);
    console.log("Job ID:       " + result.jobId);
    console.log("");
    console.log("Files:        " + result.files);
    console.log("Folders:      " + result.folders);

    if (result.totalBytes > 0) {
        console.log("Total size:   " + result.totalMB.toFixed(2) + " MB");
    } else {
        console.log("Total size:   not available (no per-file size in schema -- see BENCHMARK.md)");
    }

    console.log("");
    console.log("Start:        " + result.startTime);
    console.log("End:          " + result.endTime);
    console.log("");

    if (result.timedOut) {
        console.log("Duration:     TIMED OUT after " + TIMEOUT_MINUTES + " minutes");
        console.log("Throughput:   N/A");
        console.log("Files/min:    N/A");
    } else {
        const tput =
            result.throughputMBps !== null
                ? result.throughputMBps.toFixed(4) + " MB/s"
                : "N/A (size unavailable)";
        const fpm =
            result.filesPerMinute !== null
                ? result.filesPerMinute.toFixed(2)
                : "N/A";

        console.log("Duration:     " + result.durationSeconds.toFixed(2) + " seconds");
        console.log("Throughput:   " + tput);
        console.log("Files/min:    " + fpm);
    }

    console.log("");
    console.log("Completed:    " + result.completedFiles + " files");
    console.log("Failed:       " + result.failedFiles + " files");
    console.log("Retries:      " + result.retries);
    console.log("");
    console.log("Final status: " + result.status);
    if (result.errorMessage) console.log("Error:        " + result.errorMessage);
    console.log(sep("=") + "\n");
}

function ensureResultsDir(): void {
    if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
}

function appendResult(result: BenchmarkResult): void {
    ensureResultsDir();
    let existing: BenchmarkResult[] = [];
    if (fs.existsSync(RESULTS_FILE)) {
        try {
            existing = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
            if (!Array.isArray(existing)) existing = [];
        } catch {
            existing = [];
        }
    }
    existing.push(result);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), "utf8");
    console.log("[Benchmark] Result saved -> " + RESULTS_FILE);
}

// -- Core benchmark run --------------------------------------------------------

async function runBenchmark(runNum: number): Promise<BenchmarkResult> {
    const userId = process.env.BENCHMARK_USER_ID as string;
    const sourceAccountId = process.env.BENCHMARK_SOURCE_ACCOUNT_ID as string;
    const destAccountId = process.env.BENCHMARK_DEST_ACCOUNT_ID as string;
    const sourceFolderId = process.env.BENCHMARK_SOURCE_FOLDER_ID as string;

    const timeoutMs = TIMEOUT_MINUTES * 60 * 1000;

    console.log("\n[Benchmark] Creating migration job (run " + runNum + "/" + RUNS + ")...");

    const jobRecord = await migrationService.createMigrationJob({
        userId,
        sourceAccountId,
        destAccountId,
        sourceFolderId,
    });

    await migrationQueue.add("migration", {
        jobId: jobRecord.id,
    });

    const jobId = jobRecord.id;
    const startTime = new Date();

    console.log("[Benchmark] Job created: " + jobId);
    console.log(
        "[Benchmark] Polling every " + POLL_INTERVAL_MS + "ms (timeout: " + TIMEOUT_MINUTES + " min)..."
    );

    const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
    let job: PolledMigrationJob | null = null;
    let timedOut = false;

    while (true) {
        await sleep(POLL_INTERVAL_MS);

        const elapsed = Date.now() - startTime.getTime();
        if (elapsed >= timeoutMs) {
            timedOut = true;
            console.warn("\n[Benchmark] Timeout reached after " + TIMEOUT_MINUTES + " minutes");
            break;
        }

        let polledJob: PolledMigrationJob;
        try {
            const dbJob = await prisma.migrationJob.findUnique({
                where: { id: jobId },
                include: { items: true },
            });
            if (!dbJob) {
                throw new Error("Job not found in database");
            }
            polledJob = dbJob;
            job = polledJob;
        } catch (pollErr) {
            console.warn(
                "\n[Benchmark] Poll error (will retry): " +
                (pollErr instanceof Error ? pollErr.message : String(pollErr))
            );
            continue;
        }

        const elapsedSec = (elapsed / 1000).toFixed(1);
        process.stdout.write(
            "\r[Benchmark] | progress: " + polledJob.progress + "% | files: " +
            polledJob.completedFiles + "/" + polledJob.totalFiles + " | elapsed: " + elapsedSec + "s   "
        );

        if (terminalStatuses.has(polledJob.status)) {
            process.stdout.write("\n");
            break;
        }
    }

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    const totalFiles = job?.totalFiles ?? 0;
    const totalFolders = job?.totalFolders ?? 0;
    const completedFiles = job?.completedFiles ?? 0;

    const itemsFromJob = job?.items ?? [];
    const failedCount = itemsFromJob.filter((i) => i.status === "FAILED").length;

    // MigrationItem has no fileSize column -> bytes unavailable
    const totalBytes = 0;
    const totalMB = 0;

    const filesPerMinute =
        completedFiles > 0 && !timedOut
            ? completedFiles / (durationSeconds / 60)
            : null;

    return {
        timestamp: startTime.toISOString(),
        runLabel: RUN_LABEL,
        workerConcurrency: WORKER_CONCURRENCY,
        sourceFolderId,
        jobId,
        status: job?.status ?? "UNKNOWN",
        files: totalFiles,
        folders: totalFolders,
        totalBytes,
        totalMB,
        completedFiles,
        failedFiles: failedCount,
        retries: "unavailable",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationSeconds,
        throughputMBps: null,
        filesPerMinute,
        errorMessage: job?.errorMessage ?? null,
        timedOut,
        apiUrl: "Direct Service Call",
        note: "throughputMBps is null because MigrationItem does not store file sizes. See BENCHMARK.md.",
    };
}

// -- Summary table -------------------------------------------------------------

function printSummaryTable(results: BenchmarkResult[]): void {
    if (results.length < 2) return;

    console.log("\n" + sep("="));
    console.log("Run Summary");
    console.log(sep("="));
    console.log(
        "Run".padEnd(5) +
        "Concurrency".padEnd(14) +
        "Files".padEnd(8) +
        "Duration(s)".padEnd(14) +
        "Files/min".padEnd(12) +
        "Status"
    );
    console.log(sep("-"));

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const dur = r.durationSeconds.toFixed(2).padEnd(14);
        const fpm = r.filesPerMinute !== null ? r.filesPerMinute.toFixed(2) : "N/A";
        const tOut = r.timedOut ? " (TIMEOUT)" : "";
        console.log(
            String(i + 1).padEnd(5) +
            String(r.workerConcurrency).padEnd(14) +
            String(r.files).padEnd(8) +
            dur +
            fpm.padEnd(12) +
            r.status + tOut
        );
    }

    const avgDuration =
        results.reduce((s, r) => s + r.durationSeconds, 0) / results.length;
    const fpmValues = results
        .filter((r) => r.filesPerMinute !== null)
        .map((r) => r.filesPerMinute as number);
    const avgFpm =
        fpmValues.length > 0
            ? fpmValues.reduce((s, v) => s + v, 0) / fpmValues.length
            : null;

    console.log(sep("-"));
    console.log(
        "AVG".padEnd(5) +
        "".padEnd(14) +
        "".padEnd(8) +
        avgDuration.toFixed(2).padEnd(14) +
        (avgFpm !== null ? avgFpm.toFixed(2) : "N/A").padEnd(12)
    );
    console.log(sep("=") + "\n");
}

// -- Main ----------------------------------------------------------------------

async function main(): Promise<void> {
    console.log("\n" + sep("="));
    console.log("DriveShift Migration Benchmark");
    console.log(sep("="));
    console.log("Execution:    Direct Service Call (No HTTP)");
    console.log("Concurrency:  " + WORKER_CONCURRENCY + " (WORKER_CONCURRENCY env var -- for reporting only)");
    console.log("Runs:         " + RUNS);
    console.log("Timeout:      " + TIMEOUT_MINUTES + " minutes per run");
    console.log("Run label:    " + (RUN_LABEL || "(none)"));
    console.log("Source folder:" + (process.env.BENCHMARK_SOURCE_FOLDER_ID ?? "(not set yet)"));
    console.log(sep("-"));

    validateEnv();

    console.log("\n[Benchmark] Initializing via Direct Service Call...");
    console.log("[Benchmark] Services ready");

    console.log(
        "\nWARNING: Each benchmark run creates a NEW destination folder in the destination Drive.\n" +
        "         Do NOT run against data you cannot afford to duplicate.\n"
    );

    if (RUNS > 1) {
        console.log(
            "WARNING: Multiple runs (" + RUNS + ") will create " + RUNS +
            " separate folder copies in the destination Drive.\n"
        );
    }

    if (process.stdout.isTTY) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise<void>((resolve) => {
            rl.question("Press ENTER to start (or Ctrl+C to cancel)... ", () => {
                rl.close();
                resolve();
            });
        });
    }

    const allResults: BenchmarkResult[] = [];

    for (let run = 1; run <= RUNS; run++) {
        const result = await runBenchmark(run);
        printResult(result, run, RUNS);
        appendResult(result);
        allResults.push(result);

        if (run < RUNS) {
            console.log("[Benchmark] Waiting 5 seconds before next run...");
            await sleep(5_000);
        }
    }

    printSummaryTable(allResults);

    const anyBad = allResults.some(
        (r) => r.timedOut || r.status === "FAILED" || r.status === "CANCELLED"
    );

    if (anyBad) {
        console.error(
            "WARNING: One or more runs did not complete successfully. Check results above."
        );
        process.exit(1);
    }

    console.log("All benchmark runs completed successfully.");
}

main().catch((err) => {
    console.error("\n[Benchmark] Fatal error:", err instanceof Error ? err.message : err);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
    // BullMQ requires process.exit to close workers completely if hanging
    process.exit(0);
});
