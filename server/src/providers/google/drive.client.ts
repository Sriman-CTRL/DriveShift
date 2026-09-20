import { google } from "googleapis";
import { env } from "../../config/env";

export class GoogleDriveClient {
    async createClient(
        accessToken?: string | null,
        refreshToken?: string | null,
        tokenExpiry?: Date | null
    ) {
        const auth = new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET,
            env.GOOGLE_CALLBACK_URL
        );

        auth.setCredentials({
            access_token: accessToken ?? undefined,
            refresh_token: refreshToken ?? undefined,
            expiry_date: tokenExpiry ? tokenExpiry.getTime() : undefined,
        });

        // Refresh the access token if it has expired (or is about to).
        // getAccessToken() returns the existing token when still valid,
        // or transparently fetches a new one using the refresh token.
        const tokenResponse = await auth.getAccessToken();
        const currentAccessToken = tokenResponse.token ?? accessToken ?? null;
        const currentTokenExpiry = auth.credentials.expiry_date
            ? new Date(auth.credentials.expiry_date)
            : tokenExpiry ?? null;

        return {
            drive: google.drive({
                version: "v3",
                auth,
            }),
            accessToken: currentAccessToken,
            tokenExpiry: currentTokenExpiry,
        };
    }
}

export const googleDriveClient = new GoogleDriveClient();