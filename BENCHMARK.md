# DriveShift Migration Benchmark

## 1. Purpose

This benchmark measures observed migration performance for a single folder job.
It records the worker concurrency setting for each run, but a single job does
not exercise parallel-job concurrency.

It exercises the real migration service and worker path:

```
Benchmark script   →   MigrationJob (PENDING)
                            ↓
                    BullMQ queue (Redis)
                            ↓
                  Worker picks up job (concurrency N)
                            ↓
               migrationService.executeMigration()
                            ↓
           Google Drive  download → streaming upload
                            ↓
                  MigrationJob → COMPLETED / FAILED
```

The benchmark script creates the job directly through the service and queues
it; it does not call the HTTP API. The worker performs real Google Drive API
calls.

The benchmark does NOT declare winners. It reports observed measurements.
Google Drive API performance varies by network, API latency, file size, and
account state — results are specific to the run context.

---

## 2. Dataset Requirements

Create a benchmark folder in your source Google Drive account with a realistic
mix of file sizes. A good target:

```
Benchmark/
├── file-10mb-1.bin     (~10 MB)
├── file-10mb-2.bin     (~10 MB)
├── file-10mb-3.bin     (~10 MB)
├── file-10mb-4.bin     (~10 MB)
├── file-10mb-5.bin     (~10 MB)
├── file-50mb-1.bin     (~50 MB)
├── file-50mb-2.bin     (~50 MB)
├── file-50mb-3.bin     (~50 MB)
├── file-100mb-1.bin    (~100 MB)
└── file-100mb-2.bin    (~100 MB)
```

~400 MB total. You can use any file types (images, PDFs, videos, etc.).
Google Docs, Sheets, and Slides are also supported — they are exported to
Office formats during migration.

> **Important**: The BENCHMARK_SOURCE_FOLDER_ID should point to this folder.
> Do NOT point it at a personal Drive root or a large folder you cannot afford
> to duplicate.

---

## 3. Environment Variables

### Required

| Variable | Description |
|---|---|
| BENCHMARK_USER_ID | DriveShift user ID that owns both connected accounts |
| BENCHMARK_SOURCE_ACCOUNT_ID | ConnectedAccount.id for the source Google account |
| BENCHMARK_DEST_ACCOUNT_ID | ConnectedAccount.id for the destination Google account |
| BENCHMARK_SOURCE_FOLDER_ID | Google Drive folder ID of the benchmark dataset |

### Optional

| Variable | Default | Description |
|---|---|---|
| WORKER_CONCURRENCY | 2 | Worker concurrency, recorded for reporting; set it before starting the server |
| BENCHMARK_TIMEOUT_MINUTES | 30 | Max wait time per benchmark run |
| BENCHMARK_RUNS | 1 | Number of consecutive runs per invocation |
| BENCHMARK_RUN_LABEL | "" | Freeform label stored in results (e.g. concurrency-1-run-1) |

---

## 4. How to Obtain the Required Values

### BENCHMARK_SOURCE_ACCOUNT_ID / BENCHMARK_DEST_ACCOUNT_ID

From the server directory, run the account inspection script:

```bash
npx tsx scripts/inspect-benchmark-accounts.ts
```

Use the displayed user ID for BENCHMARK_USER_ID and the connected account IDs
for BENCHMARK_SOURCE_ACCOUNT_ID and BENCHMARK_DEST_ACCOUNT_ID. The inspection
script prints user and account details; treat its output as private.

For cross-account benchmarking, source and destination must be **different**
connected accounts.

### BENCHMARK_SOURCE_FOLDER_ID

1. Create your benchmark dataset folder in Google Drive.
2. Open the folder in Drive.
3. The URL will look like:
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv
4. The folder ID is the last path segment: 1AbCdEfGhIjKlMnOpQrStUv

---

## 5. How to Start the API and Worker

The worker starts automatically inside server.ts when the server starts.
Concurrency is controlled by WORKER_CONCURRENCY.

```bash
# Navigate to the server directory
cd server

# Start with concurrency 1
WORKER_CONCURRENCY=1 npm run dev

# Or on Windows PowerShell:
$env:WORKER_CONCURRENCY = "1"
npm run dev
```

