import { googleDriveClient } from "./drive.client";
import { Readable } from "stream";
import prisma from "../../config/prisma";

type GoogleAccountContext = {
    accessToken: string | null;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
    userId: string;
    providerUserId: string;
};

class GoogleDriveService {
    private async persistAccessToken(account: GoogleAccountContext, accessToken: string | null, tokenExpiry?: Date | null) {
        if (!accessToken) {
            return;
        }

        if (account.accessToken === accessToken && account.tokenExpiry?.getTime() === tokenExpiry?.getTime()) {
            return;
        }

        await prisma.connectedAccount.update({
            where: {
                provider_providerUserId: {
                    provider: "google",
                    providerUserId: account.providerUserId,
                },
            },
            data: {
                accessToken,
                tokenExpiry,
            },
        });
    }

    async uploadFile(account: GoogleAccountContext, file: Express.Multer.File) {
        const { drive, accessToken, tokenExpiry } = await googleDriveClient.createClient(
            account.accessToken,
            account.refreshToken,
            account.tokenExpiry
        );

        await this.persistAccessToken(account, accessToken, tokenExpiry);

        const stream = Readable.from(file.buffer);

        const response = await drive.files.create({
            requestBody: {
                name: file.originalname,
            },
            media: {
                mimeType: file.mimetype,
                body: stream,
            },
        });

        return response.data;
    }

    async listFiles(account: GoogleAccountContext) {
        const { drive, accessToken, tokenExpiry } = await googleDriveClient.createClient(
            account.accessToken,
            account.refreshToken,
            account.tokenExpiry
        );

        await this.persistAccessToken(account, accessToken, tokenExpiry);

        const response = await drive.files.list({
            pageSize: 20,
            fields: "files(id,name,mimeType,size)",
        });

        return response.data.files;
    }

    async getFile(account: GoogleAccountContext, fileId: string) {
        const { drive, accessToken, tokenExpiry } = await googleDriveClient.createClient(
            account.accessToken,
            account.refreshToken,
            account.tokenExpiry
        );

        await this.persistAccessToken(account, accessToken, tokenExpiry);

        const response = await drive.files.get({
            fileId,
            fields: "id,name,mimeType,size,createdTime,modifiedTime,owners",
        });

        return response.data;
    }

    async downloadFile(account: GoogleAccountContext, fileId: string) {
        const { drive, accessToken, tokenExpiry } = await googleDriveClient.createClient(
            account.accessToken,
            account.refreshToken,
            account.tokenExpiry
        );

        await this.persistAccessToken(account, accessToken, tokenExpiry);

        const response = await drive.files.get(
            {
                fileId,
                alt: "media",
            },
            {
                responseType: "stream",
            }
        );

        return response.data;
    }
}

export const googleDriveService = new GoogleDriveService();