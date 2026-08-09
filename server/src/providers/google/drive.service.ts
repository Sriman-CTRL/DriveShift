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
        mimeType: string,
        parentFolderId?: string
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
                parents: parentFolderId ? [parentFolderId] : undefined,
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
            q: "trashed = false",
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
        fileId: string,
        existingMetadata?: { name: string; mimeType: string }
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

        let originalMimeType: string;
        let name: string;

        // Skip metadata API call if metadata is already passed in
        if (existingMetadata) {
            originalMimeType = existingMetadata.mimeType;
            name = existingMetadata.name;
        } else {
            const metadata = await drive.files.get({
                fileId,
                fields: "name,mimeType",
            });
            originalMimeType = metadata.data.mimeType!;
            name = metadata.data.name!;
        }

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
    async migrateFileFromMetadata(
        sourceAccount: GoogleAccountContext,
        destAccount: GoogleAccountContext,
        file: {
            id: string;
            name: string;
            mimeType: string;
        },
        destParentFolderId?: string
    ) {
        console.log(`[migrate:file] Downloading "${file.name}" (${file.id}) | mimeType: ${file.mimeType}`);

        const downloaded = await this.downloadFile(
            sourceAccount,
            file.id,
            file
        );

        console.log(`[migrate:file] Uploading "${downloaded.name}" → dest folder: ${destParentFolderId ?? "(root)"}`);

        const result = await this.uploadStream(
            destAccount,
            downloaded.stream,
            downloaded.name,
            downloaded.mimeType,
            destParentFolderId
        );

        console.log(`[migrate:file] ✅ Uploaded "${downloaded.name}" → id: ${result.id}`);
        return result;
    }

    async migrateFile(
        sourceAccount: GoogleAccountContext,
        destAccount: GoogleAccountContext,
        fileId: string
    ) {
        const fileMetadata = await this.getFile(sourceAccount, fileId);

        return this.migrateFileFromMetadata(sourceAccount, destAccount, {
            id: fileId,
            name: fileMetadata.name!,
            mimeType: fileMetadata.mimeType!,
        });
    }
    async migrateFolder(
        sourceAccount: GoogleAccountContext,
        destAccount: GoogleAccountContext,
        sourceFolderId: string,
        destinationParentFolderId?: string,
        onProgress?: (progress: {
            files: number;
            folders: number;
        }) => Promise<void>,
        progress = {
            files: 0,
            folders: 0,
        }
    ) {
        console.log(
            `[migrate:folder] Fetching source folder metadata: ${sourceFolderId}`
        );

        const sourceFolder = await this.getFile(
            sourceAccount,
            sourceFolderId
        );

        if (
            sourceFolder.mimeType !==
            "application/vnd.google-apps.folder"
        ) {
            throw new Error(
                `The provided ID "${sourceFolderId}" is not a folder.`
            );
        }

        const destinationFolder = await this.createFolder(
            destAccount,
            sourceFolder.name!,
            destinationParentFolderId
        );

        progress.folders++;

        if (onProgress) {
            await onProgress({ ...progress });
        }

        console.log(
            `[migrate:folder] Created "${destinationFolder.name}"`
        );

        const children = await this.listChildren(
            sourceAccount,
            sourceFolderId
        );

        for (const child of children) {
            if (
                child.mimeType ===
                "application/vnd.google-apps.folder"
            ) {
                await this.migrateFolder(
                    sourceAccount,
                    destAccount,
                    child.id!,
                    destinationFolder.id!,
                    onProgress,
                    progress
                );
            } else {
                await this.migrateFileFromMetadata(
                    sourceAccount,
                    destAccount,
                    {
                        id: child.id!,
                        name: child.name!,
                        mimeType: child.mimeType!,
                    },
                    destinationFolder.id!
                );

                progress.files++;

                if (onProgress) {
                    await onProgress({ ...progress });
                }
            }
        }

        console.log(
            `[migrate:folder] ✅ Completed "${sourceFolder.name}"`
        );

        return destinationFolder;
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
    async listChildren(
        account: GoogleAccountContext,
        folderId: string
    ) {
        console.log(`[listChildren] Querying children of folder: ${folderId}`);

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
            q: `'${folderId}' in parents and trashed = false`,
            fields:
                "files(id,name,mimeType,size,parents)",
            orderBy: "folder,name",
        });

        const files = response.data.files ?? [];
        console.log(`[listChildren] Got ${files.length} items for folder ${folderId}`);
        return files;
    }


    async createFolder(
        account: GoogleAccountContext,
        folderName: string,
        parentFolderId?: string
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
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: parentFolderId ? [parentFolderId] : undefined,
            },
            fields: "id,name",
        });

        return response.data;
    }

}

export const googleDriveService = new GoogleDriveService();