import { google } from "googleapis";

export class GoogleDriveClient {
    createClient(accessToken: string) {
        const auth = new google.auth.OAuth2();

        auth.setCredentials({
            access_token: accessToken,
        });

        return google.drive({
            version: "v3",
            auth,
        });
    }
}

export const googleDriveClient = new GoogleDriveClient();