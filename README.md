# DriveShift

DriveShift is a web app for moving files and folders between Google Drive
accounts. It queues migrations in the background, streams file contents between
Google Drive APIs, and records job and per-file progress so you can monitor or
cancel a migration without keeping the browser open.

> **Current scope:** Google Drive is the only provider wired into the running
> application. Microsoft Drive and Dropbox strategy files are not currently
> exposed as working integrations.

## What it does

- Sign in with Google OAuth and connect Google Drive accounts.
- Choose a source account, a folder, and a destination account in the web UI.
- Recursively copy a folder tree across accounts. Standard files are streamed
  from source to destination rather than saved to an intermediate local file.
- Export Google Docs, Sheets, Slides, and Drawings to `.docx`, `.xlsx`, `.pptx`,
  and `.png` respectively.
- Track migration status, overall progress, and per-file outcomes.
- Cancel queued or running jobs. Cancellation is cooperative; already copied
  files are not rolled back.
- Retry failed BullMQ jobs up to three attempts with exponential backoff.

Google-native file types other than Docs, Sheets, Slides, and Drawings are not
exported. A folder migration can finish with a failed status when individual
files cannot be copied; inspect the job's item errors for details.

## How it works

```mermaid
flowchart LR
    Browser[React client] -->|REST + JWT| API[Express API]
    API --> DB[(PostgreSQL / Prisma)]
    API --> Queue[BullMQ queue]
    Queue --> Redis[(Redis)]
    Worker[Migration worker] --> Queue
    Worker --> DB
    Worker -->|read and stream| Source[Google Drive source]
    Worker -->|upload| Destination[Google Drive destination]
```

The client uses Vite in development and proxies `/auth`, `/drive`, and
`/migrations` to the API. The API creates migration records in PostgreSQL and
enqueues work in Redis. A BullMQ worker processes the job and updates progress
and item results in PostgreSQL. The worker runs in the API process when
`server/src/server.ts` starts.

## Technology

| Area | Stack |
|---|---|
| Web client | React 19, TypeScript, Vite 8, React Router, Tailwind CSS 4 |
| API | Node.js, Express 5, TypeScript |
| Authentication | Google OAuth 2.0, Passport, JWT |
| Background work | BullMQ and Redis |
| Persistence | PostgreSQL and Prisma |
| Google Drive | Google Drive API v3 via `googleapis` |

## Requirements

- Node.js 22.12 or newer (Node.js 24 is also suitable) and npm.
- PostgreSQL, with a database created for DriveShift.
- Redis, available at `redis://localhost:6379` or your configured URL.
- A Google Cloud project with the Google Drive API enabled and OAuth 2.0
  credentials configured for the callback URL below.

PostgreSQL and Redis are external services; this repository does not currently
provide a Compose setup for them.

## Configure Google OAuth

1. In Google Cloud Console, create or select a project and enable the **Google
   Drive API**.
2. Configure the OAuth consent screen and add your Google account as a test user
   if the app is in testing mode.
3. Create an OAuth client ID for a **Web application**.
4. Add this authorized redirect URI to the OAuth client:
   `http://localhost:5000/auth/google/callback`
5. Put the client ID and secret in the server environment as shown below.

DriveShift requests the `profile`, `email`, and
`https://www.googleapis.com/auth/drive` scopes.

## Run locally

There is no root `package.json`; install and run the client and server from
their own directories.

### 1. Start PostgreSQL and Redis

Start both services locally or use hosted development instances. Create a
PostgreSQL database, then note its connection URL and the Redis URL.

### 2. Configure the API

Create `server/.env` with the following values:

```dotenv
PORT=5000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/driveshift?schema=public"
REDIS_URL="redis://localhost:6379"

GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:5000/auth/google/callback"

JWT_SECRET="replace-with-a-long-random-secret"
SESSION_SECRET="replace-with-another-long-random-secret"

# Optional: worker concurrency; defaults to 2
WORKER_CONCURRENCY=2
```

Generate distinct, high-entropy values for `JWT_SECRET` and `SESSION_SECRET`.
Keep `server/.env` private and never commit real credentials.

