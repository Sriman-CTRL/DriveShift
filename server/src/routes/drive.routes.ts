import { Router, Request } from "express";
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
    (req, _res, next) => {
        const uploadDebugReq = req as Request & {
            body?: unknown;
            file?: unknown;
            files?: unknown;
        };

        console.debug("[upload-debug] before multer", {
            contentType: req.headers["content-type"],
            headers: req.headers,
            body: uploadDebugReq.body,
            file: uploadDebugReq.file,
            files: uploadDebugReq.files,
        });

        next();
    },
    upload.single("file"),
    (req, _res, next) => {
        const uploadDebugReq = req as Request & {
            body?: unknown;
            file?: unknown;
            files?: unknown;
        };

        console.debug("[upload-debug] after multer", {
            contentType: req.headers["content-type"],
            headers: req.headers,
            body: uploadDebugReq.body,
            file: uploadDebugReq.file,
            files: uploadDebugReq.files,
        });

        next();
    },
    driveController.uploadFile
);
router.post(
    "/migrate/:fileId",
    authMiddleware,
    driveController.migrateFile
);

export default router;