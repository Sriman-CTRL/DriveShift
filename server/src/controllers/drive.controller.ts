import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { googleDriveService } from "../providers/google/drive.service";

class DriveController {

    async listFiles(req: AuthRequest, res: Response) {

        const account =
            await prisma.connectedAccount.findFirst({

                where: {
                    userId: req.user!.userId,
                    provider: "google",
                },

            });

        if (!account?.accessToken) {

            return res.status(400).json({
                message: "Google account not connected",
            });

        }

        const files =
            await googleDriveService.listFiles(
                account.accessToken
            );

        return res.json(files);

    }

}

export const driveController =
    new DriveController();