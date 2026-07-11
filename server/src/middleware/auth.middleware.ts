import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";


export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
    };
}

export const authMiddleware = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Authorization header missing",
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Token missing",
        });
    }

    try {
        const decoded = jwt.verify(
            token,
            env.JWT_SECRET
        ) as {
            userId: string;
            email: string;
        };

        req.user = decoded;

        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
};