On Windows (Command Prompt):

```cmd
set WORKER_CONCURRENCY=1
npm run dev
```

Or add to server/.env (temporarily, for a benchmark session):

```
WORKER_CONCURRENCY=1
```

---

## 6. How to Set Concurrency

The production worker default is 2. To benchmark other values:

1. Stop the server (Ctrl+C).
2. Change WORKER_CONCURRENCY (env var or .env).
3. Restart the server.
4. Run the benchmark.

**Do not change WORKER_CONCURRENCY while the server is running** — the
worker reads it once at startup.

---

## 7. How to Run the Benchmark

Set your env vars in server/.env (or export them), then:

```bash
cd server
npx tsx scripts/benchmark-migration.ts
```

The server and benchmark process are separate. Set WORKER_CONCURRENCY before
starting the server and use the same value in the benchmark process so the
recorded value matches the worker configuration.

Or with inline env vars (Linux/macOS):

```bash
BENCHMARK_USER_ID=cluser...
BENCHMARK_SOURCE_ACCOUNT_ID=clxxx...
BENCHMARK_DEST_ACCOUNT_ID=clyyy...
BENCHMARK_SOURCE_FOLDER_ID=1AbC...
WORKER_CONCURRENCY=1
BENCHMARK_RUN_LABEL="concurrency-1-run-1"
npx tsx scripts/benchmark-migration.ts
```

Windows PowerShell:

```powershell
$env:BENCHMARK_USER_ID = "cluser..."
$env:BENCHMARK_SOURCE_ACCOUNT_ID = "clxxx..."
$env:BENCHMARK_DEST_ACCOUNT_ID = "clyyy..."
$env:BENCHMARK_SOURCE_FOLDER_ID = "1AbC..."
$env:WORKER_CONCURRENCY = "1"
$env:BENCHMARK_RUN_LABEL = "concurrency-1-run-1"
npx tsx scripts/benchmark-migration.ts
```

---

## 8. How to Repeat Runs

Each run migrates the source folder into a **new** destination folder. Runs
do not interfere with each other.

**Recommended workflow (3 runs per concurrency level):**

```
# Terminal 1 — Start the server with concurrency 1
WORKER_CONCURRENCY=1 npm run dev

# Terminal 2 — Run benchmarks (one at a time, manually labelled)

BENCHMARK_RUN_LABEL="concurrency-1-run-1" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-1-run-2" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-1-run-3" npx tsx scripts/benchmark-migration.ts

# Restart server with concurrency 2
# Terminal 1: Ctrl+C → WORKER_CONCURRENCY=2 npm run dev

BENCHMARK_RUN_LABEL="concurrency-2-run-1" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-2-run-2" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-2-run-3" npx tsx scripts/benchmark-migration.ts

# Restart server with concurrency 4
# Terminal 1: Ctrl+C → WORKER_CONCURRENCY=4 npm run dev

BENCHMARK_RUN_LABEL="concurrency-4-run-1" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-4-run-2" npx tsx scripts/benchmark-migration.ts
BENCHMARK_RUN_LABEL="concurrency-4-run-3" npx tsx scripts/benchmark-migration.ts
```

Or use BENCHMARK_RUNS=3 for automatic consecutive runs (3 copies created):

```bash
BENCHMARK_RUNS=3 BENCHMARK_RUN_LABEL="concurrency-1" tsx scripts/benchmark-migration.ts
```

---

## 9. How Metrics Are Calculated

### Duration

```
durationSeconds = endTime - startTime
```

- startTime: recorded just before the benchmark creates the job and enqueues it
- endTime:   recorded when the poll loop detects a terminal status

Duration includes job creation, queue insertion, worker wait and processing, and
the final polling interval.

### Files per minute

```
filesPerMinute = completedFiles / (durationSeconds / 60)
```

Only counts **successfully migrated** files (status = COMPLETED).

### Throughput (MB/s)

```
throughputMBps = totalMB / durationSeconds
```

**Currently reported as "N/A"** because the current MigrationItem Prisma schema
does not store per-file byte sizes. The Google Drive API returns a size field
but it is not persisted to the database.

