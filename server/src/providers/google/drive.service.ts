import { googleDriveClient } from "./drive.client";
import { Readable } from "stream";
import prisma from "../../config/prisma";

export type GoogleAccountContext = {
    accessToken: string | null;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
    userId: string;
    providerUserId: string;
};

class GoogleDriveService {
    private async persistAccessToken(
        account: GoogleAccountContext,
        accessToken: string | null,
        tokenExpiry?: Date | null
    ) {
        if (!accessToken) {
            return;
        }

        if (
            account.accessToken === accessToken &&
            account.tokenExpiry?.getTime() === tokenExpiry?.getTime()
        ) {
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

    async uploadStream(
        account: GoogleAccountContext,
        stream: Readable,
        fileName: string,
        mimeType: string
    ) {
        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(
            account,
            accessToken,
            tokenExpiry
        );

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
            },
            media: {
                mimeType,
                body: stream,
            },
            fields: "id,name,mimeType",
        });

        return response.data;
    }

    async uploadFile(
        account: GoogleAccountContext,
        file: Express.Multer.File
    ) {
        const stream = Readable.from(file.buffer);

        return this.uploadStream(
            account,
            stream,
            file.originalname,
            file.mimetype
        );
    }

    async listFiles(account: GoogleAccountContext) {
        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(
            account,
            accessToken,
            tokenExpiry
        );

        const response = await drive.files.list({
            pageSize: 20,
            fields: "files(id,name,mimeType,size)",
        });

        return response.data.files;
    }

    async getFile(
        account: GoogleAccountContext,
        fileId: string
    ) {
        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(
            account,
            accessToken,
            tokenExpiry
        );

        const response = await drive.files.get({
            fileId,
            fields:
                "id,name,mimeType,size,createdTime,modifiedTime,owners",
        });

        return response.data;
    }

    async downloadFile(
        account: GoogleAccountContext,
        fileId: string
    ) {
        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(
            account,
            accessToken,
            tokenExpiry
        );

        // Get metadata to determine file type
        const metadata = await drive.files.get({
            fileId,
            fields: "name,mimeType",
        });

        const originalMimeType = metadata.data.mimeType!;
        let name = metadata.data.name!;
        let stream: any;
        let mimeType = originalMimeType;

        if (originalMimeType === "application/vnd.google-apps.folder") {
            throw new Error("Folders cannot be downloaded directly as a stream");
        }

        if (originalMimeType.startsWith("application/vnd.google-apps.")) {
            // Document types that require Google Drive API export conversion
            const googleDocsExportMap: Record<string, { mimeType: string; extension: string }> = {
                "application/vnd.google-apps.document": {
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    extension: ".docx",
                },
                "application/vnd.google-apps.spreadsheet": {
                    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    extension: ".xlsx",
                },
                "application/vnd.google-apps.presentation": {
                    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    extension: ".pptx",
                },
                "application/vnd.google-apps.drawing": {
                    mimeType: "image/png",
                    extension: ".png",
                },
            };

            const exportConfig = googleDocsExportMap[originalMimeType] || {
                mimeType: "application/pdf",
                extension: ".pdf",
            };

            mimeType = exportConfig.mimeType;
            if (!name.toLowerCase().endsWith(exportConfig.extension)) {
                name = `${name}${exportConfig.extension}`;
            }

            const response = await drive.files.export(
                {
                    fileId,
                    mimeType: exportConfig.mimeType,
                },
                {
                    responseType: "stream",
                }
            );
            stream = response.data;
        } else {
            // Standard binary file download
            const response = await drive.files.get(
                {
                    fileId,
                    alt: "media",
                },
                {
                    responseType: "stream",
                }
            );
            stream = response.data;
        }

        return {
            stream,
            name,
            mimeType,
        };
    }
    async migrateFile(
        sourceAccount: GoogleAccountContext,
        destAccount: GoogleAccountContext,
        fileId: string
    ) {
        const downloaded = await this.downloadFile(
            sourceAccount,
            fileId
        );

        return this.uploadStream(
            destAccount,
            downloaded.stream,
            downloaded.name,
            downloaded.mimeType
        );
    }
    async deleteFile(
        account: GoogleAccountContext,
        fileId: string
    ) {
        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(
            account,
            accessToken,
            tokenExpiry
        );

        await drive.files.delete({
            fileId,
        });
    }



}

export const googleDriveService = new GoogleDriveService();