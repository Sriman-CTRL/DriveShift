import { Router } from "express";
import { migrationController } from "../controllers/migration.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, migrationController.createMigrationJob);
router.get("/", authMiddleware, migrationController.listMigrationJobs);
router.get("/:jobId", authMiddleware, migrationController.getMigrationJob);

export default router;
