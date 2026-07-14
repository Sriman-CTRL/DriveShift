import { Router } from "express";
import { driveController } from "../controllers/drive.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get(
    "/files",
    authMiddleware,
    driveController.listFiles
);

export default router;