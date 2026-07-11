import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

class AuthController {
    async me(req: AuthRequest, res: Response) {
        const user = await prisma.user.findUnique({
            where: {
                id: req.user!.userId,
            },
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        return res.json(user);
    }
}

export const authController = new AuthController();