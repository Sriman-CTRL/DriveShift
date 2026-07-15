import { googleDriveClient } from "./drive.client";

class GoogleDriveService {

    async listFiles(accessToken: string) {

        const drive =
            googleDriveClient.createClient(accessToken);

        const response =
            await drive.files.list({
                pageSize: 20,
                fields: "files(id,name,mimeType,size)",
            });

        return response.data.files;

    }

}

export const googleDriveService =
    new GoogleDriveService();