To enable throughput measurement in the future, add a fileSize (Int/BigInt)
column to MigrationItem and populate it during onFileResult.

### Retries

Reported as **"unavailable"**. BullMQ stores retry counts on the queue job object
(job.attemptsMade), but the benchmark polls PostgreSQL directly, which
has no retry column. Retry information is visible in BullMQ's Redis data but
reading it would require a direct Redis connection, which the benchmark script
intentionally avoids to keep it simple.

---

## 10. How to Interpret Results

Results are saved to benchmarks/results/benchmark-results.json.

Each entry in the JSON array is one benchmark run:

```json
{
  "timestamp":         "2026-09-21T17:00:00.000Z",
  "runLabel":          "concurrency-1-run-1",
  "workerConcurrency": 1,
  "sourceFolderId":    "1AbC...",
  "jobId":             "clxxx...",
  "status":            "COMPLETED",
  "files":             10,
  "folders":           1,
  "totalBytes":        0,
  "totalMB":           0,
  "completedFiles":    10,
  "failedFiles":       0,
  "retries":           "unavailable",
  "startTime":         "2026-09-21T17:00:00.123Z",
  "endTime":           "2026-09-21T17:00:42.456Z",
  "durationSeconds":   42.333,
  "throughputMBps":    null,
  "filesPerMinute":    14.17,
  "errorMessage":      null,
  "timedOut":          false,
  "apiUrl":            "Direct Service Call",
  "note":              "throughputMBps is null because MigrationItem does not store file sizes."
}
```

### Comparison table format

After running all concurrency levels, construct a table from benchmark-results.json:

| Concurrency | Files | Total Size | Time (s) | MB/s | Files/min | Failed |
|-------------|-------|------------|----------|------|-----------|--------|
| 1           | 10    | N/A        | _actual_ | N/A  | _actual_  | 0      |
| 2           | 10    | N/A        | _actual_ | N/A  | _actual_  | 0      |
| 4           | 10    | N/A        | _actual_ | N/A  | _actual_  | 0      |

**This script cannot measure the effect of worker concurrency** because it
submits one job at a time. Use multiple simultaneous jobs to compare worker
concurrency. For any comparison, also consider:

- Network conditions at the time of the run
- Google Drive API quota and throttling
- File sizes in the dataset
- Number of retries (if available)
- Whether the API server was under other load

For runs to be comparable:

- Use the **same source folder** every run (same files)
- Use the **same machine, network, Redis, and PostgreSQL**
- Only change WORKER_CONCURRENCY between runs

---

## 11. Benchmark Limitations

1. **No byte-level throughput**: MigrationItem does not store file sizes.
   throughputMBps is always null in the current schema.

2. **No retry count**: BullMQ retry information is not persisted to Postgres.

3. **Single-job concurrency**: Each benchmark run creates one MigrationJob
   (one folder migration). The worker concurrency setting affects how many
   *parallel jobs* the worker processes. For a single-folder migration, the
   worker processes files sequentially (the folder traversal in
   googleDriveService.migrateFolder() is sequential). To see concurrency
   benefits, you would need multiple simultaneous MigrationJobs.

4. **Google Drive API variability**: Observed throughput varies significantly
   based on Google's infrastructure. Run multiple times and average.

5. **User and account access**: The configured user must own both connected
   accounts, and both accounts must remain authorized for the duration of a run.

6. **Destination folder accumulation**: Each run creates a new folder in the
   destination Drive. Clean up manually after benchmarking.

7. **Network dependency**: Results are specific to the network path between
   your machine, your Google account's data center, and Google's servers.
   Do not compare results across different machines or network environments.

---

## 12. Quick Reference

```bash
# 1. Start the server (from server/)
WORKER_CONCURRENCY=1 npm run dev

# 2. Run a single benchmark run (from server/)
BENCHMARK_RUN_LABEL="c1-run-1" tsx scripts/benchmark-migration.ts

# 3. View saved results
cat benchmarks/results/benchmark-results.json | python -m json.tool
```

---

*Results directory: benchmarks/results/*
*Results are excluded from git (see .gitignore).*
