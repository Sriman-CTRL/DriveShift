import { Router } from "express";
import { driveController } from "../controllers/drive.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { upload } from "../middleware/upload.middleware";

const router = Router();

router.get(
    "/files",
    authMiddleware,
    driveController.listFiles
);
router.get(
    "/files/:fileId",
    authMiddleware,
    driveController.getFile
);
router.get(
    "/files/:fileId/download",
    authMiddleware,
    driveController.downloadFile
);
router.post(
    "/upload",
    authMiddleware,
    upload.single("file"),
    driveController.uploadFile
);

export default router;