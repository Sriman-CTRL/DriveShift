import { google } from "googleapis";
import { env } from "../../config/env";

const maskToken = (value?: string | null) => {
    if (!value) return "none";
    return `${value.slice(0, 6)}...${value.slice(-4)} (len=${value.length})`;
};

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

        const oauth2 = google.oauth2({
    version: "v2",
    auth,
});

try {
    const me = await oauth2.userinfo.get();
    console.log("Authenticated Google User:", me.data.email);
} catch (err) {
    console.error("OAuth Test Failed:", err);
}

        console.debug("[GoogleDriveClient] credentials prepared", {
            accessToken: maskToken(accessToken),
            refreshToken: maskToken(refreshToken),
            tokenExpiry: tokenExpiry?.toISOString() ?? null,
        });
        

        const tokenResponse = await auth.getAccessToken();
        const currentAccessToken = tokenResponse.token ?? accessToken ?? null;
        const currentTokenExpiry = auth.credentials.expiry_date
            ? new Date(auth.credentials.expiry_date)
            : tokenExpiry ?? null;

        console.debug("[GoogleDriveClient] access token ready", {
            accessToken: maskToken(currentAccessToken),
            tokenExpiry: currentTokenExpiry?.toISOString() ?? null,
        });

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