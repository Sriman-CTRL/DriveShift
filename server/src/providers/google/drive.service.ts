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

    /**
     * Explicit export map for Google-native document types.
     * Only these four types are supported for export.
     * Any other google-apps.* type will throw a clear error.
     */
    private readonly GOOGLE_EXPORT_MAP: Record<string, { mimeType: string; extension: string }> = {
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

        if (existingMetadata) {
            originalMimeType = existingMetadata.mimeType;
            name = existingMetadata.name;
        } else {
            const metadata = await drive.files.get({
                fileId,
                fields: "name,mimeType,shortcutDetails",
            });

            // If the file is a shortcut, resolve it to the real target.
            if (
                metadata.data.mimeType ===
                "application/vnd.google-apps.shortcut"
            ) {
                const target = await this.resolveShortcut(
                    account,
                    fileId,
                    metadata.data.name!,
                    0,
                    5
                );

                // Fetch the actual target's metadata
                const targetMetadata = await drive.files.get({
                    fileId: target.id,
                    fields: "name,mimeType",
                });

                originalMimeType = targetMetadata.data.mimeType!;
                name = targetMetadata.data.name!;
            } else {
                originalMimeType = metadata.data.mimeType!;
                name = metadata.data.name!;
            }
        }

        console.log(`[migrate:file] Downloading "${name}" | mimeType: ${originalMimeType}`);

        if (originalMimeType === "application/vnd.google-apps.folder") {
            throw new Error("Folders cannot be downloaded directly as a stream");
        }

        let stream: any;
        let mimeType = originalMimeType;

        if (originalMimeType.startsWith("application/vnd.google-apps.")) {
            const exportConfig = this.GOOGLE_EXPORT_MAP[originalMimeType];

            if (!exportConfig) {
                // Unsupported Google-native type — do NOT attempt PDF fallback.
                console.log(`[migrate:file] Unsupported Google file type: ${originalMimeType}`);
                throw new Error(
                    `Unsupported Google-native file type for migration: "${name}" ` +
                    `(id: ${fileId}, mimeType: ${originalMimeType}). ` +
                    `Supported types: Google Docs, Sheets, Slides, Drawings.`
                );
            }

            console.log(`[migrate:file] Exporting "${name}" as ${exportConfig.mimeType}`);

            mimeType = exportConfig.mimeType;
            if (!name.toLowerCase().endsWith(exportConfig.extension)) {
                name = `${name}${exportConfig.extension}`;
            }

            const response = await drive.files.export(
                { fileId, mimeType: exportConfig.mimeType },
                { responseType: "stream" }
            );
            stream = response.data;
        } else {
            // Standard binary file — download directly.
            try {
                const response = await drive.files.get(
                    { fileId, alt: "media" },
                    { responseType: "stream" }
                );
                stream = response.data;
            } catch (downloadErr: any) {
                const reason =
                    downloadErr?.response?.data?.error?.errors?.[0]?.reason;

                if (reason === "cannotDownloadFile") {
                    // File owner has restricted downloads.
                    // Attempt a server-side copy — Drive copy() is not subject
                    // to the same restriction as alt=media downloads.
                    console.log(
                        `[migrate:file] Download restricted for "${name}", ` +
                        `attempting server-side copy as fallback...`
                    );

                    try {
                        const copyRes = await drive.files.copy({
                            fileId,
                            requestBody: {
                                name: `_driveshift_tmp_${Date.now()}_${name}`,
                            },
                            fields: "id",
                        });

                        const copyId = copyRes.data.id!;

                        const copyDownload = await drive.files.get(
                            { fileId: copyId, alt: "media" },
                            { responseType: "stream" }
                        );

                        // Delete the temp copy once the stream is fully consumed.
                        (copyDownload.data as Readable).on("close", () => {
                            drive.files
                                .delete({ fileId: copyId })
                                .catch((e: any) => {
                                    console.warn(
                                        `[migrate:file] Failed to delete temp copy ` +
                                        `${copyId}: ${e?.message}`
                                    );
                                });
                        });

                        stream = copyDownload.data;
                        console.log(
                            `[migrate:file] Server-side copy succeeded for "${name}"`
                        );
                    } catch {
                        throw new Error(
                            `"${name}" cannot be downloaded — the file owner has ` +
                            `restricted downloads and a server-side copy was also denied. ` +
                            `Ensure you have edit access to this file in the source Drive.`
                        );
                    }
                } else {
                    throw downloadErr;
                }
            }
        }

        return { stream, name, mimeType };
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
        // Resolve Google Drive shortcut to its real target before migrating.
        let resolvedFile = file;
        if (file.mimeType === "application/vnd.google-apps.shortcut") {
            resolvedFile = await this.resolveShortcut(sourceAccount, file.id, file.name);
            console.log(`[migrate:file] Downloading resolved target "${resolvedFile.name}"`);
        }

        // Note: downloadFile() already logs the download + export details.
        const downloaded = await this.downloadFile(
            sourceAccount,
            resolvedFile.id,
            resolvedFile
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

    /**
     * Recursively resolve a Google Drive shortcut to its real target file.
     * Follows shortcut chains up to `maxDepth` levels deep to prevent infinite loops.
     */
    private async resolveShortcut(
        account: GoogleAccountContext,
        fileId: string,
        name: string,
        depth = 0,
        maxDepth = 5
    ): Promise<{ id: string; name: string; mimeType: string }> {
        if (depth >= maxDepth) {
            throw new Error(
                `Shortcut resolution exceeded maximum depth (${maxDepth}) for "${name}" (id: ${fileId})`
            );
        }

        const { drive, accessToken, tokenExpiry } =
            await googleDriveClient.createClient(
                account.accessToken,
                account.refreshToken,
                account.tokenExpiry
            );

        await this.persistAccessToken(account, accessToken, tokenExpiry);

        // Fetch the shortcut to read its targetId.
        const shortcutRes = await drive.files.get({
            fileId,
            fields: "id,name,mimeType,shortcutDetails",
        });

        const targetId = (shortcutRes.data as any).shortcutDetails
            ?.targetId as string | undefined;

        if (!targetId) {
            throw new Error(
                `Shortcut "${name}" (id: ${fileId}) has no targetId`
            );
        }

        console.log(`[migrate:file] Resolving shortcut "${name}" -> ${targetId}`);

        // Fetch the target file metadata.
        const targetRes = await drive.files.get({
            fileId: targetId,
            fields: "id,name,mimeType,shortcutDetails",
        });

        const target = targetRes.data;

        console.log(
            `[migrate:file] Shortcut target: "${target.name}" | mimeType: ${target.mimeType}`
        );

        // If the target is itself a shortcut, recurse.
        if (target.mimeType === "application/vnd.google-apps.shortcut") {
            return this.resolveShortcut(
                account,
                target.id!,
                target.name!,
                depth + 1,
                maxDepth
            );
        }

        return {
            id: target.id!,
            name: target.name!,
            mimeType: target.mimeType!,
        };
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
        },
        /** Accumulates file-level failures across the entire recursive tree. */
        failedFiles: Array<{ id: string; name: string; mimeType: string; error: string }> = []
    ): Promise<{
        id?: string | null;
        name?: string | null;
        failedFiles: Array<{ id: string; name: string; mimeType: string; error: string }>;
    }> {
        console.log(
            `[migrate:folder] Fetching source folder metadata: ${sourceFolderId}`
        );

        let sourceFolder = await this.getFile(
            sourceAccount,
            sourceFolderId
        );

        // Resolve shortcuts
        if (
            sourceFolder.mimeType ===
            "application/vnd.google-apps.shortcut"
        ) {
            const targetId = (sourceFolder as any)?.shortcutDetails
                ?.targetId as string | undefined;

            if (targetId) {
                console.log(
                    `[migrate:folder] Resolving shortcut ${sourceFolderId} -> ${targetId}`
                );

                sourceFolderId = targetId;

                sourceFolder = await this.getFile(
                    sourceAccount,
                    targetId
                );
            }
        }

        // If the provided ID resolves to a file rather than a folder, migrate it
        // as a single file and return immediately.
        if (
            sourceFolder.mimeType !==
            "application/vnd.google-apps.folder"
        ) {
            console.log(
                `[migrate:folder] "${sourceFolderId}" is a file. Migrating as file.`
            );

            try {
                const uploaded = await this.migrateFileFromMetadata(
                    sourceAccount,
                    destAccount,
                    {
                        id: sourceFolderId,
                        name: sourceFolder.name!,
                        mimeType: sourceFolder.mimeType!,
                    },
                    destinationParentFolderId
                );

                progress.files++;
                if (onProgress) await onProgress({ ...progress });

                return { id: uploaded.id, name: uploaded.name, failedFiles };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[migrate:folder] ❌ Failed to migrate file "${sourceFolder.name}": ${msg}`);
                failedFiles.push({
                    id: sourceFolderId,
                    name: sourceFolder.name ?? sourceFolderId,
                    mimeType: sourceFolder.mimeType ?? "unknown",
                    error: msg,
                });
                // Still count as attempted so progress reflects it.
                progress.files++;
                if (onProgress) await onProgress({ ...progress });
                return { id: null, name: sourceFolder.name, failedFiles };
            }
        }

        // Create destination folder
        const destinationFolder = await this.createFolder(
            destAccount,
            sourceFolder.name!,
            destinationParentFolderId
        );

        console.log(
            `[migrate:folder] Created "${destinationFolder.name}"`
        );

        // Get children
        const children = await this.listChildren(
            sourceAccount,
            sourceFolderId
        );

        console.log(
            `[migrate:folder] Found ${children.length} children`
        );

        // Process children — errors on individual files are caught and collected;
        // the loop continues so the remaining files are not skipped.
        for (const child of children) {

            if (
                child.mimeType ===
                "application/vnd.google-apps.folder"
            ) {
                // Recurse into nested folder, sharing the same failedFiles array.
                await this.migrateFolder(
                    sourceAccount,
                    destAccount,
                    child.id!,
                    destinationFolder.id!,
                    onProgress,
                    progress,
                    failedFiles
                );

                // Folder counted as done after all its children are processed.
                progress.folders++;
                if (onProgress) await onProgress({ ...progress });

            } else {

                try {
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
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(
                        `[migrate:folder] ❌ Failed to migrate file "${child.name}" ` +
                        `(${child.id}, ${child.mimeType}): ${msg}`
                    );
                    failedFiles.push({
                        id: child.id!,
                        name: child.name ?? child.id ?? "unknown",
                        mimeType: child.mimeType ?? "unknown",
                        error: msg,
                    });
                }

                // Count the file as processed (whether it succeeded or failed)
                // so progress keeps advancing.
                progress.files++;
                if (onProgress) await onProgress({ ...progress });
            }
        }

        // Root folder itself is done after all its children are processed.
        progress.folders++;
        if (onProgress) await onProgress({ ...progress });

        console.log(
            `[migrate:folder] ✅ Completed "${sourceFolder.name}"` +
            (failedFiles.length > 0 ? ` (${failedFiles.length} file(s) skipped)` : "")
        );

        return { id: destinationFolder.id, name: destinationFolder.name, failedFiles };
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