Install dependencies, apply database migrations, generate the Prisma client,
and start the API and worker:

```powershell
cd server
npm ci
npx prisma migrate deploy
npx prisma generate
npm run dev
```

The API listens on `http://localhost:5000` by default. Check
`http://localhost:5000/health` for the health response.

### 3. Start the web client

In a second terminal:

```powershell
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. The Vite development server proxies API requests
to `http://localhost:5000`.

### 4. Connect accounts and migrate

Use Google sign-in, connect source and destination Drive accounts, then create
a migration from the dashboard. The source and destination accounts must both
belong to the authenticated DriveShift user.

## API overview

Protected endpoints require `Authorization: Bearer <JWT>`. The Google OAuth
callback returns the JWT and user as JSON.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | API health check |
| `GET` | `/auth/google` | Start Google OAuth |
| `GET` | `/auth/google/callback` | Complete OAuth; returns token and user |
| `GET` | `/auth/me` | Get the authenticated user |
| `GET` | `/auth/accounts` | List the authenticated user's connected accounts |
| `GET` | `/drive/files?accountId=<id>` | List up to 20 non-trashed Drive files |
| `GET` | `/drive/files/:fileId?accountId=<id>` | Get Drive file metadata |
| `GET` | `/drive/files/:fileId/download?accountId=<id>` | Stream a file download |
| `POST` | `/drive/upload?accountId=<id>` | Upload multipart field `file` |
| `POST` | `/migrations` | Queue a folder migration; responds `202 Accepted` |
| `GET` | `/migrations` | List the user's migration jobs |
| `GET` | `/migrations/:jobId` | Get a job and its file items |
| `POST` | `/migrations/:jobId/cancel` | Cancel a queued or running job |

Create a folder migration with:

```http
POST /migrations
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "sourceAccountId": "<source-connected-account-id>",
  "destAccountId": "<destination-connected-account-id>",
  "sourceFolderId": "<google-drive-folder-id>"
}
```

Migration statuses are `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, and
`CANCELLED`. The create endpoint currently requires `sourceFolderId`; although
single-file migration logic exists in the service, it is not wired through the
public API yet.

## Project layout

```text
client/
  src/pages/          Landing, login, dashboard, accounts, history, migration UI
  src/api/            Browser API client and endpoint wrappers
  src/context/        Authentication state
server/
  prisma/             PostgreSQL schema and migrations
  src/auth/           Google OAuth and account handling
  src/controllers/    HTTP request handlers
  src/migration/      BullMQ queue and worker
  src/providers/      Google Drive API integration
  src/routes/         API route definitions
  src/services/       Migration and JWT services
  tests/              API, service, and worker tests
  scripts/            Benchmark and account-inspection utilities
BENCHMARK.md          Migration benchmark guide
```

## Development and tests

Run the API TypeScript build and test suite:

```powershell
cd server
npm run build
npm run test:run
```

Run the client production build and linter:

```powershell
cd client
npm run build
npm run lint
```

To configure and run the migration benchmark, see
[BENCHMARK.md](BENCHMARK.md). Benchmark runs create real destination copies in
Google Drive; only use a dedicated test folder and accounts.

## Current development notes

- The Google OAuth callback currently responds with JSON (`token` and `user`).
  The login page expects a redirect back with a `?token=...` query parameter,
  so the browser login handoff needs to be aligned before the full UI sign-in
  flow works end to end.
- The UI allows selecting individual files, but the migration creation API
  currently accepts folder IDs only. Use a folder for migrations until
  single-file support is wired through the API.
- The backend can associate an OAuth account with an existing user through a
  signed `state` value, but the web client's “Add Account” action does not
  currently provide that value. A second Google identity may therefore create
  a separate DriveShift user instead of becoming a usable destination account.
- Microsoft and Dropbox strategy files exist, but those providers are not
  registered in the running authentication flow.
- Migration progress and item details are persisted in PostgreSQL. Real-time
  updates are retrieved by the client through API polling, not a WebSocket.