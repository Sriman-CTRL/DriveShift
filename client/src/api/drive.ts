import { api } from './client';
import type { DriveFile } from '../types';

export const driveApi = {
  listFiles: (accountId: string) =>
    api.get<{ files: DriveFile[] }>(`/drive/files?accountId=${accountId}`),

  getFile: (fileId: string, accountId: string) =>
    api.get<DriveFile>(`/drive/files/${fileId}?accountId=${accountId}`),
};
