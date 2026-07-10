import { Router } from "express";
import passport from "./passport.js";

const router = Router();

// Initiate Google Authentication
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google Authentication Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.json({
      message: "Successfully authenticated with Google",
      user: req.user,
    });
  }
);

// User Profile
router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  res.json(req.user);
});

// Logout
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.json({ message: "Successfully logged out" });
  });
});

export default router;