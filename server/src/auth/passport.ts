import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "../config/env.js";
import { authService } from "./auth.service.js";
import { jwtService } from "../services/jwt.service.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error("No email found in Google profile"));
        }

        const user = await authService.findOrCreateAccount({
          provider: "google",
          providerUserId: profile.id,
          email,
          name: profile.displayName,
          accessToken,
          refreshToken: refreshToken ?? undefined,
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