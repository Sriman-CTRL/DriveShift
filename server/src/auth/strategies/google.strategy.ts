import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "../../config/env";
import { authService } from "../auth.service";
import { jwtService } from "../../services/jwt.service";

passport.use(
    new GoogleStrategy(
        {
            clientID: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            callbackURL: env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const user = await authService.findOrCreateAccount({
                    provider: "google",
                    providerUserId: profile.id,
                    email: profile.emails![0].value,
                    name: profile.displayName,
                });

                const token = jwtService.generateToken({
                    userId: user.id,
                    email: user.email,
                });

                return done(null, {
                    user,
                    token,
                });
            } catch (error) {
                return done(error as Error);
            }
        }
    )
);