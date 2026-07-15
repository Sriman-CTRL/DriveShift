import { Router } from "express";
import passport from "./passport.js";

const router = Router();

// Google Login
router.get(
  "/google",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    session: false,
  })
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

export default router;