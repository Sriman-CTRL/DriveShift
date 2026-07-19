import { Router } from "express";
import passport from "../auth/passport.js";
import { authController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Google Login
router.get(
  "/google",
  (req, res, next) => {
    const state = req.query.state as string || "";
    passport.authenticate("google", {
      scope: ["profile", "email", GOOGLE_DRIVE_SCOPE],
      accessType: "offline",
      prompt: "consent",
      includeGrantedScopes: true,
      session: false,
      state: state || undefined,
    })(req, res, next);
  }
);

// Google Callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  (req, res) => {
    const auth = req.user as {
      user: any;
      token: string;
    };

    res.json({
      message: "Successfully authenticated",
      token: auth.token,
      user: auth.user,
    });
  }
);

// Me Profile
router.get(
    "/me",
    authMiddleware,
    authController.me
);

export default router;