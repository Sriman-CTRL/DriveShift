import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { googleDriveService } from "../providers/google/drive.service";

class DriveController {
    constructor() {
        this.listFiles = this.listFiles.bind(this);
        this.getFile = this.getFile.bind(this);
        this.downloadFile = this.downloadFile.bind(this);
        this.uploadFile = this.uploadFile.bind(this);
    }

    private getFileId(req: Request) {
        const fileId = Array.isArray(req.params.fileId)
            ? req.params.fileId[0]
            : req.params.fileId;

        if (!fileId) {
            throw new Error("File ID is required");
        }

        return fileId;
    }

    private async getGoogleAccount(userId: string, accountId?: string | null) {
        if (accountId) {
            return prisma.connectedAccount.findFirst({
                where: {
                    id: accountId,
                    userId,
                    provider: "google",
                },
            });
        }
        return prisma.connectedAccount.findFirst({
            where: {
                userId,
                provider: "google",
            },
        });
    }

    async listFiles(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const accountId = typeof req.query.accountId === "string" ? req.query.accountId : null;
        const account = await this.getGoogleAccount(authReq.user!.userId, accountId);

        if (!account) {
            return res.status(404).json({
                message: "Google account not connected",
            });
        }

        if (!account.accessToken) {
            return res.status(400).json({
                message: "Google access token not found",
            });
        }

        const files = await googleDriveService.listFiles({
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
            tokenExpiry: account.tokenExpiry,
            userId: account.userId,
            providerUserId: account.providerUserId,
        });

        return res.status(200).json({
            files,
        });
    }

    async getFile(req: Request, res: Response) {
        try {
            const authReq = req as AuthRequest;
            const fileId = this.getFileId(req);
            const accountId = typeof req.query.accountId === "string" ? req.query.accountId : null;
            const account = await this.getGoogleAccount(authReq.user!.userId, accountId);

            if (!account?.accessToken) {
                return res.status(400).json({
                    message: "Google account not connected",
                });
            }

            const file = await googleDriveService.getFile(
                {
                    accessToken: account.accessToken,
                    refreshToken: account.refreshToken,
                    tokenExpiry: account.tokenExpiry,
                    userId: account.userId,
                    providerUserId: account.providerUserId,
                },
                fileId
            );

            return res.json(file);
        } catch (error) {
            if (error instanceof Error && error.message === "File ID is required") {
                return res.status(400).json({
                    message: error.message,
                });
            }

            console.error(error);
            return res.status(500).json({
                message: "Failed to fetch file",
            });
        }
    }

    async downloadFile(req: Request, res: Response) {
        try {
            const authReq = req as AuthRequest;
            const fileId = this.getFileId(req);
            const accountId = typeof req.query.accountId === "string" ? req.query.accountId : null;
            const account = await this.getGoogleAccount(authReq.user!.userId, accountId);

            if (!account?.accessToken) {
                return res.status(400).json({
                    message: "Google account not connected",
                });
            }

            const { stream } = await googleDriveService.downloadFile(
                {
                    accessToken: account.accessToken,
                    refreshToken: account.refreshToken,
                    tokenExpiry: account.tokenExpiry,
                    userId: account.userId,
                    providerUserId: account.providerUserId,
                },
                fileId
            );

            stream.pipe(res);
            return;
        } catch (error) {
            if (error instanceof Error && error.message === "File ID is required") {
                return res.status(400).json({
                    message: error.message,
                });
            }

            console.error(error);
            return res.status(500).json({
                message: "Failed to download file",
            });
        }
    }

    async uploadFile(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                message: "No file uploaded",
            });
        }

        const accountId =
            typeof req.body?.accountId === "string"
                ? req.body.accountId
                : typeof req.query.accountId === "string"
                    ? req.query.accountId
                    : null;

        const account = await this.getGoogleAccount(authReq.user!.userId, accountId);

        if (!account?.accessToken) {
            return res.status(400).json({
                message: "Google account not connected",
            });
        }

        const uploadedFile = await googleDriveService.uploadFile(
            {
                accessToken: account.accessToken,
                refreshToken: account.refreshToken,
                tokenExpiry: account.tokenExpiry,
                userId: account.userId,
                providerUserId: account.providerUserId,
            },
            file
        );

        return res.status(201).json({
            message: "File uploaded successfully",
            file: uploadedFile,
        });
    }
}

export const driveController = new DriveController();