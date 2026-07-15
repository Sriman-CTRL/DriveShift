import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { googleDriveService } from "../providers/google/drive.service";

class DriveController {

    async listFiles(req: AuthRequest, res: Response) {

        const account = await prisma.connectedAccount.findFirst({
            where: {
                userId: req.user!.userId,
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

        const files = await googleDriveService.listFiles(
            account.accessToken
        );

        return res.status(200).json({
            files,
        });
    }
}

export const driveController = new DriveController();