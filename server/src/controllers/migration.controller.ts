import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { migrationService } from "../services/migration.service";

class MigrationController {
    async createMigrationJob(req: Request, res: Response) {
        try {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    message: "Unauthorized",
                });
            }

            const { sourceAccountId, destAccountId, sourceFileId } = req.body;

            if (!sourceAccountId || !destAccountId || !sourceFileId) {
                return res.status(400).json({
                    message: "sourceAccountId, destAccountId, and sourceFileId are required",
                });
            }

            // Verify accounts belong to the user
            const sourceAccount = await prisma.connectedAccount.findFirst({
                where: { id: sourceAccountId, userId },
            });

            const destAccount = await prisma.connectedAccount.findFirst({
                where: { id: destAccountId, userId },
            });

            if (!sourceAccount || !destAccount) {
                return res.status(404).json({
                    message: "Source or destination account not found or not owned by user",
                });
            }

            const job = await migrationService.createMigrationJob({
                userId,
                sourceAccountId,
                destAccountId,
                sourceFileId,
            });

            // Execute the migration asynchronously in the background
            migrationService.executeMigration(job.id).catch((err) => {
                console.error(`[BackgroundMigration] Job ${job.id} failed:`, err);
            });

            return res.status(202).json({
                message: "Migration job queued successfully",
                job,
            });
        } catch (error) {
            console.error("[MigrationController] createMigrationJob error:", error);
            return res.status(500).json({
                message: "Failed to queue migration job",
            });
        }
    }

    async getMigrationJob(req: Request, res: Response) {
        try {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.userId;
            const jobId = Array.isArray(req.params.jobId)
                ? req.params.jobId[0]
                : req.params.jobId;

            if (!jobId) {
                return res.status(400).json({
                    message: "Job ID is required",
                });
            }

            if (!userId) {
                return res.status(401).json({
                    message: "Unauthorized",
                });
            }

            const job = await prisma.migrationJob.findUnique({
                where: { id: jobId },
                include: {
                    sourceAccount: {
                        select: { id: true, provider: true, providerUserId: true },
                    },
                    destAccount: {
                        select: { id: true, provider: true, providerUserId: true },
                    },
                },
            });

            if (!job || job.userId !== userId) {
                return res.status(404).json({
                    message: "Migration job not found",
                });
            }

            return res.status(200).json(job);
        } catch (error) {
            console.error("[MigrationController] getMigrationJob error:", error);
            return res.status(500).json({
                message: "Failed to fetch migration job",
            });
        }
    }

    async listMigrationJobs(req: Request, res: Response) {
        try {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    message: "Unauthorized",
                });
            }

            const jobs = await prisma.migrationJob.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                include: {
                    sourceAccount: {
                        select: { id: true, provider: true, providerUserId: true },
                    },
                    destAccount: {
                        select: { id: true, provider: true, providerUserId: true },
                    },
                },
            });

            return res.status(200).json(jobs);
        } catch (error) {
            console.error("[MigrationController] listMigrationJobs error:", error);
            return res.status(500).json({
                message: "Failed to list migration jobs",
            });
        }
    }
}

export const migrationController = new MigrationController();
