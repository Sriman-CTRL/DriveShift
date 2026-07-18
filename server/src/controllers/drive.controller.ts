import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { googleDriveService } from "../providers/google/drive.service";

class DriveController {

    async listFiles(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const account = await prisma.connectedAccount.findFirst({
            where: {
                userId: authReq.user!.userId,
                provider: "google",
            },
        });

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
        const authReq = req as AuthRequest;
        const fileId = Array.isArray(req.params.fileId)
            ? req.params.fileId[0]
            : req.params.fileId;

        if (!fileId) {
            return res.status(400).json({
                message: "File ID is required",
            });
        }

        const account = await prisma.connectedAccount.findFirst({
            where: {
                userId: authReq.user!.userId,
                provider: "google",
            },
        });

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
    }

    async downloadFile(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const fileId = Array.isArray(req.params.fileId)
            ? req.params.fileId[0]
            : req.params.fileId;

        if (!fileId) {
            return res.status(400).json({
                message: "File ID is required",
            });
        }

        const account = await prisma.connectedAccount.findFirst({
            where: {
                userId: authReq.user!.userId,
                provider: "google",
            },
        });

        if (!account?.accessToken) {
            return res.status(400).json({
                message: "Google account not connected",
            });
        }

        const stream = await googleDriveService.downloadFile(
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
    }
    async uploadFile(req: Request, res: Response) {

    const authReq = req as AuthRequest;

    const file = req.file;

    if (!file) {
        return res.status(400).json({
            message: "No file uploaded",
        });
    }

    const account = await prisma.connectedAccount.findFirst({
        where: {
            userId: authReq.user!.userId,
            provider: "google",
        },
    });

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