// cancel_test.ts — end-to-end cancellation test
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET!;

async function req(method: string, path: string, body?: object, token?: string) {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  // 1. Get connected accounts from DB
  const accounts = await prisma.connectedAccount.findMany({
    include: { user: true },
    take: 10,
  });

  if (accounts.length < 2) {
    console.error("❌ Need at least 2 connected Google accounts in DB. Found:", accounts.length);
    return;
  }

  // Group by userId
  const byUser: Record<string, typeof accounts> = {};
  for (const a of accounts) {
    if (!byUser[a.userId]) byUser[a.userId] = [];
    byUser[a.userId].push(a);
  }

  const userWithTwo = Object.values(byUser).find(arr => arr.length >= 2);
  if (!userWithTwo) {
    console.error("❌ Need a user with at least 2 connected accounts. Current:");
    Object.entries(byUser).forEach(([uid, arr]) =>
      console.error(`  userId=${uid} → ${arr.length} account(s)`)
    );
    return;
  }

  const [srcAcc, dstAcc] = userWithTwo;
  const user = srcAcc.user;

  console.log("👤 User:", user.email, `(id=${user.id})`);
  console.log("📂 Source account:", srcAcc.id, `(${srcAcc.provider})`);
  console.log("📁 Dest account:  ", dstAcc.id, `(${dstAcc.provider})`);

  // 2. Generate JWT
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
  console.log("\n🔑 JWT generated (first 40 chars):", token.slice(0, 40) + "...");

  // 3. Get a real folder ID
  console.log("\n📋 Listing root folders in source account...");
  const driveRes = await req("GET", `/drive/files?accountId=${srcAcc.id}&folderId=root`, undefined, token);
  console.log("Drive list status:", driveRes.status);

  let sourceFolderId = "root";
  if (driveRes.status === 200 && Array.isArray(driveRes.body)) {
    const folder = driveRes.body.find((f: any) => f.mimeType === "application/vnd.google-apps.folder");
    if (folder) {
      sourceFolderId = folder.id;
      console.log("📂 Using folder:", folder.name, `(id=${folder.id})`);
    } else {
      console.log("⚠️  No subfolders found, using 'root'");
    }
  } else {
    console.log("⚠️  Drive list failed:", JSON.stringify(driveRes.body).slice(0, 200));
  }

  // 4. Create migration job
  console.log("\n🚀 Step 1: Creating migration job...");
  const createRes = await req("POST", "/migrations", {
    sourceAccountId: srcAcc.id,
    destAccountId: dstAcc.id,
    sourceFolderId,
  }, token);

  console.log("Create response:", JSON.stringify(createRes, null, 2));

  if (createRes.status !== 202) {
    console.error("❌ Failed to create migration job");
    return;
  }

  const jobId = createRes.body.job.id;
  console.log(`\n✅ Job created: ${jobId} | Initial status: ${createRes.body.job.status}`);

  // 5. Cancel immediately
  console.log("\n🛑 Step 2: Cancelling immediately...");
  const cancelRes = await req("POST", `/migrations/${jobId}/cancel`, undefined, token);
  console.log("Cancel response:", JSON.stringify(cancelRes, null, 2));

  // 6. Check status right after cancel
  console.log("\n🔍 Step 3: Status immediately after cancel...");
  const status1 = await req("GET", `/migrations/${jobId}`, undefined, token);
  console.log("  status:", status1.body.status, "| progress:", status1.body.progress + "%");

  // 7. Poll for 20s — worker must NOT flip CANCELLED → FAILED
  console.log("\n⏱  Step 4: Polling 20s — verifying worker respects CANCELLED...");
  let passed = false;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await req("GET", `/migrations/${jobId}`, undefined, token);
    const s = poll.body.status;
    const p = poll.body.progress;
    const ts = new Date().toLocaleTimeString();
    console.log(`  [${ts}] +${(i + 1) * 2}s → status=${s}, progress=${p}%`);

    if (s === "FAILED") {
      console.error("\n❌ FAIL: Worker overwrote CANCELLED with FAILED!");
      break;
    }
    if (s === "CANCELLED" && i >= 4) {
      console.log("\n✅ PASS: CANCELLED held stable for 10+ seconds!");
      passed = true;
      break;
    }
  }

  // 8. Final state
  const final = await req("GET", `/migrations/${jobId}`, undefined, token);
  console.log("\n📊 Final job state:");
  console.log(JSON.stringify({
    status: final.body.status,
    progress: final.body.progress,
    errorMessage: final.body.errorMessage,
    completedFiles: final.body.completedFiles,
    totalFiles: final.body.totalFiles,
    completedFolders: final.body.completedFolders,
    totalFolders: final.body.totalFolders,
  }, null, 2));

  if (!passed && final.body.status === "CANCELLED") {
    console.log("\n✅ Final status is CANCELLED — test passed!");
  } else if (final.body.status === "FAILED") {
    console.error("\n❌ FINAL STATUS IS FAILED — cancellation not preserved!");
  } else if (final.body.status === "COMPLETED") {
    console.log("\n⚠️  Completed before cancel could take effect (use a larger folder).");
  }
}

main()
  .catch(e => console.error("Script error:", e))
  .finally(() => prisma.$disconnect());
