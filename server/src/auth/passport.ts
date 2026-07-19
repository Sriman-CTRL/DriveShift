import { Request } from "express";
import passport from "passport";
import { Profile, Strategy as GoogleStrategy, VerifyCallback } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { authService } from "./auth.service.js";
import { jwtService } from "../services/jwt.service.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (
      req: Request,
      accessToken: string,
      refreshToken: string | undefined,
      params: { expires_in?: number; expiry_date?: number } | undefined,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        const email = profile.emails?.[0]?.value;

        const tokenExpiry = params?.expires_in
          ? new Date(Date.now() + Number(params.expires_in) * 1000)
          : params?.expiry_date
            ? new Date(Number(params.expiry_date))
            : undefined;

        console.debug("[GoogleOAuth] callback received", {
          hasAccessToken: Boolean(accessToken),
          hasRefreshToken: Boolean(refreshToken),
          expiresIn: params?.expires_in ?? null,
          tokenExpiry: tokenExpiry?.toISOString() ?? null,
        });

        if (!email) {
          return done(new Error("No email found in Google profile"));
        }

        // Handle state token for account linking
        let userId: string | undefined;
        const state = req.query.state as string | undefined;
        if (state) {
          try {
            const decoded = jwt.verify(state, env.JWT_SECRET) as { userId: string };
            userId = decoded.userId;
            console.debug("[GoogleOAuth] Extracted userId from state for account linking:", userId);
          } catch (err) {
            console.warn("[GoogleOAuth] Invalid or expired state token:", err);
          }
        }

        const user = await authService.findOrCreateAccount({
          provider: "google",
          providerUserId: profile.id,
          email,
          name: profile.displayName,
          accessToken,
          refreshToken: refreshToken ?? undefined,
          tokenExpiry,
          userId,
        });

        // Generate our own JWT
        const token = jwtService.generate({
          userId: user.id,
          email: user.email,
        });

        return done(null, {
          user,
          token,
        });

      } catch (err) {
        console.error("Google Strategy Error:", err);
        return done(err as Error);
      }
    }
  )
);

export default passport;