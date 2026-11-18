import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

function separator(character: string = "=", width: number = 48): string {
    return character.repeat(width);
}

async function main(): Promise<void> {
    console.log("");
    console.log("DriveShift Benchmark Account Inspection");
    console.log(separator());

    const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            email: true,
            name: true,
            accounts: {
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    provider: true,
                    providerUserId: true,
                    createdAt: true,
                    user: { select: { email: true, name: true } },
                },
            },
        },
    });

    if (users.length === 0) {
        console.log("No users found.");
        return;
    }

    for (const user of users) {
        console.log("");
        console.log("User:");
        console.log("  ID:    " + user.id);
        console.log("  Email: " + user.email);
        console.log("  Name:  " + user.name);

        if (user.accounts.length === 0) {
            console.log("  Accounts: none");
        } else {
            console.log("  Connected Accounts:");
            for (const [index, account] of user.accounts.entries()) {
                console.log("  " + (index + 1) + ".");
                console.log("    ID:             " + account.id);
                console.log("    Provider:       " + account.provider);
                console.log("    ProviderUserId: " + account.providerUserId);
                console.log("    Account email:  " + account.user.email);
                console.log("    Account name:   " + account.user.name);
                console.log("    Connected at:   " + account.createdAt.toISOString());
            }
        }

        console.log(separator("-"));
    }

    console.log("Total users: " + users.length);
    console.log(separator());
}

main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
