import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

class AuthController {
    async me(req: Request, res: Response) {
        const authReq = req as AuthRequest;

        const user = await prisma.user.findUnique({
            where: {
                id: authReq.user!.userId,
            },
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        return res.json(user);
    }

    async accounts(req: Request, res: Response) {
        const authReq = req as AuthRequest;

        const accounts = await prisma.connectedAccount.findMany({
            where: { userId: authReq.user!.userId },
            select: {
                id: true,
                provider: true,
                providerUserId: true,
                createdAt: true,
                user: { select: { email: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
        });

        return res.json({ accounts });
    }
}

export const authController = new AuthController();