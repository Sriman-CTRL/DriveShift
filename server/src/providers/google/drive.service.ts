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

    async getFile(
        accessToken: string,
        fileId: string
    ) {

        const drive =
            googleDriveClient.createClient(accessToken);

        const response =
            await drive.files.get({

                fileId,

                fields:
                    "id,name,mimeType,size,createdTime,modifiedTime,owners",

            });

        return response.data;

    }

}

export const googleDriveService =
    new GoogleDriveService();